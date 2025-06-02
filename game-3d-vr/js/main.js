import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

class PenaltyVRGame {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // Game state
        this.goalkeeperScore = 0;
        this.shooterScore = 0;
        this.round = 1;
        this.maxScore = 7;
        this.gameActive = true;
        this.ballInPlay = false;
        this.countdownActive = false;
        this.countdownValue = 3;
        this.vrMenuVisible = false; // Track menu visibility

        // Game objects
        this.ball = null;
        this.goal = null;
        this.stadium = null;
        this.shooter = null;
        this.hands = { left: null, right: null };

        // Animación de Mixamo
        this.mixer = null;
        this.kickAction = null;

        // Physics
        this.ballVelocity = new THREE.Vector3();
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // VR Controllers
        this.controllers = [];
        this.controllerGrips = [];
        this.menuRaycasters = []; // Not directly used in this improved menu approach, but kept.

        // 3D UI elements
        this.vrMenuMesh = null;
        this.countdownMesh = null;
        this.scoreDisplayMesh = null; // New mesh for the score
        this.gameOverMesh = null; // New mesh for game over screen

        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupVR();
        this.setupLighting();
        this.createStadium();
        this.createGoal();
        this.createBall();
        this.createShooter();
        this.createHands();
        this.setupEventListeners();
        this.setup3DUI(); // New method to set up 3D UI
        this.startGameLoop();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, -8);
        this.camera.lookAt(new THREE.Vector3(0, 1.6, 8));
        this.scene.add(this.camera);
    }

    setupRenderer() {
        const container = document.getElementById('container') || document.body;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType('local-floor');
        container.appendChild(this.renderer.domElement);
    }

    setupVR() {
        // Keep the VR button for desktop users to easily enter/exit VR
        const vrButton = document.createElement('button');
        vrButton.style.position = 'absolute';
        vrButton.style.bottom = '20px';
        vrButton.style.right = '20px';
        vrButton.style.padding = '12px 24px';
        vrButton.style.border = 'none';
        vrButton.style.borderRadius = '6px';
        vrButton.style.background = '#007bff';
        vrButton.style.color = 'white';
        vrButton.style.fontSize = '16px';
        vrButton.style.cursor = 'pointer';
        vrButton.innerHTML = 'Iniciar VR';

        vrButton.onclick = () => {
            if (this.renderer.xr.isPresenting) {
                this.renderer.xr.getSession().end();
            } else {
                if ('xr' in navigator) {
                    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                        if (supported) {
                            navigator.xr.requestSession('immersive-vr', {
                                requiredFeatures: ['local-floor'],
                                optionalFeatures: ['hand-tracking', 'bounded-floor']
                            }).then((session) => {
                                this.renderer.xr.setSession(session);
                                // Hide 2D menu when in VR
                                if (this.vrMenu) this.vrMenu.style.display = 'none';
                                if (this.countdownElement) this.countdownElement.style.display = 'none';
                                if (document.getElementById('score-display')) document.getElementById('score-display').style.display = 'none';
                                if (document.getElementById('gameOver')) document.getElementById('gameOver').style.display = 'none';

                                // Show 3D UI
                                this.vrMenuVisible = false; // Start with menu hidden
                                this.vrMenuMesh.visible = false;
                                this.scoreDisplayMesh.visible = true; // Score always visible in VR
                                this.countdownMesh.visible = false;
                                this.gameOverMesh.visible = false;

                            }).catch((error) => {
                                console.warn('Error al iniciar sesión VR:', error);
                                alert('No se pudo iniciar la sesión VR. Jugando en modo desktop.');
                                this.handleExitVR();
                            });
                        } else {
                            console.warn('VR inmersivo no soportado');
                            alert('VR no soportado en este dispositivo. Jugando en modo desktop.');
                            this.handleExitVR();
                        }
                    });
                } else {
                    console.warn('WebXR no disponible');
                    alert('WebXR no disponible. Jugando en modo desktop.');
                    this.handleExitVR();
                }
            }
        };
        document.body.appendChild(vrButton);

        // Add event listener for VR session ending
        this.renderer.xr.addEventListener('sessionend', () => this.handleExitVR());


        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', () => this.onControllerSelect(i));
            controller.addEventListener('selectend', () => this.onControllerRelease(i));
            // Listen for 'squeezestart' on the right controller (index 1) for button 'B'
            // The 'squeezestart' event generally maps to the grip/squeeze button.
            // For a specific button like 'B', you need to check the gamepad button index.
            // The 'B' button on the right Quest 3 controller is usually button 4 or 5.
            // We'll add a 'gamepad' event listener in the animate loop for more precise control.
            this.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            this.scene.add(grip);
            this.controllerGrips.push(grip);
        }
    }

    // New method to handle exiting VR, show 2D UI
    handleExitVR() {
        if (!this.renderer.xr.isPresenting) {
            if (this.vrMenu) this.vrMenu.style.display = 'flex'; // Show 2D menu
            if (this.countdownElement) this.countdownElement.style.display = 'block'; // Show 2D countdown
            if (document.getElementById('score-display')) document.getElementById('score-display').style.display = 'block';
            if (document.getElementById('gameOver')) document.getElementById('gameOver').style.display = 'block';

            // Hide 3D UI
            this.vrMenuMesh.visible = false;
            this.countdownMesh.visible = false;
            this.scoreDisplayMesh.visible = false;
            this.gameOverMesh.visible = false;
        }
    }

    // Helper to create a 3D plane from an HTML element
    create3DUIFromHTMLElement(element, width, height, position, rotation = new THREE.Euler()) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const resolution = 200; // Pixels per unit, adjust for quality
        canvas.width = width * resolution;
        canvas.height = height * resolution;

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.copy(rotation);
        mesh.visible = false; // Hidden by default

        // Function to update the canvas texture with the latest HTML content
        const updateTexture = () => {
            const tempDiv = document.createElement('div');
            tempDiv.style.width = `${canvas.width}px`;
            tempDiv.style.height = `${canvas.height}px`;
            tempDiv.style.backgroundColor = 'rgba(0,0,0,0.7)'; // Match original background
            tempDiv.style.padding = '20px';
            tempDiv.style.borderRadius = '10px';
            tempDiv.style.boxSizing = 'border-box';
            tempDiv.style.color = 'white';
            tempDiv.style.display = 'flex';
            tempDiv.style.flexDirection = 'column';
            tempDiv.style.justifyContent = 'center';
            tempDiv.style.alignItems = 'center';
            tempDiv.style.fontFamily = 'sans-serif';
            tempDiv.innerHTML = element.innerHTML;

            // Render the HTML to the canvas
            html2canvas(tempDiv, {
                backgroundColor: null, // Transparent background for the main canvas
                width: canvas.width,
                height: canvas.height,
                scale: 1,
                logging: false,
                useCORS: true // Important for images if any
            }).then(renderCanvas => {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(renderCanvas, 0, 0);
                texture.needsUpdate = true;
            }).catch(err => {
                console.error("Error rendering HTML to canvas:", err);
            });
        };

        // MutationObserver to automatically update texture when HTML content changes
        const observer = new MutationObserver(updateTexture);
        observer.observe(element, { childList: true, subtree: true, attributes: true });

        // Initial update
        updateTexture();

        return { mesh, updateTexture };
    }


    setup3DUI() {
        // You'll need the html2canvas library for this to work.
        // Make sure to include it in your HTML:
        // <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>

        // Get your original HTML elements
        this.vrMenu = document.getElementById('vrMenu');
        this.countdownElement = document.getElementById('countdown');
        const scoreDisplayElement = document.getElementById('score-display');
        const gameOverElement = document.getElementById('gameOver');

        // Create 3D versions of your UI elements
        // Positions relative to the camera (e.g., in front of the camera, slightly above)
        // Adjust these values for optimal placement in VR
        const menuWidth = 2.0; // Width in Three.js units
        const menuHeight = 1.5; // Height in Three.js units
        const menuPosition = new THREE.Vector3(0, 0.5, -2); // In front, slightly up

        const countdownWidth = 0.8;
        const countdownHeight = 0.4;
        const countdownPosition = new THREE.Vector3(-0.8, 0.7, -1.5); // Top-left corner

        const scoreWidth = 1.0;
        const scoreHeight = 0.3;
        const scorePosition = new THREE.Vector3(0.8, 0.7, -1.5); // Top-right corner

        const gameOverWidth = 2.5;
        const gameOverHeight = 1.5;
        const gameOverPosition = new THREE.Vector3(0, 0.5, -2);


        const vrMenu3D = this.create3DUIFromHTMLElement(this.vrMenu, menuWidth, menuHeight, menuPosition);
        this.vrMenuMesh = vrMenu3D.mesh;
        this.camera.add(this.vrMenuMesh); // Attach to camera
        this.vrMenuUpdateTexture = vrMenu3D.updateTexture; // Store the update function

        const countdown3D = this.create3DUIFromHTMLElement(this.countdownElement, countdownWidth, countdownHeight, countdownPosition);
        this.countdownMesh = countdown3D.mesh;
        this.camera.add(this.countdownMesh); // Attach to camera
        this.countdownUpdateTexture = countdown3D.updateTexture; // Store the update function

        const scoreDisplay3D = this.create3DUIFromHTMLElement(scoreDisplayElement, scoreWidth, scoreHeight, scorePosition);
        this.scoreDisplayMesh = scoreDisplay3D.mesh;
        this.camera.add(this.scoreDisplayMesh); // Attach to camera
        this.scoreDisplayUpdateTexture = scoreDisplay3D.updateTexture;

        const gameOver3D = this.create3DUIFromHTMLElement(gameOverElement, gameOverWidth, gameOverHeight, gameOverPosition);
        this.gameOverMesh = gameOver3D.mesh;
        this.camera.add(this.gameOverMesh); // Attach to camera
        this.gameOverUpdateTexture = gameOver3D.updateTexture;

        // Event listeners for the buttons on the HTML elements (these will work when rendered as textures)
        // You'll need to use a Raycaster to interact with these buttons in VR.
        // For simplicity in this example, we'll keep the buttons' actions tied to the class methods.
        // The `html2canvas` rendering makes click detection a bit more complex.
        // A better VR UI solution would use a library like `three-mesh-ui` for proper interactable 3D UI.
        // For now, assume the buttons are clicked via controller rays for a more complete VR UI.
        // We'll manage visibility based on controller input directly.

        // Initial visibility
        this.vrMenuMesh.visible = false;
        this.countdownMesh.visible = false;
        this.scoreDisplayMesh.visible = false; // Hide score until VR is active
        this.gameOverMesh.visible = false;


        // Set up the listeners for the original HTML buttons which will be called by our
        // custom interaction logic for 3D UI.
        const pauseBtn = document.getElementById('pauseBtn');
        const restartBtn = document.getElementById('restartBtn');
        const startRoundBtn = document.getElementById('startRoundBtn');

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        } else {
            console.error('ERROR: Botón pauseBtn no encontrado');
        }

        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restart());
        } else {
            console.error('ERROR: Botón restartBtn no encontrado');
        }

        if (startRoundBtn) {
            startRoundBtn.addEventListener('click', () => this.startPenalty());
        } else {
            console.error('ERROR: Botón startRoundBtn no encontrado');
        }
    }

    // Modified toggleVRMenu to work with 3D mesh visibility
    toggleVRMenu() {
        // Only toggle if in VR mode
        if (this.renderer.xr.isPresenting) {
            this.vrMenuVisible = !this.vrMenuVisible;
            this.vrMenuMesh.visible = this.vrMenuVisible;
            this.gameActive = !this.vrMenuVisible; // Pause game when menu is open
        } else {
            // Keep existing behavior for desktop
            this.vrMenuVisible = !this.vrMenuVisible;
            if (this.vrMenu) {
                this.vrMenu.style.display = this.vrMenuVisible ? 'flex' : 'none';
            }
        }
    }

    togglePause() {
        // In VR, pausing is tied to the menu being open
        if (this.renderer.xr.isPresenting) {
            // No direct pause button needed for 3D UI, opening menu pauses
            // The `toggleVRMenu` method will handle pausing/unpausing
        } else {
            this.gameActive = !this.gameActive;
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) {
                pauseBtn.textContent = this.gameActive ? '⏸ Pausa' : '▶ Continuar';
            }
        }
    }

    startCountdown() {
        this.countdownActive = true;
        this.countdownValue = 3;

        if (this.renderer.xr.isPresenting) {
            this.countdownMesh.visible = true;
            this.countdownElement.textContent = this.countdownValue; // Update hidden HTML for texture
            this.countdownUpdateTexture(); // Update 3D texture
        } else {
            if (!this.countdownElement || !this.countdownElement.style) {
                console.error('Elemento countdown no disponible, continuando sin UI');
                this.executePenalty();
                return;
            }
            this.countdownElement.style.display = 'block';
            this.countdownElement.textContent = this.countdownValue;
        }

        this.updateCountdown();
    }

    updateCountdown() {
        if (this.countdownValue > 0) {
            if (this.renderer.xr.isPresenting) {
                this.countdownElement.textContent = this.countdownValue;
                this.countdownUpdateTexture();
            } else {
                this.countdownElement.textContent = this.countdownValue;
            }
            this.countdownValue--;
            setTimeout(() => this.updateCountdown(), 1000);
        } else {
            if (this.renderer.xr.isPresenting) {
                this.countdownElement.textContent = '¡YA!';
                this.countdownUpdateTexture();
                setTimeout(() => {
                    this.countdownMesh.visible = false;
                    this.countdownActive = false;
                    this.executePenalty();
                }, 500);
            } else {
                if (this.countdownElement) {
                    this.countdownElement.textContent = '¡YA!';
                    setTimeout(() => {
                        this.countdownElement.style.display = 'none';
                        this.countdownActive = false;
                        this.executePenalty();
                    }, 500);
                }
            }
        }
    }

    executePenalty() {
        this.resetBallPosition();

        if (this.kickAction) {
            this.kickAction.reset();
            this.kickAction.play();
            setTimeout(() => {
                this.shootBall();
            }, this.kickAction.getClip().duration * 1000 * 0.5);
        } else {
            setTimeout(() => {
                this.shootBall();
            }, 1000);
        }
    }

    shootBall() {
        if (!this.gameActive) return;

        this.ballInPlay = true;

        const targetX = (Math.random() - 0.5) * 6;
        const targetY = Math.random() * 2 + 0.5;
        const power = 18 + Math.random() * 10;

        const direction = new THREE.Vector3(targetX, targetY, -12).sub(this.ball.position).normalize();
        this.ballVelocity = direction.multiplyScalar(power);

        this.ballVelocity.x += (Math.random() - 0.5) * 3;
        this.ballVelocity.y += Math.random() * 4;
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -50;
        directionalLight.shadow.camera.right = 50;
        directionalLight.shadow.camera.top = 50;
        directionalLight.shadow.camera.bottom = -50;
        this.scene.add(directionalLight);
    }

    createStadium() {
        const groundGeometry = new THREE.PlaneGeometry(100, 100);

        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4CAF50 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('./map/piso.jpg',
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(10, 10);
                ground.material.map = texture;
                ground.material.needsUpdate = true;
            },
            undefined,
            (error) => {
                console.warn('No se pudo cargar la textura del piso, usando color sólido');
            }
        );

        const wallHeight = 10;
        const wallGeometry = new THREE.BoxGeometry(100, wallHeight, 1);
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });

        const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
        backWall.position.set(0, wallHeight / 2, -50);
        this.scene.add(backWall);

        const sideWallGeometry = new THREE.BoxGeometry(1, wallHeight, 100);
        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        leftWall.position.set(-50, wallHeight / 2, 0);
        this.scene.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        rightWall.position.set(50, wallHeight / 2, 0);
        this.scene.add(rightWall);
    }

    createGoal() {
        const goalGroup = new THREE.Group();

        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2.44);
        const postMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

        const leftPost = new THREE.Mesh(postGeometry, postMaterial);
        leftPost.position.set(-3.66, 1.22, -12);
        leftPost.castShadow = true;
        goalGroup.add(leftPost);

        const rightPost = new THREE.Mesh(postGeometry, postMaterial);
        rightPost.position.set(3.66, 1.22, -12);
        rightPost.castShadow = true;
        goalGroup.add(rightPost);

        const crossbarGeometry = new THREE.CylinderGeometry(0.1, 0.1, 7.32);
        const crossbar = new THREE.Mesh(crossbarGeometry, postMaterial);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, 2.44, -12);
        crossbar.castShadow = true;
        goalGroup.add(crossbar);

        const netGeometry = new THREE.PlaneGeometry(7.32, 2.44);
        const netMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });
        const net = new THREE.Mesh(netGeometry, netMaterial);
        net.position.set(0, 1.22, -12.1);
        goalGroup.add(net);

        this.goal = goalGroup;
        this.scene.add(this.goal);
    }

    createBall() {
        const ballGeometry = new THREE.SphereGeometry(0.11, 32, 32);
        const ballMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.castShadow = true;
        this.resetBallPosition();
        this.scene.add(this.ball);
    }

    createShooter() {
        const loader = new FBXLoader();
        loader.load('./npc/jugador.fbx',
            (fbx) => {
                fbx.scale.setScalar(0.01);
                fbx.position.set(0, 0, 8);
                fbx.rotation.y = Math.PI;

                fbx.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        if (child.material && child.material.map) {
                            const simpleMaterial = new THREE.MeshLambertMaterial({
                                map: child.material.map
                            });
                            child.material = simpleMaterial;
                        }
                    }
                });

                this.shooter = fbx;
                this.scene.add(this.shooter);
                this.setupAnimation(fbx);
            },
            (progress) => {
                console.log('Cargando modelo FBX:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error al cargar el modelo FBX:', error);
                this.createDefaultShooter();
            }
        );
    }

    setupAnimation(fbx) {
        if (fbx.animations && fbx.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(fbx);

            const kickAnimation = fbx.animations.find(anim =>
                anim.name.toLowerCase().includes('kick') ||
                anim.name.toLowerCase().includes('shoot') ||
                anim.name.toLowerCase().includes('penalty')
            ) || fbx.animations[0];

            if (kickAnimation) {
                this.kickAction = this.mixer.clipAction(kickAnimation);
                this.kickAction.setLoop(THREE.LoopOnce);
                this.kickAction.clampWhenFinished = true;
            }

            console.log('Animaciones disponibles:', fbx.animations.map(anim => anim.name));
        } else {
            console.warn('No se encontraron animaciones en el modelo FBX');
        }
    }

    createDefaultShooter() {
        const shooterGroup = new THREE.Group();

        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.2);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x0066cc });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.2;
        shooterGroup.add(body);

        const headGeometry = new THREE.SphereGeometry(0.2);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2;
        shooterGroup.add(head);

        const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.8);
        const armMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.5, 1.2, 0);
        leftArm.rotation.z = Math.PI / 6;
        shooterGroup.add(leftArm);

        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.5, 1.2, 0);
        rightArm.rotation.z = -Math.PI / 6;
        shooterGroup.add(rightArm);

        const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1);
        const legMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.2, 0.5, 0);
        shooterGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.2, 0.5, 0);
        rightLeg.position.set(0.2, 0.5, 0);
        shooterGroup.add(rightLeg);

        shooterGroup.position.set(0, 0, 8);
        this.shooter = shooterGroup;
        this.scene.add(this.shooter);

        console.log('Usando modelo de shooter por defecto');
    }

    createHands() {
        const handGeometry = new THREE.SphereGeometry(0.1);
        const handMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5
        });

        this.hands.left = new THREE.Mesh(handGeometry, handMaterial);
        this.hands.right = new THREE.Mesh(handGeometry, handMaterial);

        this.scene.add(this.hands.left);
        this.scene.add(this.hands.right);
    }

    resetBallPosition() {
        this.ball.position.set(0, 0.11, 7.5);
        this.ballVelocity.set(0, 0, 0);
        this.ballInPlay = false;

        if (this.kickAction) {
            this.kickAction.stop();
        }
    }

    startPenalty() {
        if (!this.gameActive || this.countdownActive) return;
        this.startCountdown();
    }

    updateBall(deltaTime) {
        if (!this.ballInPlay) return;

        this.ballVelocity.add(this.gravity.clone().multiplyScalar(deltaTime));

        const deltaPosition = this.ballVelocity.clone().multiplyScalar(deltaTime);
        this.ball.position.add(deltaPosition);

        if (this.ball.position.y <= 0.11) {
            this.ball.position.y = 0.11;
            this.ballVelocity.y = Math.abs(this.ballVelocity.y) * 0.6;
            this.ballVelocity.x *= 0.8;
            this.ballVelocity.z *= 0.8;
        }

        if (this.ball.position.z <= -12) {
            if (Math.abs(this.ball.position.x) <= 3.66 && this.ball.position.y <= 2.44) {
                this.shooterScore++;
                this.updateScore();
                this.ballInPlay = false;
                setTimeout(() => this.nextRound(), 2000);
            } else {
                this.ballVelocity.z = Math.abs(this.ballVelocity.z) * 0.8;
            }
        }

        this.checkHandCollision();

        if (this.ball.position.z < -20 || this.ball.position.y < -5) {
            this.ballInPlay = false;
            setTimeout(() => this.nextRound(), 1000);
        }
    }

    checkHandCollision() {
        const ballPosition = this.ball.position;
        const ballRadius = 0.11;
        const handRadius = 0.1;

        [this.hands.left, this.hands.right].forEach(hand => {
            if (hand && hand.position) {
                const distance = ballPosition.distanceTo(hand.position);
                if (distance < ballRadius + handRadius && this.ballInPlay) {
                    this.goalkeeperScore++;
                    this.updateScore();
                    this.ballInPlay = false;

                    hand.material.color.setHex(0x00ff00);
                    setTimeout(() => {
                        hand.material.color.setHex(0xff0000);
                    }, 500);

                    setTimeout(() => this.nextRound(), 2000);
                }
            }
        });
    }

    updateControllerPositions() {
        this.controllers.forEach((controller, index) => {
            if (this.renderer.xr.isPresenting) {
                const hand = index === 0 ? this.hands.left : this.hands.right;
                if (hand) {
                    // Get controller's world position
                    controller.getWorldPosition(hand.position);
                    hand.visible = true;
                }
            }
        });

        // If not in VR, control hands with keyboard for desktop mode
        if (!this.renderer.xr.isPresenting) {
            this.hands.left.position.set(-0.5 + this.camera.position.x, 1.5 + this.camera.position.y, -1 + this.camera.position.z + 9);
            this.hands.right.position.set(0.5 + this.camera.position.x, 1.5 + this.camera.position.y, -1 + this.camera.position.z + 9);
            this.hands.left.visible = true;
            this.hands.right.visible = true;
        } else {
            // Hide hands if not in VR and controllers are not active (e.g. at game start)
            this.hands.left.visible = false;
            this.hands.right.visible = false;
        }
    }

    onControllerSelect(index) {
        this.controllers[index].userData.isSelecting = true;
        // Check for specific button presses for UI interaction
        if (this.renderer.xr.isPresenting) {
            const gamepad = this.controllers[index].gamepad;
            if (gamepad) {
                // The 'B' button on the right Quest 3 controller is typically gamepad button index 4.
                // The 'A' button is index 0. The 'X' button is index 2. The 'Y' button is index 3.
                // Trigger is 0, Squeeze is 1.
                // You might need to experiment with button indices.
                // A common mapping for the 'B' button (right controller) is button 4.
                if (index === 1 && gamepad.buttons[4] && gamepad.buttons[4].pressed) { // Check for 'B' button
                    this.toggleVRMenu();
                }

                // If you want to use the raycaster to select menu items:
                // If the menu is visible, cast a ray from the controller and check for intersections
                // with the 3D UI planes.
                if (this.vrMenuVisible) {
                    const tempMatrix = new THREE.Matrix4();
                    tempMatrix.identity().extractRotation(this.controllers[index].matrixWorld);
                    const raycaster = new THREE.Raycaster();
                    raycaster.ray.origin.setFromMatrixPosition(this.controllers[index].matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix); // Pointing forward from controller

                    const intersects = raycaster.intersectObjects([this.vrMenuMesh]);

                    if (intersects.length > 0) {
                        const intersection = intersects[0];
                        // Calculate UV coordinates on the plane to determine where the click happened
                        const uv = intersection.uv;

                        // Map UV coordinates to the internal HTML element's bounding box
                        // This is a simplified example. A full implementation would involve
                        // parsing the HTML layout and creating clickable regions.
                        // For now, we'll map a general area.

                        // Example: Simple logic for "Start Round" button within the menu mesh
                        // Assuming menu buttons are stacked vertically
                        // This would need to be very precise based on the actual HTML layout.
                        if (uv.y > 0.6 && uv.y < 0.9) { // Top part of the menu (e.g., Start Round button area)
                             // This is a hacky way to trigger. Better is to map specific button areas.
                             // For now, assume it always triggers startPenalty
                            // document.getElementById('startRoundBtn').click(); // This might not work directly with canvas texture
                             this.startPenalty(); // Call the game method directly
                        } else if (uv.y > 0.3 && uv.y < 0.6) { // Middle part (e.g., Pause button)
                            this.togglePause();
                        } else if (uv.y > 0.0 && uv.y < 0.3) { // Bottom part (e.g., Restart button)
                            this.restart();
                        }
                    }
                }
            }
        }
    }

    onControllerRelease(index) {
        this.controllers[index].userData.isSelecting = false;
    }

    nextRound() {
        this.round++;

        if (this.goalkeeperScore >= this.maxScore || this.shooterScore >= this.maxScore) {
            this.endGame();
            return;
        }

        this.updateUI();
        setTimeout(() => this.startPenalty(), 1500);
    }

    updateScore() {
        this.updateUI();
    }

    updateUI() {
        const goalkeeperScoreEl = document.getElementById('goalkeeperScore');
        const shooterScoreEl = document.getElementById('shooterScore');
        const roundEl = document.getElementById('round');

        if (goalkeeperScoreEl) goalkeeperScoreEl.textContent = this.goalkeeperScore;
        if (shooterScoreEl) shooterScoreEl.textContent = this.shooterScore;
        if (roundEl) roundEl.textContent = this.round;

        // Update 3D score display
        if (this.renderer.xr.isPresenting && this.scoreDisplayMesh) {
            const scoreHtml = `
                Portero: <span style="color: yellow">${this.goalkeeperScore}</span> | Rival: <span style="color: orange">${this.shooterScore}</span> | Ronda: <span style="color: lightblue">${this.round}</span>
            `;
            // Temporarily set the hidden HTML element's innerHTML
            const scoreDisplayElement = document.getElementById('score-display');
            if (scoreDisplayElement) {
                scoreDisplayElement.innerHTML = scoreHtml;
                this.scoreDisplayUpdateTexture(); // Force update the 3D texture
            }
        }
    }

    endGame() {
        this.gameActive = false;
        const gameOverDiv = document.getElementById('gameOver');
        const gameResult = document.getElementById('gameResult');
        const finalScore = document.getElementById('finalScore');

        let resultText = '';
        let resultColor = '';

        if (this.goalkeeperScore >= this.maxScore) {
            resultText = '¡Felicidades! ¡Ganaste!';
            resultColor = '#00ff00';
        } else {
            resultText = '¡Perdiste! Inténtalo de nuevo';
            resultColor = '#ff0000';
        }

        const finalScoreText = `Puntuación Final - Portero: ${this.goalkeeperScore} | Rival: ${this.shooterScore}`;

        if (gameOverDiv && gameResult && finalScore) {
            gameResult.textContent = resultText;
            gameResult.style.color = resultColor;
            finalScore.textContent = finalScoreText;

            if (this.renderer.xr.isPresenting) {
                this.gameOverMesh.visible = true;
                // Update the hidden HTML element content for the 3D texture
                gameOverDiv.style.display = 'block'; // Make sure the HTML is rendered for html2canvas
                this.gameOverUpdateTexture();
            } else {
                gameOverDiv.style.display = 'block';
            }
        } else {
            alert(`Juego terminado! Portero: ${this.goalkeeperScore} | Rival: ${this.shooterScore}`);
        }
    }

    restart() {
        this.goalkeeperScore = 0;
        this.shooterScore = 0;
        this.round = 1;
        this.gameActive = true;
        this.ballInPlay = false;

        const gameOverDiv = document.getElementById('gameOver');
        if (gameOverDiv) {
            if (this.renderer.xr.isPresenting) {
                this.gameOverMesh.visible = false;
            }
            gameOverDiv.style.display = 'none'; // Hide HTML element for 2D mode
        }

        this.updateUI();
        this.resetBallPosition();

        setTimeout(() => this.startPenalty(), 2000);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());

        document.addEventListener('keydown', (event) => {
            if (!this.renderer.xr.isPresenting) {
                const moveAmount = 0.5;
                switch (event.code) {
                    case 'KeyA':
                        this.hands.left.position.x -= moveAmount;
                        this.hands.right.position.x -= moveAmount;
                        break;
                    case 'KeyD':
                        this.hands.left.position.x += moveAmount;
                        this.hands.right.position.x += moveAmount;
                        break;
                    case 'KeyW':
                        this.hands.left.position.y += moveAmount;
                        this.hands.right.position.y += moveAmount;
                        break;
                    case 'KeyS':
                        this.hands.left.position.y -= moveAmount;
                        this.hands.right.position.y -= moveAmount;
                        break;
                    case 'ArrowLeft':
                        this.hands.right.position.x -= moveAmount;
                        this.hands.left.position.x -= moveAmount;
                        break;
                    case 'ArrowRight':
                        this.hands.right.position.x += moveAmount;
                        this.hands.left.position.x += moveAmount;
                        break;
                    case 'ArrowUp':
                        this.hands.right.position.y += moveAmount;
                        this.hands.left.position.y += moveAmount;
                        break;
                    case 'ArrowDown':
                        this.hands.right.position.y -= moveAmount;
                        this.hands.left.position.y -= moveAmount;
                        break;
                    case 'KeyP': // Toggle pause with 'P' in desktop
                        this.togglePause();
                        break;
                    case 'KeyR': // Restart with 'R' in desktop
                        this.restart();
                        break;
                    case 'Space': // Start round with 'Space' in desktop
                        this.startPenalty();
                        break;
                }
                const maxX = 4;
                const maxY = 2.5;
                this.hands.left.position.x = THREE.MathUtils.clamp(this.hands.left.position.x, -maxX, maxX);
                this.hands.left.position.y = THREE.MathUtils.clamp(this.hands.left.position.y, 0.5, maxY);
                this.hands.right.position.x = THREE.MathUtils.clamp(this.hands.right.position.x, -maxX, maxX);
                this.hands.right.position.y = THREE.MathUtils.clamp(this.hands.right.position.y, 0.5, maxY);
            }
        });

        // Add a specific listener for the B button on the right controller
        // WebXR controller input is usually handled via the `gamepad` object.
        // We will check for the button state in the `animate` loop.
        this.controllers.forEach((controller, index) => {
            if (index === 1) { // Right controller (index 1)
                controller.addEventListener('connected', (event) => {
                    // Check button mapping when controller connects
                    console.log('Right controller connected:', event.data.gamepad);
                });
            }
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    startGameLoop() {
        this.renderer.setAnimationLoop(() => this.animate());
    }

    animate() {
        const deltaTime = this.clock.getDelta();

        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        if (this.gameActive && !this.countdownActive) {
            this.updateBall(deltaTime);
        }

        this.updateControllerPositions();

        // Check for 'B' button press on the right controller (index 1)
        if (this.renderer.xr.isPresenting) {
            const rightController = this.controllers[1];
            if (rightController && rightController.gamepad) {
                // Button 4 is commonly the 'B' button on Meta Quest controllers
                // You might need to verify this or check all buttons.
                // Let's use a flag to prevent multiple triggers on hold
                if (rightController.gamepad.buttons[4] && rightController.gamepad.buttons[4].pressed && !rightController.userData.bButtonPressed) {
                    this.toggleVRMenu();
                    rightController.userData.bButtonPressed = true;
                }
                if (rightController.gamepad.buttons[4] && !rightController.gamepad.buttons[4].pressed) {
                    rightController.userData.bButtonPressed = false;
                }

                // If menu is visible, detect interactions with the 3D UI
                if (this.vrMenuVisible) {
                    const tempMatrix = new THREE.Matrix4();
                    tempMatrix.identity().extractRotation(rightController.matrixWorld);
                    const raycaster = new THREE.Raycaster();
                    raycaster.ray.origin.setFromMatrixPosition(rightController.matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix); // Pointing forward from controller

                    const intersects = raycaster.intersectObjects([this.vrMenuMesh], true); // Recursive check for children

                    if (intersects.length > 0) {
                        const intersection = intersects[0];
                        // You'd ideally have separate 3D meshes for each button
                        // For `html2canvas` rendered UI, you'd calculate UV coordinates
                        // and map them to the button regions of your HTML.
                        // This is a complex topic for pure Three.js without a UI library.
                        // As a workaround, we'll listen for the 'select' event on the controller.
                        // For a better implementation, consider three-mesh-ui.

                        // Visual feedback for hovering over the menu:
                        this.vrMenuMesh.material.color.setHex(0xaaaaaa); // Lighten when hovered
                    } else {
                        this.vrMenuMesh.material.color.setHex(0xffffff); // Reset color
                    }
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Global function for restart button (if you keep the HTML button for desktop)
window.restartGame = function () {
    if (window.game) {
        window.game.restart();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // You MUST include html2canvas library in your HTML before this script.
    // <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>

    setTimeout(() => {
        window.game = new PenaltyVRGame();
    }, 100);
}, { once: true });