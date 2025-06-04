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
        this.isPaused = false;

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

        // VR Controllers - Mejorado
        this.controllers = [];
        this.controllerGrips = [];
        this.buttonStates = {
            left: { buttons: [], prevButtons: [] },
            right: { buttons: [], prevButtons: [] }
        };

        // Cooldowns para evitar múltiples activaciones
        this.buttonCooldowns = {
            penalty: 0,
            pause: 0,
            restart: 0
        };

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
        this.camera.position.set(0, 1.6, -10);
        this.camera.lookAt(new THREE.Vector3(0, 1.6, 0));
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
        const vrButton = document.getElementById('vrButton');

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
                                this.setupQuest3Controls();
                            }).catch((error) => {
                                console.warn('Error al iniciar sesión VR:', error);
                                alert('No se pudo iniciar la sesión VR. Jugando en modo desktop.');
                            });
                        } else {
                            console.warn('VR inmersivo no soportado');
                            alert('VR no soportado en este dispositivo. Jugando en modo desktop.');
                        }
                    });
                } else {
                    console.warn('WebXR no disponible');
                    alert('WebXR no disponible. Jugando en modo desktop.');
                }
            }
        };

        // Configuración mejorada de controladores
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', () => this.onControllerSelect(i));
            controller.addEventListener('selectend', () => this.onControllerRelease(i));
            this.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            this.scene.add(grip);
            this.controllerGrips.push(grip);

            // Inicializar estados de botones
            this.buttonStates.left.buttons = new Array(10).fill(false);
            this.buttonStates.left.prevButtons = new Array(10).fill(false);
            this.buttonStates.right.buttons = new Array(10).fill(false);
            this.buttonStates.right.prevButtons = new Array(10).fill(false);
        }
    }

    setupQuest3Controls() {
        // Sistema mejorado de detección de botones
        console.log('Configurando controles Quest 3...');

        // Crear un loop para detectar el estado de los botones en cada frame
        this.controllerUpdateLoop = () => {
            if (!this.renderer.xr.isPresenting) return;

            const session = this.renderer.xr.getSession();
            if (!session) return;

            // Obtener el frame actual
            session.requestAnimationFrame((time, frame) => {
                if (!frame) return;

                const inputSources = session.inputSources;

                for (let i = 0; i < inputSources.length; i++) {
                    const inputSource = inputSources[i];
                    if (!inputSource.gamepad) continue;

                    const handedness = inputSource.handedness; // 'left' o 'right'
                    const gamepad = inputSource.gamepad;

                    // Guardar estado anterior
                    const buttonState = this.buttonStates[handedness];
                    buttonState.prevButtons = [...buttonState.buttons];

                    // Actualizar estado actual
                    for (let j = 0; j < gamepad.buttons.length; j++) {
                        buttonState.buttons[j] = gamepad.buttons[j].pressed;
                    }

                    // Detectar presionado (transición de false a true)
                    for (let j = 0; j < gamepad.buttons.length; j++) {
                        if (buttonState.buttons[j] && !buttonState.prevButtons[j]) {
                            this.handleButtonPress(handedness, j);
                        }
                    }
                }
            });
        };
    }

    handleButtonPress(handedness, buttonIndex) {
        const currentTime = this.clock.getElapsedTime();

        console.log(`Botón presionado: ${handedness} - Índice: ${buttonIndex}`);

        // Mapeo de botones Quest 3:
        // Controlador Derecho: 0=Trigger, 1=Grip, 2=B, 3=A, 4=Thumbstick
        // Controlador Izquierdo: 0=Trigger, 1=Grip, 2=Y, 3=X, 4=Thumbstick

        if (handedness === 'right') {
            switch (buttonIndex) {
                case 0: // Trigger derecho - Iniciar penal (alternativo)
                    if (currentTime - this.buttonCooldowns.penalty > 1.0) {
                        this.startPenalty();
                        this.buttonCooldowns.penalty = currentTime;
                    }
                    break;
                case 1: // Grip derecho - Acción secundaria
                    this.showInstructions();
                    break;
                case 2: // Botón B - Iniciar penal (principal)
                    if (currentTime - this.buttonCooldowns.penalty > 1.0) {
                        this.startPenalty();
                        this.buttonCooldowns.penalty = currentTime;
                        this.showButtonFeedback('B - Penalty!');
                    }
                    break;
                case 3: // Botón A - Resetear posición de manos
                    this.resetHandPositions();
                    this.showButtonFeedback('A - Hands Reset');
                    break;
                case 4: // Thumbstick derecho - Velocidad de manos
                    this.toggleHandSpeed();
                    break;
            }
        } else if (handedness === 'left') {
            switch (buttonIndex) {
                case 0: // Trigger izquierdo - Mano izquierda activa
                    this.activateLeftHand();
                    break;
                case 1: // Grip izquierdo - Ambas manos activas
                    this.activateBothHands();
                    break;
                case 2: // Botón Y - Pausa/Reanudar
                    if (currentTime - this.buttonCooldowns.pause > 0.5) {
                        this.togglePause();
                        this.buttonCooldowns.pause = currentTime;
                        this.showButtonFeedback(`Y - ${this.isPaused ? 'Paused' : 'Resumed'}`);
                    }
                    break;
                case 3: // Botón X - Reiniciar juego
                    if (currentTime - this.buttonCooldowns.restart > 2.0) {
                        this.restart();
                        this.buttonCooldowns.restart = currentTime;
                        this.showButtonFeedback('X - Game Restarted');
                    }
                    break;
                case 4: // Thumbstick izquierdo - Cambiar dificultad
                    this.changeDifficulty();
                    break;
            }
        }
    }

    showButtonFeedback(message) {
        // Crear un elemento de texto 3D temporal para mostrar feedback
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = 'white';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.fillText(message, canvas.width / 2, canvas.height / 2 + 16);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9
        });

        const geometry = new THREE.PlaneGeometry(2, 0.5);
        const mesh = new THREE.Mesh(geometry, material);

        // Posicionar el texto frente al jugador
        mesh.position.set(0, 2.5, -2);
        mesh.lookAt(this.camera.position);

        this.scene.add(mesh);

        // Remover después de 2 segundos
        setTimeout(() => {
            this.scene.remove(mesh);
            geometry.dispose();
            material.dispose();
            texture.dispose();
        }, 2000);
    }

    showInstructions() {
        console.log('Instrucciones del juego:');
        console.log('Botón B (derecho): Iniciar penal');
        console.log('Botón Y (izquierdo): Pausar/Reanudar');
        console.log('Botón X (izquierdo): Reiniciar');
        console.log('Triggers: Activar manos');
    }

    resetHandPositions() {
        this.hands.left.position.set(-0.5, 1.5, -1);
        this.hands.right.position.set(0.5, 1.5, -1);
    }

    activateLeftHand() {
        this.hands.left.material.color.setHex(0x00ff00);
        setTimeout(() => {
            this.hands.left.material.color.setHex(0xff0000);
        }, 200);
    }

    activateBothHands() {
        this.hands.left.material.color.setHex(0x00ff00);
        this.hands.right.material.color.setHex(0x00ff00);
        setTimeout(() => {
            this.hands.left.material.color.setHex(0xff0000);
            this.hands.right.material.color.setHex(0xff0000);
        }, 200);
    }

    toggleHandSpeed() {
        // Implementar velocidad variable de las manos
        console.log('Velocidad de manos cambiada');
    }

    changeDifficulty() {
        // Cambiar dificultad del juego
        console.log('Dificultad cambiada');
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.gameActive = !this.isPaused;
        console.log(`Juego ${this.isPaused ? 'pausado' : 'reanudado'}`);
    }

    startPenalty() {
        if (!this.gameActive || this.ballInPlay || this.isPaused) {
            console.log('No se puede iniciar penal: gameActive=', this.gameActive, 'ballInPlay=', this.ballInPlay, 'isPaused=', this.isPaused);
            return;
        }

        console.log('Iniciando penal...');
        this.executePenalty();
    }

    // ... resto del código permanece igual hasta animate()

    animate() {
        const deltaTime = this.clock.getDelta();

        // Actualizar el loop de controladores
        if (this.controllerUpdateLoop && this.renderer.xr.isPresenting) {
            this.controllerUpdateLoop();
        }

        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        if (this.gameActive && !this.isPaused) {
            this.updateBall(deltaTime);
        }

        this.updateControllerPositions();
        this.renderer.render(this.scene, this.camera);
    }

    // Incluir aquí el resto de métodos del código original...
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

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(0, 100, 0);
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
    // SUELO CON TEXTURA ÚNICA
    const groundGeometry = new THREE.PlaneGeometry(30, 20);
    const groundTexture = new THREE.TextureLoader().load('./map/piso.jpg', texture => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(1, 1); // Sin repetición
    });
    
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        map: groundTexture,
        color: 0x4CAF50 
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // PAREDES CON TEXTURA ÚNICA
    const wallHeight = 8;
    const wallThickness = 0.5;
    const wallTexture = new THREE.TextureLoader().load('./map/gradas.jpg', texture => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(1, 1); // Textura no repetida
    });

    const wallMaterial = new THREE.MeshLambertMaterial({
        map: wallTexture,
        color: 0x888888,
        side: THREE.DoubleSide // Para ver la textura desde ambos lados
    });

    // Crear grupo para organizar las paredes
    this.stadium = { walls: [] };

    // PARED TRASERA (textura completa)
    const backWallGeometry = new THREE.BoxGeometry(30, wallHeight, wallThickness);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial.clone());
    backWall.position.set(0, wallHeight/2, -12.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.scene.add(backWall);
    this.stadium.walls.push(backWall);

    // PARED FRONTAL (textura completa)
    const frontWallGeometry = new THREE.BoxGeometry(30, wallHeight, wallThickness);
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial.clone());
    frontWall.position.set(0, wallHeight/2, 10);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);
    this.stadium.walls.push(frontWall);

    // PARED IZQUIERDA (textura completa)
    const leftWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, 22.5);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial.clone());
    leftWall.position.set(-15, wallHeight/2, -1.25);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);
    this.stadium.walls.push(leftWall);

    // PARED DERECHA (textura completa)
    const rightWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, 22.5);
    const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial.clone());
    rightWall.position.set(15, wallHeight/2, -1.25);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);
    this.stadium.walls.push(rightWall);

    // ESQUINAS SIN TEXTURA (para mantener el estilo limpio)
    this.createCornerPosts(wallHeight);
}

    createCornerPosts(wallHeight) {
    const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, wallHeight);
    const postMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x333333 // Color sólido oscuro para contraste
    });

    const corners = [
        { x: -15, z: -12.5 },
        { x: 15, z: -12.5 },
        { x: -15, z: 10 },
        { x: 15, z: 10 }
    ];

    corners.forEach(corner => {
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(corner.x, wallHeight/2, corner.z);
        post.castShadow = true;
        post.receiveShadow = true;
        this.scene.add(post);
    });
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
        if (controller.userData.isSelecting) {
            const hand = index === 0 ? this.hands.left : this.hands.right;
            if (hand) {
                hand.position.copy(controller.position);
                hand.visible = true;
            }
        }
    });

    if (!this.renderer.xr.isPresenting) {
        // Ajustar posición de las manos para la nueva posición de cámara
        this.hands.left.position.set(
            -0.5 + this.camera.position.x, 
            1.5 + this.camera.position.y, 
            -1 + this.camera.position.z + 11 // Ajustado para nueva posición de cámara
        );
        this.hands.right.position.set(
            0.5 + this.camera.position.x, 
            1.5 + this.camera.position.y, 
            -1 + this.camera.position.z + 11 // Ajustado para nueva posición de cámara
        );
        this.hands.left.visible = true;
        this.hands.right.visible = true;
    }
}

    onControllerSelect(index) {
        this.controllers[index].userData.isSelecting = true;
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
    }

    endGame() {
        this.gameActive = false;
        const gameOverDiv = document.getElementById('gameOver');
        const gameResult = document.getElementById('gameResult');
        const finalScore = document.getElementById('finalScore');

        if (gameOverDiv && gameResult && finalScore) {
            if (this.goalkeeperScore >= this.maxScore) {
                gameResult.textContent = '¡Felicidades! ¡Ganaste!';
                gameResult.style.color = '#00ff00';
            } else {
                gameResult.textContent = '¡Perdiste! Inténtalo de nuevo';
                gameResult.style.color = '#ff0000';
            }

            finalScore.textContent = `Puntuación Final - Portero: ${this.goalkeeperScore} | Rival: ${this.shooterScore}`;
            gameOverDiv.style.display = 'block';
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
        this.isPaused = false;

        const gameOverDiv = document.getElementById('gameOver');
        if (gameOverDiv) {
            gameOverDiv.style.display = 'none';
        }

        this.updateUI();
        this.resetBallPosition();

        // Resetear cooldowns
        this.buttonCooldowns.penalty = 0;
        this.buttonCooldowns.pause = 0;
        this.buttonCooldowns.restart = 0;

        console.log('Juego reiniciado');
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
                case 'Space':
                    this.startPenalty();
                    break;
                case 'KeyP':
                    this.togglePause();
                    break;
                case 'KeyR':
                    this.restart();
                    break;
            }
            
            // Nuevos límites para el área cerrada (más pequeña)
            const maxX = 3.5; // Reducido porque el área es más pequeña
            const maxY = 2.5;
            const minX = -3.5;
            const minY = 0.5;
            
            // Aplicar límites a ambas manos
            [this.hands.left, this.hands.right].forEach(hand => {
                hand.position.x = THREE.MathUtils.clamp(hand.position.x, minX, maxX);
                hand.position.y = THREE.MathUtils.clamp(hand.position.y, minY, maxY);
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
}

// Global function for restart button
window.restartGame = function () {
    if (window.game) {
        window.game.restart();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.game = new PenaltyVRGame();
    }, 100);
}, { once: true });