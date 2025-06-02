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
        this.vrMenuVisible = false;

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
        this.menuRaycasters = [];

        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupVR();
        this.setupVRMenu();
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
        this.camera.position.set(0, 1.6, -8);
        this.camera.lookAt(new THREE.Vector3(0, 1.6, 8));
        this.scene.add(this.camera);
    }

    setupRenderer() {
        const container = document.getElementById('container');
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
                navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: ['hand-tracking', 'bounded-floor']
                }).then((session) => {
                    this.renderer.xr.setSession(session);
                });
            }
        };

        document.body.appendChild(vrButton);

        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', () => this.onControllerSelect(i));
            controller.addEventListener('selectend', () => this.onControllerRelease(i));
            controller.addEventListener('squeezestart', () => this.toggleVRMenu());
            this.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            this.scene.add(grip);
            this.controllerGrips.push(grip);
        }
    }

    setupVRMenu() {
        this.vrMenu = document.getElementById('vrMenu');
        this.countdownElement = document.getElementById('countdown');

        if (!this.vrMenu) {
            console.warn('Elemento vrMenu no encontrado, creando dinámicamente...');
            this.createVRMenuDynamically();
            return;
        }

        // Solo proceder si los elementos existen
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
    toggleVRMenu() {
        this.vrMenuVisible = !this.vrMenuVisible;
        this.vrMenu.style.display = this.vrMenuVisible ? 'flex' : 'none';
    }

    togglePause() {
        this.gameActive = !this.gameActive;
        const pauseBtn = document.getElementById('pauseBtn');
        pauseBtn.textContent = this.gameActive ? '⏸ Pausa' : '▶ Continuar';
    }

    startCountdown() {
        this.countdownActive = true;
        this.countdownValue = 3;

        // Verificación robusta del elemento countdown
        if (!this.countdownElement || !this.countdownElement.style) {
            console.error('Elemento countdown no disponible, continuando sin UI');
            this.executePenalty();
            return;
        }

        this.countdownElement.style.display = 'block';
        this.countdownElement.textContent = this.countdownValue;

        this.updateCountdown();
    }

    updateCountdown() {
        if (!this.countdownElement) {
            console.error('CountdownElement no disponible');
            this.countdownActive = false;
            this.executePenalty();
            return;
        }

        if (this.countdownValue > 0) {
            this.countdownElement.textContent = this.countdownValue;
            this.countdownValue--;
            setTimeout(() => this.updateCountdown(), 1000);
        } else {
            this.countdownElement.textContent = '¡YA!';
            setTimeout(() => {
                if (this.countdownElement) {
                    this.countdownElement.style.display = 'none';
                }
                this.countdownActive = false;
                this.executePenalty();
            }, 500);
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

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('./map/piso.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(10, 10);

            const groundMaterial = new THREE.MeshLambertMaterial({ map: texture });
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);
        });

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

    // --- INICIO DE LOS CAMBIOS PARA CARGAR EL MODELO FBX ---
    createShooter() {
        const loader = new FBXLoader();
        loader.load('./npc/jugador.fbx', (fbx) => {
            fbx.scale.setScalar(0.01);
            fbx.position.set(0, 0, 8);
            fbx.rotation.y = Math.PI;

            // Limpiar materiales problemáticos
            fbx.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Simplificar material si hay problemas
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

        }, undefined, (error) => {
            console.error('Error al cargar el modelo FBX:', error);
            this.createDefaultShooter();
        });
    }

    // Método para crear un shooter predeterminado si el FBX falla
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
    }
    // --- FIN DE LOS CAMBIOS PARA CARGAR EL MODELO FBX ---

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

        // Reiniciar la animación del shooter (si existe) a su estado inicial
        if (this.kickAction) {
            this.kickAction.stop(); // Detiene la animación si estaba reproduciéndose
            // Opcional: reiniciar el mixer a la pose T (idle) si tuvieras una animación idle
            // this.mixer.setTime(0); 
        }
    }

    startPenalty() {
        if (!this.gameActive || this.countdownActive) return;
        this.startCountdown();
        // ELIMINAR todo el código duplicado de animación aquí
    }

    shootBall() {
        if (!this.gameActive) return;

        this.ballInPlay = true;

        const targetX = (Math.random() - 0.5) * 6;
        const targetY = Math.random() * 2 + 0.2;
        const power = 12 + Math.random() * 8;

        const direction = new THREE.Vector3(targetX, targetY, -12).sub(this.ball.position).normalize();
        this.ballVelocity = direction.multiplyScalar(power);

        this.ballVelocity.x += (Math.random() - 0.5) * 2;
        this.ballVelocity.y += Math.random() * 3;
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
            this.hands.left.position.set(-0.5 + this.camera.position.x, 1.5 + this.camera.position.y, -1 + this.camera.position.z + 9);
            this.hands.right.position.set(0.5 + this.camera.position.x, 1.5 + this.camera.position.y, -1 + this.camera.position.z + 9);
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
        setTimeout(() => this.startPenalty(), 1500);
    }

    updateScore() {
        this.updateUI();
    }

    updateUI() {
        document.getElementById('goalkeeperScore').textContent = this.goalkeeperScore;
        document.getElementById('shooterScore').textContent = this.shooterScore;
        document.getElementById('round').textContent = this.round;
    }

    endGame() {
        this.gameActive = false;
        const gameOverDiv = document.getElementById('gameOver');
        const gameResult = document.getElementById('gameResult');
        const finalScore = document.getElementById('finalScore');

        if (this.goalkeeperScore >= this.maxScore) {
            gameResult.textContent = '¡Felicidades! ¡Ganaste!';
            gameResult.style.color = '#00ff00';
        } else {
            gameResult.textContent = '¡Perdiste! Inténtalo de nuevo';
            gameResult.style.color = '#ff0000';
        }

        finalScore.textContent = `Puntuación Final - Portero: ${this.goalkeeperScore} | Rival: ${this.shooterScore}`;
        gameOverDiv.style.display = 'block';
    }

    restart() {
        this.goalkeeperScore = 0;
        this.shooterScore = 0;
        this.round = 1;
        this.gameActive = true;
        this.ballInPlay = false;

        document.getElementById('gameOver').style.display = 'none';
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
                }
                const maxX = 4;
                const maxY = 2.5;
                this.hands.left.position.x = THREE.MathUtils.clamp(this.hands.left.position.x, -maxX, maxX);
                this.hands.left.position.y = THREE.MathUtils.clamp(this.hands.left.position.y, 0.5, maxY);
                this.hands.right.position.x = THREE.MathUtils.clamp(this.hands.right.position.x, -maxX, maxX);
                this.hands.right.position.y = THREE.MathUtils.clamp(this.hands.right.position.y, 0.5, maxY);
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
        this.renderer.render(this.scene, this.camera);
    }
}

// Global function for restart button
window.restartGame = function () {
    if (window.game) {
        window.game.restart();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Esperar un poco más para asegurar que todo esté listo
    setTimeout(() => {
        window.game = new PenaltyVRGame();
    }, 100);
}, { once: true });