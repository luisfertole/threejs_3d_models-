import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'; // Importa FBXLoader
import { AnimationMixer } from 'three'; // Importa AnimationMixer (común en versiones recientes de Three.js)
// Si la línea anterior da error, prueba esta:
// import { AnimationMixer } from 'three/addons/animation/AnimationMixer.js'; 


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
        
        // Game objects
        this.ball = null;
        this.goal = null;
        this.stadium = null; 
        this.shooter = null; // Ahora será el modelo FBX
        this.hands = { left: null, right: null };
        
        // Propiedades para la animación del oponente
        this.shooterMixer = null;
        this.kickAction = null; // Para la acción de patear
        
        // Physics
        this.ballVelocity = new THREE.Vector3();
        this.gravity = new THREE.Vector3(0, -9.81, 0);
        
        // VR Controllers
        this.controllers = [];
        this.controllerGrips = [];
        
        this.init();
    }
    
    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupVR();
        this.setupLighting();
        
        // Carga el estadio (modelo GLB)
        // ¡IMPORTANTE! Reemplaza 'path/to/your/stadium.glb' con la ruta real
        this.loadStadium('./map/map.glb'); // Ejemplo de ruta
        
        this.createGoal();
        this.createBall();
        
        // Carga el oponente (modelo FBX con animación)
        // ¡IMPORTANTE! Reemplaza 'path/to/your/opponent.fbx' con la ruta real
        this.loadOpponent('./npc/jugador.fbx'); // Ejemplo de ruta
        
        this.createHands();
        this.setupEventListeners();
        this.startGameLoop();
        
        // Inicia el primer penalti después de un retraso
        setTimeout(() => this.startPenalty(), 2000);
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Azul cielo
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 0); // Altura promedio del ojo humano
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
        // Crea el botón de VR
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
        
        // Configura los controladores de mano
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', () => this.onControllerSelect(i));
            controller.addEventListener('selectend', () => this.onControllerRelease(i));
            this.scene.add(controller);
            this.controllers.push(controller);
            
            const grip = this.renderer.xr.getControllerGrip(i);
            this.scene.add(grip);
            this.controllerGrips.push(grip);
        }
    }
    
    setupLighting() {
        // Luz ambiental
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Luz direccional (sol)
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
    
    /**
     * Carga el modelo 3D del estadio desde un archivo GLB.
     * @param {string} modelPath La ruta al archivo .glb del estadio.
     */
    loadStadium(modelPath) {
        const loader = new GLTFLoader();
        loader.load(
            modelPath,
            (gltf) => {
                this.stadium = gltf.scene;
                // Ajusta la escala, posición y rotación de tu modelo aquí.
                this.stadium.scale.set(10, 10, 10); 
                this.stadium.position.set(0, 0, 0); 
                this.stadium.rotation.y = Math.PI; 
                
                // Habilita las sombras para todas las mallas en el modelo del estadio
                this.stadium.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                this.scene.add(this.stadium);
                console.log('¡Estadio cargado exitosamente!');
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% cargado del estadio');
            },
            (error) => {
                console.error('Ocurrió un error al cargar el modelo del estadio:', error);
            }
        );
    }

    /**
     * Carga el modelo 3D del oponente (jugador) con animación de un archivo FBX.
     * @param {string} modelPath La ruta al archivo .fbx del oponente.
     */
    loadOpponent(modelPath) {
        const loader = new FBXLoader();
        loader.load(
            modelPath,
            (fbx) => {
                this.shooter = fbx;
                
                // Ajusta la escala, posición y rotación de tu modelo FBX aquí.
                // Los modelos de Mixamo suelen ser grandes, así que probablemente necesites escalarlos.
                this.shooter.scale.set(0.01, 0.01, 0.01); // Escala común para modelos de Mixamo
                this.shooter.position.set(0, 0, 8); // Posiciona en el punto de penalti
                this.shooter.rotation.y = Math.PI; // Rota para que mire hacia la portería
                
                // Habilita las sombras para todas las mallas dentro del modelo
                this.shooter.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.scene.add(this.shooter);

                // Configura el AnimationMixer
                this.shooterMixer = new THREE.AnimationMixer(this.shooter);
                
                // Si el FBX tiene múltiples animaciones, puedes iterar sobre ellas.
                // Para Mixamo, si descargas una animación específica, generalmente hay solo una.
                if (this.shooter.animations && this.shooter.animations.length > 0) {
                    // Asume que la primera animación es la de patear
                    this.kickAction = this.shooterMixer.clipAction(this.shooter.animations[0]);
                    this.kickAction.loop = THREE.LoopOnce; // La animación solo se reproduce una vez
                    this.kickAction.clampWhenFinished = true; // Se detiene en el último fotograma
                } else {
                    console.warn('El modelo FBX del oponente no contiene animaciones.');
                }
                
                console.log('¡Oponente cargado exitosamente con animación!');
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% cargado del oponente');
            },
            (error) => {
                console.error('Ocurrió un error al cargar el modelo del oponente:', error);
            }
        );
    }
    
    createGoal() {
        const goalGroup = new THREE.Group();
        
        // Postes de la portería
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
        
        // Travesaño
        const crossbarGeometry = new THREE.CylinderGeometry(0.1, 0.1, 7.32);
        const crossbar = new THREE.Mesh(crossbarGeometry, postMaterial);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, 2.44, -12);
        crossbar.castShadow = true;
        goalGroup.add(crossbar);
        
        // Red de la portería (visual)
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
    
    // createShooter() ha sido reemplazado por loadOpponent()
    
    createHands() {
        // Manos virtuales para detección de colisiones
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
        this.ball.position.set(0, 0.11, 7.5); // En el punto de penalti
        this.ballVelocity.set(0, 0, 0);
        this.ballInPlay = false;
    }
    
    startPenalty() {
        if (!this.gameActive) return;
        
        this.resetBallPosition();
        
        // Anima el disparo del tirador
        setTimeout(() => {
            this.shootBall();
        }, 1000);
    }
    
    shootBall() {
        // Asegúrate de que el juego esté activo y que la acción de patear exista
        if (!this.gameActive || !this.kickAction) return; 
        
        this.ballInPlay = true;
        
        // Reinicia y reproduce la animación de patear
        this.kickAction.reset();
        this.kickAction.play();

        // Los valores de dirección y potencia deben ajustarse a la animación
        // Puedes necesitar un ligero retraso si la animación no patea exactamente al inicio.
        const targetX = (Math.random() - 0.5) * 6; // Posición horizontal aleatoria en la portería
        const targetY = Math.random() * 2 + 0.2; // Altura aleatoria
        const power = 12 + Math.random() * 8; // Potencia aleatoria
        
        const direction = new THREE.Vector3(targetX, targetY, -12).sub(this.ball.position).normalize();
        this.ballVelocity = direction.multiplyScalar(power);
        
        // Añade algo de efecto al disparo
        this.ballVelocity.x += (Math.random() - 0.5) * 2;
        this.ballVelocity.y += Math.random() * 3;
    }
    
    updateBall(deltaTime) {
        if (!this.ballInPlay) return;
        
        // Aplica gravedad
        this.ballVelocity.add(this.gravity.clone().multiplyScalar(deltaTime));
        
        // Actualiza la posición
        const deltaPosition = this.ballVelocity.clone().multiplyScalar(deltaTime);
        this.ball.position.add(deltaPosition);
        
        // Comprueba la colisión con el suelo
        if (this.ball.position.y <= 0.11) {
            this.ball.position.y = 0.11;
            this.ballVelocity.y = Math.abs(this.ballVelocity.y) * 0.6; // Rebote con amortiguación
            this.ballVelocity.x *= 0.8; // Fricción
            this.ballVelocity.z *= 0.8; // Fricción
        }
        
        // Comprueba la colisión con la portería
        if (this.ball.position.z <= -12) {
            if (Math.abs(this.ball.position.x) <= 3.66 && this.ball.position.y <= 2.44) {
                // Gol marcado por el tirador
                this.shooterScore++;
                this.updateScore();
                this.ballInPlay = false;
                setTimeout(() => this.nextRound(), 2000);
            } else {
                // La pelota golpeó un poste o el travesaño
                this.ballVelocity.z = Math.abs(this.ballVelocity.z) * 0.8;
            }
        }
        
        // Comprueba la colisión con las manos
        this.checkHandCollision();
        
        // Elimina la pelota si se va demasiado lejos
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
                    // ¡Balón salvado!
                    this.goalkeeperScore++;
                    this.updateScore();
                    this.ballInPlay = false;
                    
                    // Añade retroalimentación visual
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
        // Actualiza las posiciones de las manos basándose en los controladores VR
        this.controllers.forEach((controller, index) => {
            if (controller.userData.isSelecting) {
                const hand = index === 0 ? this.hands.left : this.hands.right;
                if (hand) {
                    hand.position.copy(controller.position);
                    hand.visible = true;
                }
            }
        });
        
        // Si no hay controladores VR, usa la simulación de ratón/toque
        if (!this.renderer.xr.isPresenting) {
            // Posicionamiento simple de manos para modo no VR
            this.hands.left.position.set(-0.5, 1.5, -1);
            this.hands.right.position.set(0.5, 1.5, -1);
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
        
        // Controles de teclado para pruebas sin VR
        document.addEventListener('keydown', (event) => {
            if (!this.renderer.xr.isPresenting) {
                switch(event.code) {
                    case 'KeyA':
                        this.hands.left.position.x -= 0.1;
                        break;
                    case 'KeyD':
                        this.hands.left.position.x += 0.1;
                        break;
                    case 'KeyW':
                        this.hands.left.position.y += 0.1;
                        break;
                    case 'KeyS':
                        this.hands.left.position.y -= 0.1;
                        break;
                    case 'ArrowLeft':
                        this.hands.right.position.x -= 0.1;
                        break;
                    case 'ArrowRight':
                        this.hands.right.position.x += 0.1;
                        break;
                    case 'ArrowUp':
                        this.hands.right.position.y += 0.1;
                        break;
                    case 'ArrowDown':
                        this.hands.right.position.y -= 0.1;
                        break;
                }
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
        
        // Actualiza el mixer de animación del oponente
        if (this.shooterMixer) {
            this.shooterMixer.update(deltaTime);
        }

        this.updateBall(deltaTime);
        this.updateControllerPositions();
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Función global para el botón de reiniciar
window.restartGame = function() {
    if (window.game) {
        window.game.restart();
    }
};

// Inicializa el juego cuando la página se carga
window.addEventListener('DOMContentLoaded', () => {
    window.game = new PenaltyVRGame();
});