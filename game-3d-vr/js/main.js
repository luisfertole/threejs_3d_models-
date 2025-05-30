import * as THREE from 'three';

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
        this.shooter = null;
        this.hands = { left: null, right: null };
        
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
        this.createStadium();
        this.createGoal();
        this.createBall();
        this.createShooter();
        this.createHands();
        this.setupEventListeners();
        this.startGameLoop();
        
        // Start first penalty after a delay
        setTimeout(() => this.startPenalty(), 2000);
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 0); // Average human eye height
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
        // Create VR button
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
        
        // Setup hand controllers
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
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
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
        // Ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x00AA00 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Stadium walls
        const wallHeight = 10;
        const wallGeometry = new THREE.BoxGeometry(100, wallHeight, 1);
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
        
        // Back wall
        const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
        backWall.position.set(0, wallHeight/2, -50);
        this.scene.add(backWall);
        
        // Side walls
        const sideWallGeometry = new THREE.BoxGeometry(1, wallHeight, 100);
        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        leftWall.position.set(-50, wallHeight/2, 0);
        this.scene.add(leftWall);
        
        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        rightWall.position.set(50, wallHeight/2, 0);
        this.scene.add(rightWall);
    }
    
    createGoal() {
        const goalGroup = new THREE.Group();
        
        // Goal posts
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
        
        // Crossbar
        const crossbarGeometry = new THREE.CylinderGeometry(0.1, 0.1, 7.32);
        const crossbar = new THREE.Mesh(crossbarGeometry, postMaterial);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, 2.44, -12);
        crossbar.castShadow = true;
        goalGroup.add(crossbar);
        
        // Goal net (visual)
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
        
        // Add soccer ball pattern
        const loader = new THREE.TextureLoader();
        // Since we can't load external textures, we'll use a simple white ball
        
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.castShadow = true;
        this.resetBallPosition();
        this.scene.add(this.ball);
    }
    
    createShooter() {
        const shooterGroup = new THREE.Group();
        
        // Simple humanoid shooter
        // Body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.2);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x0066cc });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.2;
        shooterGroup.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.2);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2;
        shooterGroup.add(head);
        
        // Arms
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
        
        // Legs
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
    
    createHands() {
        // Virtual hands for collision detection
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
        this.ball.position.set(0, 0.11, 7.5); // On penalty spot
        this.ballVelocity.set(0, 0, 0);
        this.ballInPlay = false;
    }
    
    startPenalty() {
        if (!this.gameActive) return;
        
        this.resetBallPosition();
        
        // Animate shooter kick
        setTimeout(() => {
            this.shootBall();
        }, 1000);
    }
    
    shootBall() {
        if (!this.gameActive) return;
        
        this.ballInPlay = true;
        
        // Random shot direction and power
        const targetX = (Math.random() - 0.5) * 6; // Random horizontal position in goal
        const targetY = Math.random() * 2 + 0.2; // Random height
        const power = 12 + Math.random() * 8; // Random power
        
        const direction = new THREE.Vector3(targetX, targetY, -12).sub(this.ball.position).normalize();
        this.ballVelocity = direction.multiplyScalar(power);
        
        // Add some curve to the shot
        this.ballVelocity.x += (Math.random() - 0.5) * 2;
        this.ballVelocity.y += Math.random() * 3;
    }
    
    updateBall(deltaTime) {
        if (!this.ballInPlay) return;
        
        // Apply gravity
        this.ballVelocity.add(this.gravity.clone().multiplyScalar(deltaTime));
        
        // Update position
        const deltaPosition = this.ballVelocity.clone().multiplyScalar(deltaTime);
        this.ball.position.add(deltaPosition);
        
        // Check ground collision
        if (this.ball.position.y <= 0.11) {
            this.ball.position.y = 0.11;
            this.ballVelocity.y = Math.abs(this.ballVelocity.y) * 0.6; // Bounce with damping
            this.ballVelocity.x *= 0.8; // Friction
            this.ballVelocity.z *= 0.8; // Friction
        }
        
        // Check goal collision
        if (this.ball.position.z <= -12) {
            if (Math.abs(this.ball.position.x) <= 3.66 && this.ball.position.y <= 2.44) {
                // Goal scored by shooter
                this.shooterScore++;
                this.updateScore();
                this.ballInPlay = false;
                setTimeout(() => this.nextRound(), 2000);
            } else {
                // Ball hit post or crossbar
                this.ballVelocity.z = Math.abs(this.ballVelocity.z) * 0.8;
            }
        }
        
        // Check hand collision
        this.checkHandCollision();
        
        // Remove ball if it goes too far
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
                    // Ball saved!
                    this.goalkeeperScore++;
                    this.updateScore();
                    this.ballInPlay = false;
                    
                    // Add visual feedback
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
        // Update hand positions based on VR controllers
        this.controllers.forEach((controller, index) => {
            if (controller.userData.isSelecting) {
                const hand = index === 0 ? this.hands.left : this.hands.right;
                if (hand) {
                    hand.position.copy(controller.position);
                    hand.visible = true;
                }
            }
        });
        
        // If no VR controllers, use mouse/touch simulation
        if (!this.renderer.xr.isPresenting) {
            // Simple hand positioning for non-VR mode
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
        
        // Keyboard controls for non-VR testing
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
        
        this.updateBall(deltaTime);
        this.updateControllerPositions();
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Global function for restart button
window.restartGame = function() {
    if (window.game) {
        window.game.restart();
    }
};

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new PenaltyVRGame();
});