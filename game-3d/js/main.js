import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const clock = new THREE.Clock();

// DOM Elements
const container = document.getElementById('container');
const lockButton = document.getElementById("lockButton");

// Configuración del jugador
const PLAYER_MAX_HEALTH = 50;
let playerHealth = PLAYER_MAX_HEALTH;
let playerIsDead = false;
let lastDamageTime = 0;
const DAMAGE_COOLDOWN = 1000;
let entities = [];
let debugFrameCount = 0;
let gamePaused = false;
let pauseMenu = null;

// Configuración del botón para solicitar Pointer Lock
lockButton.addEventListener("click", async () => {
    try {
        await container.requestPointerLock();
        lockButton.style.display = "none";
    } catch (err) {
        console.error("Error al bloquear puntero:", err);
    }
});

// Configuración de la escena
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);

// Configuración de la cámara
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// Iluminación
const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(-5, 25, -1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = -30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = -30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = -0.00006;
scene.add(directionalLight);

// Configuración del renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// Stats (FPS counter)
const stats = new Stats();
stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
container.appendChild(stats.domElement);

// Configuración de la física
const GRAVITY = 30;
const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;
const STEPS_PER_FRAME = 5;

// Variables para el control de la cámara
let cameraRotationX = 0;
let cameraRotationY = 0;
const cameraRotationSpeed = 0.002;
const cameraPitchLimit = Math.PI / 2 - 0.1;

// Creación de esferas
const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3()
    });
}

// Octree para colisiones con el mundo
const worldOctree = new Octree();

// Colisionador del jugador
const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

// Vectores para cálculos de física
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

// Estado del jugador
let playerOnFloor = false;
let mouseTime = 0;

// Estado de las teclas
const keyStates = {};

// Vectores de utilidad
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

// ==================== SISTEMA DE POSICIONAMIENTO DE ENEMIGOS ====================

// Función optimizada para encontrar posición válida para el enemigo
function findValidEnemyPosition(maxAttempts = 20) {
    const MIN_DISTANCE_TO_PLAYER = 15;
    const PLAYER_SAFE_RADIUS = 10;
    const MAP_BOUNDS = 25; // Asumiendo un mapa de +/-25 unidades en X y Z

    // Generador de posiciones aleatorias mejorado
    function* generateRandomPositions() {
        // Posiciones predefinidas estratégicas
        const predefinedPositions = [
            new THREE.Vector3(15, 0, 15),
            new THREE.Vector3(-10, 0, 10),
            new THREE.Vector3(8, 0, -12),
            new THREE.Vector3(-15, 0, -15),
            new THREE.Vector3(20, 0, 5)
        ];

        // Primero probar las posiciones predefinidas
        for (const pos of predefinedPositions) {
            yield pos;
        }

        // Luego generar posiciones aleatorias
        while (true) {
            const angle = Math.random() * Math.PI * 2;
            const distance = PLAYER_SAFE_RADIUS + Math.random() * (MAP_BOUNDS - PLAYER_SAFE_RADIUS);
            const x = playerCollider.end.x + Math.cos(angle) * distance;
            const z = playerCollider.end.z + Math.sin(angle) * distance;

            // Mantener dentro de los límites del mapa
            yield new THREE.Vector3(
                THREE.MathUtils.clamp(x, -MAP_BOUNDS, MAP_BOUNDS),
                0.5,
                THREE.MathUtils.clamp(z, -MAP_BOUNDS, MAP_BOUNDS)
            );
        }
    }

    // Verificar si una posición es válida
    function isValidPosition(position) {
        const tempCollider = new Capsule(
            new THREE.Vector3(position.x, position.y, position.z),
            new THREE.Vector3(position.x, position.y + 1, position.z),
            0.5
        );

        // Verificar colisión con el mundo
        if (worldOctree.capsuleIntersect(tempCollider)) {
            return false;
        }

        // Verificar distancia al jugador
        const distanceToPlayer = tempCollider.end.distanceTo(playerCollider.end);
        if (distanceToPlayer < MIN_DISTANCE_TO_PLAYER) {
            return false;
        }

        return true;
    }

    // Probar posiciones
    const positionGenerator = generateRandomPositions();
    let attempts = 0;

    for (const position of positionGenerator) {
        if (isValidPosition(position)) {
            return position;
        }

        if (++attempts >= maxAttempts) {
            break;
        }
    }

    // Fallback: posición por defecto alejada del jugador
    console.warn("No se encontró posición óptima, usando posición por defecto");
    return new THREE.Vector3(
        playerCollider.end.x + (Math.random() > 0.5 ? 1 : -1) * MIN_DISTANCE_TO_PLAYER,
        0.5,
        playerCollider.end.z + (Math.random() > 0.5 ? 1 : -1) * MIN_DISTANCE_TO_PLAYER
    );
}

class Enemy {
    constructor(config, scene, player) {
        // Configuración básica
        this.model = config.model;
        this.mainClips = config.mainClips || [];
        this.attackClips = config.attackClips || [];
        this.jumpClips = config.jumpClips || [];  // Nuevo: animaciones de salto
        this.player = player;
        this.scene = scene;
        this.animations = {};
        this.currentAction = null;

        // Configuración del modelo 3D
        this.model.scale.set(0.01, 0.01, 0.01);
        this.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Posicionamiento inicial
        const validPosition = findValidEnemyPosition();
        this.model.position.copy(validPosition);
        scene.add(this.model);

        // Configuración del colisionador (cápsula)
        this.collider = new Capsule(
            new THREE.Vector3(validPosition.x, validPosition.y, validPosition.z),
            new THREE.Vector3(validPosition.x, validPosition.y + 1, validPosition.z),
            0.3
        );

        // Sistema de animación
        this.mixer = new THREE.AnimationMixer(this.model);
        this.actionFinishedListener = null;
        this.jumpFinishedListener = null;  // Listener específico para salto
        this.animations = {};

        // Configurar animaciones principales
        if (config.mainClips.length > 0) {
            this.animations['main'] = this.mixer.clipAction(config.mainClips[0]);
            this.animations['main'].setEffectiveWeight(1.0);
            this.animations['main'].setLoop(THREE.LoopRepeat);
        }

        if (config.attackClips.length > 0) {
            this.animations['attack'] = this.mixer.clipAction(config.attackClips[0]);
            this.animations['attack'].setEffectiveWeight(1.0);
            this.animations['attack'].setLoop(THREE.LoopOnce);
            this.animations['attack'].clampWhenFinished = true;
        }

        if (config.jumpClips.length > 0) {
            this.animations['jump'] = this.mixer.clipAction(config.jumpClips[0]);
            this.animations['jump'].setEffectiveWeight(1.0);
            this.animations['jump'].setLoop(THREE.LoopOnce);
            this.animations['jump'].clampWhenFinished = true;
        }

        // Establecer animación inicial
        if (this.animations['main']) {
            this.currentAction = this.animations['main'];
            this.currentAction.play();

            // Configurar listener para volver a animación principal después de ataque
            if (this.animations['attack']) {
                this.actionFinishedListener = (e) => {
                    if (e.action === this.animations['attack']) {
                        this.playAnimation('main');
                    }
                };
                this.mixer.addEventListener('finished', this.actionFinishedListener);
            }
        }

        // Propiedades de movimiento y física
        this.velocity = new THREE.Vector3();
        this.onFloor = false;
        this.speed = 3.5;
        this.jumpStrength = 10;  // Ajustado para mejor sincronización con animación
        this.jumpCooldown = 1500;  // Tiempo entre saltos en ms
        this.lastJumpTime = 0;
        this.obstacleDetectionDistance = 1.5;
        this.attackDamage = 10;
        this.attackCooldown = 2000;
        this.lastAttackTime = 0;
        this.rotationSpeed = 7.0;
        this.isMoving = false;
        this.isJumping = false;  // Nuevo estado para controlar saltos

        // Debug visual
        this.colliderHelper = this.createColliderHelper();
        this.colliderHelper.visible = false;
    }

    playAnimation(name, fadeDuration = 0.2) {
        const nextAction = this.animations[name];

        if (nextAction && nextAction !== this.currentAction) {
            const previousAction = this.currentAction;
            this.currentAction = nextAction;

            if (previousAction) {
                previousAction.fadeOut(fadeDuration);
            }

            this.currentAction
                .reset()
                .setEffectiveTimeScale(1)
                .setEffectiveWeight(1)
                .fadeIn(fadeDuration)
                .play();
        } else if (nextAction === this.currentAction && !nextAction.isRunning()) {
            this.currentAction.reset().play();
        }
    }

    attackPlayer() {
        const now = performance.now();
        if (now - this.lastAttackTime >= this.attackCooldown && this.animations['attack']) {
            damagePlayer(this.attackDamage);
            this.lastAttackTime = now;
            this.playAnimation('attack', 0.15);
        }
    }
    // Método para manejar el salto
    triggerJump() {
        if (this.animations['jump'] && !this.isJumping) {
            this.isJumping = true;

            // Detener cualquier listener previo
            if (this.jumpFinishedListener) {
                this.mixer.removeEventListener('finished', this.jumpFinishedListener);
            }

            // Configurar nuevo listener
            this.jumpFinishedListener = (e) => {
                if (e.action === this.animations['jump']) {
                    this.isJumping = false;
                    this.playAnimation('main');
                    this.mixer.removeEventListener('finished', this.jumpFinishedListener);
                }
            };

            this.mixer.addEventListener('finished', this.jumpFinishedListener);
            this.playAnimation('jump', 0.1);

            // Ajustar la duración de la animación al tiempo de salto
            const jumpDuration = Math.sqrt(2 * (this.velocity.y + 0.5) / GRAVITY);
            this.animations['jump'].setDuration(jumpDuration);
        }
    }


    update(deltaTime) {
        if (!this.mixer || playerIsDead) return;

        // Actualizar animaciones
        this.mixer.update(deltaTime);

        // Aplicar gravedad
        if (!this.onFloor) {
            this.velocity.y -= GRAVITY * deltaTime;
        } else {
            this.velocity.y = Math.max(0, this.velocity.y);
        }

        // Calcular dirección hacia el jugador
        const enemyCenter = this.collider.start.clone().add(this.collider.end).multiplyScalar(0.5);
        const playerCenter = this.player.start.clone().add(this.player.end).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(playerCenter, enemyCenter);
        const distanceToPlayer = direction.length();
        const distanceToPlayerSq = distanceToPlayer * distanceToPlayer;

        const isAttacking = this.currentAction === this.animations['attack'] &&
            this.animations['attack'].isRunning();
        const isJumping = this.currentAction === this.animations['jump'] &&
            this.animations['jump'].isRunning();
        const attackRangeSq = 1.8 * 1.8;

        // Lógica de movimiento
        if (!isAttacking && !isJumping && distanceToPlayerSq > attackRangeSq) {
            direction.normalize();

            // Movimiento horizontal
            const moveSpeed = this.speed * (this.onFloor ? 1.0 : 0.3);
            this.velocity.x = direction.x * moveSpeed;
            this.velocity.z = direction.z * moveSpeed;

            // Lógica de salto
            if (this.onFloor) {
                const heightDifference = playerCenter.y - enemyCenter.y;
                const now = performance.now();

                // Salto hacia el jugador si está más alto
                if (heightDifference > 0.5 && distanceToPlayer < 5 &&
                    now - this.lastJumpTime > this.jumpCooldown) {
                    this.velocity.y = Math.sqrt(2 * GRAVITY * (heightDifference + 0.5));
                    this.onFloor = false;
                    this.lastJumpTime = now;
                    this.triggerJump();
                }

                // Salto sobre obstáculos
                const raycastDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize();
                const raycastResult = this.raycastForObstacles(raycastDirection);
                if (raycastResult && raycastResult.distance < this.obstacleDetectionDistance &&
                    raycastResult.normal.y < 0.5 && now - this.lastJumpTime > this.jumpCooldown) {
                    this.velocity.y = this.jumpStrength;
                    this.onFloor = false;
                    this.lastJumpTime = now;
                    this.triggerJump();
                }
            }

            this.isMoving = true;
            if (!isJumping) {  // Solo reproducir animación principal si no está saltando
                this.playAnimation('main', 0.2);
            }
        } else {
            // Frenado cuando está cerca o atacando
            this.velocity.x *= 0.5;
            this.velocity.z *= 0.5;
            this.isMoving = Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1;
        }

        // Rotación hacia el jugador
        this.updateRotation(deltaTime, playerCenter);

        // Aplicar fricción
        const damping = Math.exp(-4 * deltaTime) - 1;
        if (this.onFloor) {
            this.velocity.x += this.velocity.x * damping;
            this.velocity.z += this.velocity.z * damping;
        } else {
            this.velocity.x += this.velocity.x * damping * 0.1;
            this.velocity.z += this.velocity.z * damping * 0.1;
        }

        // Mover el enemigo
        const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);
        this.collider.translate(deltaPosition);

        // Detectar colisiones
        this.detectCollisions();

        // Actualizar posición del modelo 3D
        this.model.position.copy(this.collider.start);

        // Actualizar ayuda visual del colisionador (debug)
        if (this.colliderHelper && this.colliderHelper.visible) {
            const center = new THREE.Vector3().addVectors(this.collider.start, this.collider.end).multiplyScalar(0.5);
            this.colliderHelper.position.copy(center);
            const capsuleHeight = this.collider.end.y - this.collider.start.y;
            this.colliderHelper.geometry.dispose();
            this.colliderHelper.geometry = new THREE.CylinderGeometry(this.collider.radius, this.collider.radius, capsuleHeight, 8);
            this.colliderHelper.rotation.set(0, 0, 0);
        }

        // Atacar al jugador si está cerca
        if (!isAttacking && !isJumping && distanceToPlayerSq <= attackRangeSq) {
            this.attackPlayer();
        }
    }

    raycastForObstacles(direction) {
        const rayOrigin = this.collider.start.clone().add(this.collider.end).multiplyScalar(0.5);
        const rayEnd = rayOrigin.clone().add(direction.clone().multiplyScalar(this.obstacleDetectionDistance));

        // Implementación manual de raycast
        const ray = {
            start: rayOrigin,
            end: rayEnd,
            direction: direction.clone().normalize()
        };

        return this.simpleRaycast(ray);
    }

    simpleRaycast(ray) {
        // Implementación básica de raycast contra el octree
        const triangles = worldOctree.triangles;
        let closestIntersection = null;
        let closestDistance = Infinity;

        for (let i = 0; i < triangles.length; i++) {
            const triangle = triangles[i];
            const intersection = this.rayIntersectsTriangle(
                ray.start,
                ray.end,
                triangle.a,
                triangle.b,
                triangle.c
            );

            if (intersection && intersection.distance < closestDistance) {
                closestIntersection = intersection;
                closestDistance = intersection.distance;
            }
        }

        return closestIntersection;
    }

    rayIntersectsTriangle(rayStart, rayEnd, a, b, c) {
        // Implementación de Möller–Trumbore intersection algorithm
        const edge1 = new THREE.Vector3().subVectors(b, a);
        const edge2 = new THREE.Vector3().subVectors(c, a);
        const rayVector = new THREE.Vector3().subVectors(rayEnd, rayStart);

        const h = new THREE.Vector3().crossVectors(rayVector, edge2);
        const det = edge1.dot(h);

        if (det > -Number.EPSILON && det < Number.EPSILON) {
            return null; // Ray is parallel to triangle
        }

        const invDet = 1 / det;
        const s = new THREE.Vector3().subVectors(rayStart, a);
        const u = invDet * s.dot(h);

        if (u < 0 || u > 1) {
            return null;
        }

        const q = new THREE.Vector3().crossVectors(s, edge1);
        const v = invDet * rayVector.dot(q);

        if (v < 0 || u + v > 1) {
            return null;
        }

        const t = invDet * edge2.dot(q);

        if (t > Number.EPSILON && t <= 1) {
            const distance = t * rayVector.length();
            const point = new THREE.Vector3().copy(rayStart).add(rayVector.multiplyScalar(t));
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            return {
                point: point,
                normal: normal,
                distance: distance
            };
        }

        return null;
    }


    updateRotation(deltaTime, targetPosition) {
        const currentPosition = this.model.position;
        const direction = new THREE.Vector3().subVectors(targetPosition, currentPosition);

        // Solo rotar en el eje Y (horizontal)
        direction.y = 0;

        // Si está en el aire, considerar también la dirección de movimiento
        if (!this.onFloor) {
            const moveDirection = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
            if (moveDirection.lengthSq() > 0.1) {
                // Mezclar entre dirección al jugador y dirección de movimiento
                direction.add(moveDirection.normalize().multiplyScalar(0.3));
            }
        }

        if (direction.lengthSq() > 0.001) {
            direction.normalize();

            // Calcular el ángulo objetivo
            const targetAngle = Math.atan2(direction.x, direction.z);

            // Calcular diferencia de ángulo (asegurando el camino más corto)
            let angleDiff = targetAngle - this.model.rotation.y;

            // Normalizar el ángulo a [-π, π]
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Calcular paso de rotación con aceleración/deceleración suave
            const maxRotationStep = this.rotationSpeed * deltaTime;
            let rotationStep = angleDiff * 2.5 * deltaTime;
            rotationStep = THREE.MathUtils.clamp(rotationStep, -maxRotationStep, maxRotationStep);

            // Aplicar rotación
            this.model.rotation.y += rotationStep;

            // Si está saltando, ajustar la inclinación del modelo
            if (!this.onFloor) {
                // Inclinación hacia adelante durante el salto
                const tiltAmount = Math.min(0.3, this.velocity.y * 0.05);
                this.model.rotation.x = THREE.MathUtils.lerp(
                    this.model.rotation.x,
                    -tiltAmount,
                    5 * deltaTime
                );
            } else {
                // Volver a la posición normal en el suelo
                this.model.rotation.x = THREE.MathUtils.lerp(
                    this.model.rotation.x,
                    0,
                    5 * deltaTime
                );
            }
        }
    }


    detectCollisions() {
        const result = worldOctree.capsuleIntersect(this.collider);
        this.onFloor = false;

        if (result) {
            this.onFloor = result.normal.y > 0.5;

            if (result.depth > 1e-10) {
                this.collider.translate(result.normal.multiplyScalar(result.depth));

                if (this.onFloor) {
                    this.velocity.y = Math.max(0, this.velocity.y);
                    this.velocity.x *= 0.9;
                    this.velocity.z *= 0.9;
                } else {
                    const wallFriction = 0.3;
                    const velocityAlongNormal = result.normal.dot(this.velocity);
                    this.velocity.addScaledVector(result.normal, -velocityAlongNormal * (1 + wallFriction));
                }
            }
        }
    }

    createColliderHelper() {
        const capsuleHeight = this.collider.end.clone().sub(this.collider.start).length();
        const geometry = new THREE.CylinderGeometry(
            this.collider.radius,
            this.collider.radius,
            capsuleHeight,
            8
        );
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            wireframe: true,
            opacity: 0.5,
            transparent: true
        });
        const helper = new THREE.Mesh(geometry, material);
        helper.rotation.x = Math.PI / 2; // Rotar para que quede vertical
        this.scene.add(helper);
        return helper;
    }

    hasReachedPlayer() {
        const enemyCenter = this.collider.start.clone().add(this.collider.end).multiplyScalar(0.5);
        const playerCenter = this.player.start.clone().add(this.player.end).multiplyScalar(0.5);
        const attackRange = 1.8;
        return enemyCenter.distanceToSquared(playerCenter) < (attackRange * attackRange);
    }

    setDebugVisible(visible) {
        if (this.colliderHelper) {
            this.colliderHelper.visible = visible;
        }
    }

    dispose() {
        if (this.mixer && this.actionFinishedListener) {
            this.mixer.removeEventListener('finished', this.actionFinishedListener);
        }
        if (this.colliderHelper) {
            this.scene.remove(this.colliderHelper);
            this.colliderHelper.geometry.dispose();
            this.colliderHelper.material.dispose();
        }
        if (this.model) {
            this.scene.remove(this.model);
        }
    }
}

// ==================== CLASE KID ====================
class Kid {
    constructor(config, scene, player, enemy) {
        // Configuración básica
        this.model = config.model;
        this.runClips = config.runClips || [];
        this.followClips = config.followClips || [];
        this.player = player;
        this.enemy = enemy;
        this.scene = scene;
        this.animations = {};
        this.currentAction = null;

        // Estado del Kid
        this.state = 'escaping';  // 'escaping', 'following', 'rescued'
        this.rescued = false;
        this.health = 20;
        this.maxHealth = 20;
        this.isDead = false;
        this.lastDamageTime = 0;
        this.damageCooldown = 1000;

        // Configuración del modelo 3D
        this.model.scale.set(0.0075, 0.0075, 0.0075);
        this.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Configuración del colisionador (cápsula)
        const capsuleHeight = 1.5;
        const capsuleRadius = 0.3;
        const validPosition = this.findValidKidPosition();

        this.collider = new Capsule(
            new THREE.Vector3(validPosition.x, validPosition.y, validPosition.z),
            new THREE.Vector3(validPosition.x, validPosition.y + capsuleHeight, validPosition.z),
            capsuleRadius
        );

        this.model.position.copy(validPosition);
        scene.add(this.model);

        // Sistema de animación
        this.setupAnimations();

        // Propiedades de movimiento y física
        this.velocity = new THREE.Vector3();
        this.onFloor = false;
        this.speed = 5.5;  // Aumentada para mejor escape
        this.followSpeed = 2;
        this.jumpStrength = 5;
        this.jumpCooldown = 2000;
        this.lastJumpTime = 0;
        this.rotationSpeed = 8.0;
        this.gravityMultiplier = 0.3;
        this.escapeBoost = 1.3;  // Multiplicador de velocidad cuando está cerca de amenazas

        // Navegación y detección de atascamientos
        this.escapeMemory = [];
        this.maxEscapeMemory = 5;
        this.stuckDetection = {
            checkInterval: 0.3,    // Segundos entre chequeos
            lastCheckTime: 0,
            isStuck: false,
            stuckPosition: null,
            stuckTime: 0,
            maxStuckTime: 2.0,     // Segundos antes de activar escape forzado
            escapeAttempts: 0,
            maxEscapeAttempts: 3
        };
        
        this.navigation = {
            lastPositions: [],
            positionHistorySize: 10,
            minMovement: 0.2,     // Movimiento mínimo para no considerarse atascado
            obstacleHistory: [],
            historySize: 10,
            recentObstacles: 0
        };

        // Punto seguro en el mapa
        this.safePoint = new THREE.Vector3(18, 2,19);
        this.createSafePointLight();

        // Elementos visuales
        this.createKidIndicator();
        this.createKidHealthBar();

        // Debug
        this.colliderHelper = this.createColliderHelper();
        this.colliderHelper.visible = false;
        this.debugObjects = null;
    }
    createSafePointLight() {
        // Luz verde que apunta hacia arriba
        this.safePointLight = new THREE.SpotLight(0x00ff00, 5, 10, Math.PI/4, 0.5);
        this.safePointLight.position.set(this.safePoint.x, 0.1, this.safePoint.z);
        this.safePointLight.target.position.set(this.safePoint.x, 10, this.safePoint.z);
        this.safePointLight.castShadow = true;
        
        // Añadir ayudas visuales para debug (opcional)
        const lightHelper = new THREE.SpotLightHelper(this.safePointLight);
        scene.add(lightHelper);
        
        // Añadir la luz y su target a la escena
        scene.add(this.safePointLight);
        scene.add(this.safePointLight.target);

        // Efecto de partículas o neblina para hacerlo más visible
        this.createSafePointEffect();
    }

    createSafePointEffect() {
        // Crear un cilindro verde semitransparente
        const geometry = new THREE.SphereGeometry(2, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            emissive: 0x00ff00,
            emissiveIntensity: 0.5
        });
        
        this.safePointMarker = new THREE.Mesh(geometry, material);
        this.safePointMarker.position.set(this.safePoint.x, 0.25, this.safePoint.z);
        this.safePointMarker.rotation.x = Math.PI / 2;
        scene.add(this.safePointMarker);

        // Animación pulsante
        this.safePointPulse = {
            scale: 1,
            growing: true,
            speed: 0.5
        };
    }

    /* ANIMATION METHODS */
    setupAnimations() {
        this.mixer = new THREE.AnimationMixer(this.model);
        this.animations = {};
        
        // Animación de correr (run)
        if (this.runClips.length > 0) {
            this.animations['run'] = this.mixer.clipAction(this.runClips[0]);
            this.animations['run'].play();
            this.currentAction = this.animations['run'];
        } else {
            this.createFallbackAnimation();
        }

        // Animación de seguir (follow)
        if (this.followClips.length > 0) {
            this.animations['follow'] = this.mixer.clipAction(this.followClips[0]);
        } else if (this.runClips.length > 0) {
            const runClip = this.runClips[0].clone();
            runClip.name = "follow_fallback";
            this.animations['follow'] = this.mixer.clipAction(runClip);
            this.animations['follow'].timeScale = 0.6;
        }
    }

    createFallbackAnimation() {
        const tracks = [
            new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 0, 0]),
            new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
        ];
        
        const clip = new THREE.AnimationClip('fallback_run', 1, tracks);
        this.runClips = [clip];
        this.animations['run'] = this.mixer.clipAction(clip);
        this.currentAction = this.animations['run'];
        this.currentAction.play();
    }

    forcePlayAnimation(name) {
        if (!this.animations[name]) {
            console.error(`No existe la animación ${name}`);
            return false;
        }
        
        if (this.currentAction) {
            this.currentAction.stop();
        }
        
        this.currentAction = this.animations[name];
        this.currentAction.reset();
        this.currentAction.setEffectiveWeight(1.0);
        this.currentAction.setLoop(THREE.LoopRepeat);
        this.currentAction.play();
        
        return true;
    }

    playAnimation(name, fadeDuration = 0.2) {
        const nextAction = this.animations[name];
        if (!nextAction) return;

        if (nextAction !== this.currentAction) {
            if (this.currentAction) this.currentAction.fadeOut(fadeDuration);

            this.currentAction = nextAction
                .reset()
                .setEffectiveTimeScale(1)
                .fadeIn(fadeDuration)
                .play();
        } else if (!nextAction.isRunning()) {
            nextAction.reset().play();
        }
    }

    /* NAVIGATION & ESCAPE IMPROVEMENTS */
    checkIfStuck(now, deltaTime) {
        if (now - this.stuckDetection.lastCheckTime < this.stuckDetection.checkInterval * 1000) {
            return this.stuckDetection.isStuck;
        }
        
        this.stuckDetection.lastCheckTime = now;
        const currentPos = this.model.position.clone();
        
        this.navigation.lastPositions.push({
            time: now,
            position: currentPos
        });
        
        if (this.navigation.lastPositions.length > this.navigation.positionHistorySize) {
            this.navigation.lastPositions.shift();
        }
        
        let totalMovement = 0;
        for (let i = 1; i < this.navigation.lastPositions.length; i++) {
            totalMovement += this.navigation.lastPositions[i].position.distanceTo(
                this.navigation.lastPositions[i-1].position
            );
        }
        
        if (totalMovement < this.navigation.minMovement) {
            if (!this.stuckDetection.isStuck) {
                this.stuckDetection.stuckPosition = currentPos;
                this.stuckDetection.stuckTime = now;
            }
            this.stuckDetection.stuckTime += deltaTime;
            this.stuckDetection.isStuck = true;
        } else {
            this.stuckDetection.isStuck = false;
            this.stuckDetection.escapeAttempts = 0;
        }
        
        return this.stuckDetection.isStuck;
    }

    getForcedEscapeStrategy(now) {
        if (!this.stuckDetection.isStuck) return null;
        
        this.stuckDetection.escapeAttempts++;
        
        if (this.stuckDetection.escapeAttempts === 1) {
            return {
                type: 'backup',
                direction: this.velocity.clone().negate().normalize(),
                duration: 1.0,
                speedMultiplier: 0.7
            };
        }
        
        if (this.stuckDetection.escapeAttempts === 2) {
            return {
                type: 'rotate',
                angle: Math.PI/2 * (Math.random() > 0.5 ? 1 : -1),
                duration: 1.2,
                speedMultiplier: 1.0
            };
        }
        
        return {
            type: 'random',
            duration: 1.5,
            speedMultiplier: 1.5
        };
    }

    executeForcedEscape(deltaTime, now) {
        if (!this.checkIfStuck(now, deltaTime)) {
            return false;
        }
        
        const strategy = this.getForcedEscapeStrategy(now);
        if (!strategy) return false;
        
        switch(strategy.type) {
            case 'backup':
                this.velocity.x = strategy.direction.x * this.speed * strategy.speedMultiplier;
                this.velocity.z = strategy.direction.z * this.speed * strategy.speedMultiplier;
                break;
                
            case 'rotate':
                const currentDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
                const newDir = this.rotateDirection(currentDir, strategy.angle);
                this.velocity.x = newDir.x * this.speed * strategy.speedMultiplier;
                this.velocity.z = newDir.z * this.speed * strategy.speedMultiplier;
                break;
                
            case 'random':
                const randomDir = this.getRandomDirection();
                this.velocity.x = randomDir.x * this.speed * strategy.speedMultiplier;
                this.velocity.z = randomDir.z * this.speed * strategy.speedMultiplier;
                break;
        }
        
        if ((now - this.stuckDetection.stuckTime) / 1000 > this.stuckDetection.maxStuckTime) {
            this.velocity.y = this.jumpStrength * 1.3;
            this.stuckDetection.escapeAttempts = 0;
            this.stuckDetection.stuckTime = now;
        }
        
        return true;
    }

    calculateBaseEscapeDirection(kidPos, playerPos, enemyPos) {
        const escapeDir = new THREE.Vector3();
        const threats = [];

        if (playerPos) threats.push({ pos: playerPos, weight: 1.0 });
        if (enemyPos) threats.push({ pos: enemyPos, weight: 1.2 });

        threats.forEach(threat => {
            const dirFromThreat = new THREE.Vector3().subVectors(kidPos, threat.pos).normalize();
            const distance = kidPos.distanceTo(threat.pos);
            const weight = threat.weight * (1.5 / Math.max(0.5, distance));
            escapeDir.add(dirFromThreat.multiplyScalar(weight));
        });

        if (escapeDir.length() > 0) {
            escapeDir.normalize();
        } else {
            escapeDir.copy(this.getRandomDirection());
        }

        return escapeDir;
    }

    dynamicObstacleAvoidance(position, desiredDir, now) {
        const rayLength = 2.0;
        const hit = this.raycastForObstacles(desiredDir, rayLength);
        
        if (hit) {
            this.recordObstacleEncounter(hit.point, hit.normal, now);
            
            const sideAngle = Math.PI/3 * (Math.random() > 0.5 ? 1 : -1);
            const avoidanceDir = this.rotateDirection(desiredDir, sideAngle);
            
            const avoidanceHit = this.raycastForObstacles(avoidanceDir, rayLength);
            if (!avoidanceHit) {
                return avoidanceDir;
            } else {
                return this.rotateDirection(desiredDir, -sideAngle * 2);
            }
        }
        
        return desiredDir;
    }

    recordObstacleEncounter(position, normal, time) {
        this.navigation.obstacleHistory.push({
            position: position.clone(),
            normal: normal.clone(),
            time: time
        });
        
        if (this.navigation.obstacleHistory.length > this.navigation.historySize) {
            this.navigation.obstacleHistory.shift();
        }
        
        this.navigation.recentObstacles = this.navigation.obstacleHistory.filter(
            o => performance.now() - o.time < 2000
        ).length;
    }

    shouldJumpOverObstacle() {
        const raycast = this.raycastForObstacles(
            new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize(),
            1.2
        );
        return raycast && raycast.distance < 0.8 && raycast.normal.y > 0.3;
    }

    rotateDirection(dir, angle) {
        const newDir = dir.clone();
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = newDir.x * cos - newDir.z * sin;
        const z = newDir.x * sin + newDir.z * cos;
        return new THREE.Vector3(x, 0, z).normalize();
    }

    getRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();
    }

    recordEscapePosition(pos) {
        this.escapeMemory.unshift(pos.clone());
        if (this.escapeMemory.length > this.maxEscapeMemory) {
            this.escapeMemory.pop();
        }
    }

    avoidRecentPositions(kidPos, currentDir) {
        if (this.escapeMemory.length < 2) return currentDir;

        const lastDir = new THREE.Vector3().subVectors(
            this.escapeMemory[0],
            this.escapeMemory[1]
        ).normalize();

        const similarity = currentDir.dot(lastDir);

        if (similarity < -0.7) {
            return this.rotateDirection(currentDir, Math.PI / 2);
        }

        return currentDir;
    }

    /* MOVEMENT & BEHAVIOR METHODS */
    updateEscapingBehavior(deltaTime) {
        const now = performance.now();
        
        if (this.executeForcedEscape(deltaTime, now)) {
            return;
        }
        
        const kidPos = this.collider.end;
        const playerPos = this.player.end;
        const enemyPos = this.enemy?.collider?.end;
        let escapeDir = this.calculateBaseEscapeDirection(kidPos, playerPos, enemyPos);
        
        escapeDir = this.dynamicObstacleAvoidance(kidPos, escapeDir, now);
        
        if (Math.random() < 0.05) {
            escapeDir.add(this.getRandomDirection().multiplyScalar(0.3)).normalize();
        }

        const threatDistance = Math.min(
            kidPos.distanceTo(playerPos),
            enemyPos ? kidPos.distanceTo(enemyPos) : Infinity
        );
        
        const speedMultiplier = threatDistance < 5 ? this.escapeBoost : 1.0;
        this.velocity.x = escapeDir.x * this.speed * speedMultiplier;
        this.velocity.z = escapeDir.z * this.speed * speedMultiplier;
        
        if (this.onFloor && this.shouldJumpOverObstacle()) {
            const now = performance.now();
            if (now - this.lastJumpTime > this.jumpCooldown) {
                this.velocity.y = this.jumpStrength;
                this.lastJumpTime = now;
            }
        }

        this.updateRotation(deltaTime, kidPos.clone().add(escapeDir));
    }

    updateFollowingBehavior(deltaTime) {
        const kidPos = this.collider.end;
        const playerCenter = this.player.start.clone().add(this.player.end).multiplyScalar(0.5);

        const playerForward = getForwardVector();
        const playerRight = getSideVector();
        const targetPos = playerCenter
            .add(playerForward.clone().multiplyScalar(-0.8))
            .add(playerRight.clone().multiplyScalar(0.6));

        const direction = new THREE.Vector3().subVectors(targetPos, kidPos).normalize();
        direction.y = 0;

        const distance = kidPos.distanceTo(targetPos);

        if (distance > 1.2) {
            this.velocity.x = direction.x * this.followSpeed;
            this.velocity.z = direction.z * this.followSpeed;

            if (this.onFloor && this.player.end.y > kidPos.y + 0.5) {
                const now = performance.now();
                if (now - this.lastJumpTime > this.jumpCooldown) {
                    this.velocity.y = this.jumpStrength;
                    this.lastJumpTime = now;
                }
            }
        } else {
            this.velocity.x *= 0.9;
            this.velocity.z *= 0.9;
        }

        this.updateRotation(deltaTime, targetPos);
    }

    updateRotation(deltaTime, targetPos) {
        const direction = new THREE.Vector3().subVectors(targetPos, this.model.position).setY(0);
        if (direction.lengthSq() < 0.001) return;

        direction.normalize();
        const targetAngle = Math.atan2(direction.x, direction.z);
        let angleDiff = targetAngle - this.model.rotation.y;

        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const maxStep = this.rotationSpeed * deltaTime;
        const step = THREE.MathUtils.clamp(angleDiff * 2.5 * deltaTime, -maxStep, maxStep);
        this.model.rotation.y += step;
    }

    /* PHYSICS & COLLISION METHODS */
    detectCollisions() {
        const result = worldOctree.capsuleIntersect(this.collider);
        this.onFloor = false;

        if (result) {
            this.onFloor = result.normal.y > 0.5;

            if (result.depth > 1e-10) {
                this.collider.translate(result.normal.multiplyScalar(result.depth));

                if (this.onFloor) {
                    this.velocity.y = Math.max(0, this.velocity.y);
                    this.velocity.x *= 0.9;
                    this.velocity.z *= 0.9;
                } else {
                    const velocityAlongNormal = result.normal.dot(this.velocity);
                    this.velocity.addScaledVector(result.normal, -velocityAlongNormal * 1.3);
                }
            }
        }
    }

    raycastForObstacles(direction, distance = 1.5) {
        const rayOrigin = this.collider.start.clone().add(this.collider.end).multiplyScalar(0.5);
        const rayEnd = rayOrigin.clone().add(direction.clone().multiplyScalar(distance));

        const triangles = worldOctree.triangles;
        let closestIntersection = null;
        let closestDistance = Infinity;

        for (let i = 0; i < triangles.length; i++) {
            const triangle = triangles[i];
            const intersection = this.rayIntersectsTriangle(
                rayOrigin, rayEnd, triangle.a, triangle.b, triangle.c
            );

            if (intersection && intersection.distance < closestDistance) {
                closestIntersection = intersection;
                closestDistance = intersection.distance;
            }
        }

        return closestIntersection;
    }

    rayIntersectsTriangle(rayStart, rayEnd, a, b, c) {
        const edge1 = new THREE.Vector3().subVectors(b, a);
        const edge2 = new THREE.Vector3().subVectors(c, a);
        const rayVector = new THREE.Vector3().subVectors(rayEnd, rayStart);

        const h = new THREE.Vector3().crossVectors(rayVector, edge2);
        const det = edge1.dot(h);

        if (Math.abs(det) < Number.EPSILON) return null;

        const invDet = 1 / det;
        const s = new THREE.Vector3().subVectors(rayStart, a);
        const u = invDet * s.dot(h);
        if (u < 0 || u > 1) return null;

        const q = new THREE.Vector3().crossVectors(s, edge1);
        const v = invDet * rayVector.dot(q);
        if (v < 0 || u + v > 1) return null;

        const t = invDet * edge2.dot(q);
        if (t <= Number.EPSILON || t > 1) return null;

        return {
            point: rayStart.clone().add(rayVector.multiplyScalar(t)),
            normal: new THREE.Vector3().crossVectors(edge1, edge2).normalize(),
            distance: t * rayVector.length()
        };
    }

    /* VISUAL & UI METHODS */
    createKidIndicator() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        context.beginPath();
        context.arc(64, 64, 60, 0, 2 * Math.PI);
        context.fillStyle = '#ffcc00';
        context.fill();
        context.lineWidth = 5;
        context.strokeStyle = '#000000';
        context.stroke();

        context.fillStyle = '#000000';
        context.font = 'bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('!', 64, 64);

        this.indicator = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(canvas),
                depthTest: false
            })
        );
        this.indicator.scale.set(0.05, 0.05, 1);
        this.indicator.position.y = 2.5;
        this.model.add(this.indicator);
    }

    createKidHealthBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 10;
        this.healthBarContext = canvas.getContext('2d');

        this.healthBar = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(canvas),
                depthTest: false
            })
        );
        this.healthBar.scale.set(0.1, 0.02, 1);
        this.healthBar.position.y = 2.2;
        this.model.add(this.healthBar);
        this.updateHealthBar();
    }

    updateHealthBar() {
        const healthPercent = this.health / this.maxHealth;
        const ctx = this.healthBarContext;

        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 100, 10);

        ctx.fillStyle = healthPercent > 0.6 ? '#22cc22' :
            healthPercent > 0.3 ? '#cccc22' : '#cc2222';
        ctx.fillRect(0, 0, 100 * healthPercent, 10);

        this.healthBar.material.map.needsUpdate = true;
    }

    createColliderHelper() {
        const geometry = new THREE.CapsuleGeometry(
            this.collider.radius,
            this.collider.end.y - this.collider.start.y
        );
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        const helper = new THREE.Mesh(geometry, material);
        helper.position.copy(this.collider.start);
        return helper;
    }

    /* GAME LOGIC METHODS */
    checkPlayerProximity() {
        if (this.state === 'escaping' && !this.isDead) {
            const distance = this.collider.end.distanceTo(this.player.end);
            if (distance < 1.2) {
                this.state = 'following';
                this.playAnimation('follow');
                this.showMessage("¡El niño te sigue! Llévalo al punto seguro.");
            }
        }
    }

    checkSafePointReached() {
        if (this.state === 'following' && !this.isDead) {
            const distance = this.collider.end.distanceTo(this.safePoint);
            if (distance < 3) {
                this.state = 'rescued';
                this.rescued = true;
                this.indicator.visible = false;
                
                // Mostrar pantalla de juego completado
                this.showGameCompletedScreen();
                
                // Opcional: Detener el juego
                gamePaused = true;
                document.exitPointerLock();
            }
        }
    }
    
    showGameCompletedScreen() {
        // Crear el overlay de fondo
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        overlay.style.color = 'white';
        overlay.id = 'game-completed-overlay';
    
        // Título
        const title = document.createElement('h1');
        title.textContent = '¡MISIÓN COMPLETADA!';
        title.style.fontSize = '3em';
        title.style.marginBottom = '30px';
        title.style.color = '#4CAF50';
        title.style.textShadow = '0 0 10px rgba(76, 175, 80, 0.7)';
    
        // Mensaje
        const message = document.createElement('p');
        message.textContent = 'Has rescatado al niño con éxito';
        message.style.fontSize = '1.5em';
        message.style.marginBottom = '40px';
    
        // Botón de reinicio
        const restartButton = document.createElement('button');
        restartButton.textContent = 'REINICIAR JUEGO';
        restartButton.style.padding = '15px 30px';
        restartButton.style.fontSize = '1.2em';
        restartButton.style.backgroundColor = '#4CAF50';
        restartButton.style.color = 'white';
        restartButton.style.border = 'none';
        restartButton.style.borderRadius = '5px';
        restartButton.style.cursor = 'pointer';
        restartButton.style.transition = 'all 0.3s';
    
        // Efecto hover para el botón
        restartButton.onmouseover = () => {
            restartButton.style.backgroundColor = '#45a049';
            restartButton.style.transform = 'scale(1.05)';
        };
        restartButton.onmouseout = () => {
            restartButton.style.backgroundColor = '#4CAF50';
            restartButton.style.transform = 'scale(1)';
        };
    
        // Acción del botón
        restartButton.onclick = () => {
            location.reload(); // Recarga la página
        };
    
        // Añadir elementos al overlay
        overlay.appendChild(title);
        overlay.appendChild(message);
        overlay.appendChild(restartButton);
    
        // Añadir al documento
        document.body.appendChild(overlay);
    
        
    }

    checkEnemyProximity() {
        if (this.enemy && !this.isDead && !this.rescued) {
            const distance = this.collider.end.distanceTo(this.enemy.collider.end);
            if (distance < 1.5) {
                this.damageKid(10);
            }
        }
    }

    damageKid(amount) {
        const now = performance.now();
        if (now - this.lastDamageTime < this.damageCooldown) return;

        this.lastDamageTime = now;
        this.health = Math.max(0, this.health - amount);
        this.updateHealthBar();

        this.model.traverse(child => {
            if (child.isMesh) {
                child.material.emissive = new THREE.Color(0xff0000);
                setTimeout(() => child.material.emissive = new THREE.Color(0x000000), 200);
            }
        });

        if (this.health <= 0 && !this.isDead) {
            this.kidDeath();
        }
    }

    kidDeath() {
        this.isDead = true;
        this.state = 'dead';
        this.indicator.visible = false;
        this.healthBar.visible = false;
        if (document.pointerLockElement === container) {
            document.exitPointerLock();
        }
        
        // Mostrar pantalla de misión fallida
        this.showMissionFailedScreen();
        
        // Opcional: Detener el juego
        gamePaused = true;
        document.exitPointerLock();
        
        // Resto de tu código existente...
        this.model.rotation.x = Math.PI / 2;
        this.collider.start.y = 0.1;
        this.collider.end.y = 0.2;
    }
    
    showMissionFailedScreen() {
        // Crear el overlay de fondo
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        overlay.style.color = 'white';
        overlay.id = 'mission-failed-overlay';
    
        // Título con efecto de "sangrado"
        const title = document.createElement('h1');
        title.textContent = 'MISIÓN FALLIDA';
        title.style.fontSize = '3.5em';
        title.style.marginBottom = '20px';
        title.style.color = '#ff3333';
        title.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.7)';
        title.style.fontFamily = '"Arial Black", sans-serif';
        title.style.letterSpacing = '2px';
    
        // Mensaje de derrota
        const message = document.createElement('p');
        message.textContent = 'El niño no ha sobrevivido...';
        message.style.fontSize = '1.8em';
        message.style.marginBottom = '10px';
        message.style.opacity = '0.9';
    
        // Mensaje secundario
        const subMessage = document.createElement('p');
        subMessage.textContent = 'El enemigo ha capturado al niño';
        subMessage.style.fontSize = '1.2em';
        subMessage.style.marginBottom = '40px';
        subMessage.style.opacity = '0.7';
    
        // Botón de reinicio con estilo de emergencia
        const restartButton = document.createElement('button');
        restartButton.textContent = 'REINTENTAR';
        restartButton.style.padding = '15px 40px';
        restartButton.style.fontSize = '1.3em';
        restartButton.style.backgroundColor = '#ff3333';
        restartButton.style.color = 'white';
        restartButton.style.border = 'none';
        restartButton.style.borderRadius = '5px';
        restartButton.style.cursor = 'pointer';
        restartButton.style.transition = 'all 0.3s';
        restartButton.style.fontWeight = 'bold';
        restartButton.style.boxShadow = '0 0 15px rgba(255, 51, 51, 0.6)';
    
        // Efecto hover para el botón
        restartButton.onmouseover = () => {
            restartButton.style.backgroundColor = '#e60000';
            restartButton.style.transform = 'scale(1.05)';
            restartButton.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
        };
        
        restartButton.onmouseout = () => {
            restartButton.style.backgroundColor = '#ff3333';
            restartButton.style.transform = 'scale(1)';
            restartButton.style.boxShadow = '0 0 15px rgba(255, 51, 51, 0.6)';
        };
    
        // Acción del botón - recarga la página
        restartButton.onclick = () => {
            location.reload(true); // Fuerza recarga desde el servidor
        };
    
        // Añadir elementos al overlay
        overlay.appendChild(title);
        overlay.appendChild(message);
        overlay.appendChild(subMessage);
        overlay.appendChild(restartButton);
    
        // Añadir al documento
        document.body.appendChild(overlay);
    
        // Efectos de sonido y música
        if (bgMusic) {
            // Detener música abruptamente para efecto dramático
            bgMusic.pause();
            bgMusic.currentTime = 0;
            
            // Aquí podrías añadir un sonido de derrota
            // playSound('failure-sound.mp3');
        }
    
        // Efecto visual de "sangre" (opcional)
        this.createBloodEffect();
    }

    findValidKidPosition() {
        const testPosition = new THREE.Vector3(10, 1, 10);
        console.log('Usando posición de prueba para Kid:', testPosition);
        return testPosition;
    }

    /* DEBUG & UTILITY METHODS */
    showMessage(text, color = "#ffffff") {
        const message = document.createElement('div');
        message.style.position = 'absolute';
        message.style.top = '100px';
        message.style.left = '50%';
        message.style.transform = 'translateX(-50%)';
        message.style.backgroundColor = 'rgba(0,0,0,0.7)';
        message.style.color = color;
        message.style.padding = '15px 20px';
        message.style.borderRadius = '5px';
        message.style.fontSize = '18px';
        message.style.fontWeight = 'bold';
        message.style.zIndex = '1000';
        message.textContent = text;

        document.body.appendChild(message);

        setTimeout(() => {
            message.style.opacity = '0';
            message.style.transition = 'opacity 1s';
            setTimeout(() => message.remove(), 1000);
        }, 3000);
    }

    debugAnimations() {
        console.group('Diagnóstico de animaciones del Kid');
        
        console.log('Animaciones registradas:');
        for (const name in this.animations) {
            const anim = this.animations[name];
            console.log(`- ${name}: ${anim ? 'Disponible' : 'No disponible'}`);
            
            if (anim) {
                console.log(`  * Ejecutando: ${anim.isRunning()}`);
                console.log(`  * Peso: ${anim.getEffectiveWeight()}`);
                console.log(`  * TimeScale: ${anim.timeScale}`);
            }
        }
        
        console.log('Estado del mixer:');
        console.log('- Disponible:', !!this.mixer);
        if (this.mixer) {
            console.log('- Acciones activas:', this.mixer._actions ? this.mixer._actions.length : 0);
        }
        
        let bonesFound = 0;
        if (this.model) {
            this.model.traverse(child => {
                if (child.isBone) bonesFound++;
                if (child.isSkinnedMesh) {
                    console.log('- Malla con skin encontrada:', child.name);
                    console.log('  * Bones en skeleton:', child.skeleton.bones.length);
                }
            });
            console.log('- Total bones encontrados:', bonesFound);
        }
        
        console.groupEnd();
        
        if (bonesFound > 0 && (!this.currentAction || !this.currentAction.isRunning())) {
            console.log('Intentando reparar animaciones...');
            if (this.animations['run']) {
                this.forcePlayAnimation('run');
            }
        }
    }

    toggleDebugVisualization() {
        if (this.debugObjects) {
            this.debugObjects.forEach(obj => this.scene.remove(obj));
            this.debugObjects = null;
        } else {
            this.debugObjects = [];
            
            const cornerSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.3),
                new THREE.MeshBasicMaterial({ 
                    color: this.stuckDetection.isStuck ? 0xff0000 : 0x00ff00 
                })
            );
            cornerSphere.position.copy(this.model.position);
            cornerSphere.position.y += 2;
            this.scene.add(cornerSphere);
            this.debugObjects.push(cornerSphere);
            
            const historyPoints = this.navigation.obstacleHistory.map(o => o.position);
            if (historyPoints.length > 1) {
                const historyGeometry = new THREE.BufferGeometry().setFromPoints(historyPoints);
                const historyLine = new THREE.Line(
                    historyGeometry,
                    new THREE.LineBasicMaterial({ color: 0xffff00 })
                );
                this.scene.add(historyLine);
                this.debugObjects.push(historyLine);
            }
        }
    }

    /* MAIN UPDATE METHOD */
    update(deltaTime) {
        if (!this.mixer || this.isDead || playerIsDead) return;

        // Actualizar animaciones
        if (this.currentAction && !this.currentAction.isRunning()) {
            this.currentAction.play();
        }
        this.mixer.update(deltaTime);

        // Gravedad
        if (!this.onFloor) {
            this.velocity.y -= GRAVITY * this.gravityMultiplier * deltaTime;
            if (this.model.position.y < -10) {
                this.model.position.set(10, 10, 10);
                this.collider.start.set(10, 10, 10);
                this.collider.end.set(10, 10 + 1.5, 10);
                this.velocity.set(0, 0, 0);
            }
        } else {
            this.velocity.y = Math.max(0, this.velocity.y);
        }

        // Comportamiento según estado
        if (this.state === 'escaping') {
            this.updateEscapingBehavior(deltaTime);
            if (this.animations['run'] && this.currentAction !== this.animations['run']) {
                this.playAnimation('run');
            }
        } else if (this.state === 'following') {
            this.updateFollowingBehavior(deltaTime);
            if (this.animations['follow'] && this.currentAction !== this.animations['follow']) {
                this.playAnimation('follow');
            }
        }

        // Fricción
        const damping = Math.exp(-4 * deltaTime) - 1;
        this.velocity.x += this.velocity.x * (this.onFloor ? damping : damping * 0.1);
        this.velocity.z += this.velocity.z * (this.onFloor ? damping : damping * 0.1);

        // Movimiento
        const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);
        this.collider.translate(deltaPosition);

        this.detectCollisions();
        this.model.position.copy(this.collider.start);

        // Actualizar UI y comprobaciones
        this.updateHealthBar();
        this.checkPlayerProximity();
        this.checkSafePointReached();
        this.checkEnemyProximity();

        // Debug
        if (this.colliderHelper && this.colliderHelper.visible) {
            this.colliderHelper.position.copy(this.collider.start);
        }
        this.updateSafePointEffect(deltaTime);
    }
    updateSafePointEffect(deltaTime) {
        if (!this.safePointMarker) return;

        // Animación de pulsación
        if (this.safePointPulse.growing) {
            this.safePointPulse.scale += deltaTime * this.safePointPulse.speed;
            if (this.safePointPulse.scale >= 1.2) {
                this.safePointPulse.growing = false;
            }
        } else {
            this.safePointPulse.scale -= deltaTime * this.safePointPulse.speed;
            if (this.safePointPulse.scale <= 0.8) {
                this.safePointPulse.growing = true;
            }
        }

        // Aplicar escala
        this.safePointMarker.scale.set(
            this.safePointPulse.scale,
            1,
            this.safePointPulse.scale
        );

        // Parpadeo de la luz
        this.safePointLight.intensity = 3 + Math.sin(performance.now() * 0.002) * 2;
    }
}



// ==================== CARGADOR DE KID ====================
function loadKidModel() {
    const fbxLoader = new FBXLoader();

    console.log('Iniciando carga del modelo Kid...');

    fbxLoader.load('./kid/kid_run.fbx', (runModel) => {
        console.log('✅ Modelo Kid cargado correctamente');

        // Verificar animaciones en el modelo run
        if (runModel.animations && runModel.animations.length > 0) {
            console.log('✅ El modelo contiene', runModel.animations.length, 'animaciones:');
            runModel.animations.forEach((anim, index) => {
                console.log(`   - Animación ${index}: ${anim.name}, Duración: ${anim.duration}s`);
            });
        } else {
            console.error('❌ El modelo no contiene animaciones');
        }

        // Continuar con la carga de la segunda animación
        fbxLoader.load('./kid/kid_follow.fbx', (followAnim) => {
            console.log('✅ Animación de seguimiento cargada');

            // Verificar animaciones en el modelo follow
            if (followAnim.animations && followAnim.animations.length > 0) {
                console.log('✅ El modelo follow contiene', followAnim.animations.length, 'animaciones:');
                followAnim.animations.forEach((anim, index) => {
                    console.log(`   - Animación ${index}: ${anim.name}, Duración: ${anim.duration}s`);
                });
            } else {
                console.error('❌ El modelo follow no contiene animaciones');
            }

            // Crear el Kid con los modelos cargados
            const kid = new Kid({
                model: runModel,
                runClips: runModel.animations || [],
                followClips: followAnim.animations || []
            }, scene, playerCollider, enemy);

            // Verificar la creación de animaciones
            console.log('Estado de las animaciones del Kid:');
            console.log('- Run:', kid.animations['run'] ? '✅ Creada' : '❌ No creada');
            console.log('- Follow:', kid.animations['follow'] ? '✅ Creada' : '❌ No creada');

            entities.push(kid);
        }, undefined, (error) => {
            console.error('Error cargando animación follow:', error);
            const kid = new Kid({
                model: runModel,
                runClips: runModel.animations || [],
                followClips: []
            }, scene, playerCollider, enemy);
            entities.push(kid);
        });

    }, undefined, (error) => {
        console.error('Error cargando modelo Kid:', error);
        createFallbackKid();
    });
}

// Añade esta función justo después de la función loadKidModel
function checkAndFixKidAnimations() {
    // Buscar el Kid en las entidades
    const kid = entities.find(e => e instanceof Kid);
    if (!kid) return;

    console.log('Verificando animaciones del Kid...');

    // Verificar si el mixer tiene tracks de animación
    if (kid.mixer) {
        const hasActiveTracks = kid.mixer._actions && kid.mixer._actions.length > 0;
        console.log('El mixer tiene tracks activos:', hasActiveTracks);

        if (!hasActiveTracks) {
            console.log('Intentando crear animación manualmente...');

            // Verificar si el modelo tiene un esqueleto (skeleton)
            let skeletonFound = false;
            kid.model.traverse(child => {
                if (child.isSkinnedMesh && child.skeleton) {
                    skeletonFound = true;
                    console.log('Esqueleto encontrado:', child.skeleton);
                }
            });

            if (!skeletonFound) {
                console.error('El modelo no tiene esqueleto para animar');
            }
        }
    }
}

// Llama a esta función después de un tiempo para asegurarte que el Kid ya está cargado
setTimeout(checkAndFixKidAnimations, 3000);



let enemy = null;
let healthBarElements;

// ==================== SISTEMA DE SALUD ====================

function createHealthBar() {
    const healthBarContainer = document.createElement('div');
    healthBarContainer.id = 'health-bar-container';
    healthBarContainer.style.position = 'absolute';
    healthBarContainer.style.bottom = '20px';
    healthBarContainer.style.left = '20px';
    healthBarContainer.style.width = '300px';
    healthBarContainer.style.height = '30px';
    healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    healthBarContainer.style.borderRadius = '5px';
    healthBarContainer.style.padding = '5px';
    healthBarContainer.style.zIndex = '100';

    const healthText = document.createElement('div');
    healthText.id = 'health-text';
    healthText.style.position = 'absolute';
    healthText.style.top = '50%';
    healthText.style.left = '50%';
    healthText.style.transform = 'translate(-50%, -50%)';
    healthText.style.color = 'white';
    healthText.style.fontFamily = 'Arial, sans-serif';
    healthText.style.fontSize = '14px';
    healthText.style.fontWeight = 'bold';
    healthText.style.zIndex = '102';

    const healthBarBg = document.createElement('div');
    healthBarBg.style.width = '100%';
    healthBarBg.style.height = '100%';
    healthBarBg.style.backgroundColor = '#333';
    healthBarBg.style.borderRadius = '3px';
    healthBarBg.style.zIndex = '101';

    const healthBarFill = document.createElement('div');
    healthBarFill.id = 'health-bar-fill';
    healthBarFill.style.width = '100%';
    healthBarFill.style.height = '100%';
    healthBarFill.style.backgroundColor = '#4CAF50';
    healthBarFill.style.borderRadius = '3px';
    healthBarFill.style.transition = 'width 0.3s, background-color 0.3s';

    healthBarContainer.appendChild(healthBarBg);
    healthBarBg.appendChild(healthBarFill);
    healthBarContainer.appendChild(healthText);
    document.body.appendChild(healthBarContainer);

    return { container: healthBarContainer, fill: healthBarFill, text: healthText };
}

function updateHealthBar() {
    if (!healthBarElements) return;

    const healthPercentage = (playerHealth / PLAYER_MAX_HEALTH) * 100;
    healthBarElements.fill.style.width = `${healthPercentage}%`;
    healthBarElements.text.textContent = `${playerHealth}/${PLAYER_MAX_HEALTH}`;

    if (healthPercentage > 60) {
        healthBarElements.fill.style.backgroundColor = '#4CAF50';
    } else if (healthPercentage > 30) {
        healthBarElements.fill.style.backgroundColor = '#ff9800';
    } else {
        healthBarElements.fill.style.backgroundColor = '#f44336';
    }
}

function damagePlayer(amount) {
    const currentTime = performance.now();
    if (currentTime - lastDamageTime < DAMAGE_COOLDOWN) return;

    lastDamageTime = currentTime;
    playerHealth = Math.max(0, playerHealth - amount);
    updateHealthBar();
    flashDamageEffect();

    if (playerHealth <= 0 && !playerIsDead) {
        playerDeath();
    }
}

function flashDamageEffect() {
    const damageOverlay = document.createElement('div');
    damageOverlay.style.position = 'absolute';
    damageOverlay.style.top = '0';
    damageOverlay.style.left = '0';
    damageOverlay.style.width = '100%';
    damageOverlay.style.height = '100%';
    damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    damageOverlay.style.pointerEvents = 'none';
    damageOverlay.style.zIndex = '99';
    damageOverlay.style.transition = 'opacity 0.5s ease-out';

    document.body.appendChild(damageOverlay);

    setTimeout(() => {
        damageOverlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(damageOverlay);
        }, 500);
    }, 100);
}

function playerDeath() {
    playerIsDead = true;
     // Limpiar pantalla de completado si existe
     const existingOverlay = document.getElementById('game-completed-overlay');
     if (existingOverlay) {
         existingOverlay.remove();
     }

    const deathScreen = document.createElement('div');
    deathScreen.id = 'death-screen';
    deathScreen.style.position = 'absolute';
    deathScreen.style.top = '0';
    deathScreen.style.left = '0';
    deathScreen.style.width = '100%';
    deathScreen.style.height = '100%';
    deathScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    deathScreen.style.color = 'red';
    deathScreen.style.fontSize = '32px';
    deathScreen.style.fontWeight = 'bold';
    deathScreen.style.display = 'flex';
    deathScreen.style.flexDirection = 'column';
    deathScreen.style.justifyContent = 'center';
    deathScreen.style.alignItems = 'center';
    deathScreen.style.zIndex = '1000';

    const deathText = document.createElement('div');
    deathText.textContent = 'HAS MUERTO';
    deathText.style.marginBottom = '20px';

    const respawnButton = document.createElement('button');
    respawnButton.textContent = 'Reiniciar';
    respawnButton.style.padding = '10px 20px';
    respawnButton.style.fontSize = '18px';
    respawnButton.style.cursor = 'pointer';
    respawnButton.style.backgroundColor = '#f44336';
    respawnButton.style.color = 'white';
    respawnButton.style.border = 'none';
    respawnButton.style.borderRadius = '5px';

    respawnButton.addEventListener('click', () => {
        respawnPlayer();
        document.body.removeChild(deathScreen);
    });

    deathScreen.appendChild(deathText);
    deathScreen.appendChild(respawnButton);
    document.body.appendChild(deathScreen);

    if (document.pointerLockElement === container) {
        document.exitPointerLock();
    }
}

function respawnPlayer() {
    playerHealth = PLAYER_MAX_HEALTH;
    updateHealthBar();
    playerIsDead = false;
    resetPlayerPosition();

    if (enemy) {
        const validPosition = findValidEnemyPosition();
        enemy.collider.start.copy(validPosition);
        enemy.collider.end.set(validPosition.x, validPosition.y + 1, validPosition.z);
        enemy.model.position.copy(validPosition);
    }
}

function resetPlayerPosition() {
    playerCollider.start.set(0, 2, 0);
    playerCollider.end.set(0, 3, 0);
    camera.position.copy(playerCollider.end);
    playerVelocity.set(0, 0, 0);
    cameraRotationX = 0;
    cameraRotationY = 0;
    camera.quaternion.setFromEuler(new THREE.Euler(
        cameraRotationX,
        cameraRotationY,
        0,
        'YXZ'
    ));
}

function initHealthSystem() {
    healthBarElements = createHealthBar();
    updateHealthBar();
}

// ==================== CARGADOR DE ENEMIGOS ====================
function loadEnemyModel() {
    const fbxLoader = new FBXLoader();

    fbxLoader.load('./npc/enemy_run.fbx', (runModel) => {
        console.log('Modelo Enemy con animación run cargado:', runModel);

        runModel.scale.set(0.01, 0.01, 0.01);
        runModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const animationLoader = new FBXLoader();
        const animations = {
            mainClips: runModel.animations || [],
            attackClips: [],
            jumpClips: []
        };

        let loadedCount = 0;
        const totalAnimations = 2;

        function checkAllLoaded() {
            loadedCount++;
            if (loadedCount === totalAnimations) {
                enemy = new Enemy({
                    model: runModel,
                    mainClips: animations.mainClips,
                    attackClips: animations.attackClips,
                    jumpClips: animations.jumpClips
                }, scene, playerCollider);

                entities.push(enemy); // ← Asegúrate de que entities exista

                initHealthSystem();

                // Debug
                console.log('Animaciones cargadas para Enemy:');
                if (animations.mainClips.length > 0) console.log('Main:', animations.mainClips[0].name);
                if (animations.attackClips.length > 0) console.log('Attack:', animations.attackClips[0].name);
                if (animations.jumpClips.length > 0) console.log('Jump:', animations.jumpClips[0].name);
            }
        }

        animationLoader.load('./npc/enemy_attack.fbx', (attackAnim) => {
            console.log('Animación attack cargada:', attackAnim);
            if (attackAnim.animations && attackAnim.animations.length > 0) {
                animations.attackClips = attackAnim.animations;
            }
            checkAllLoaded();
        }, undefined, (error) => {
            console.error('Error cargando animación attack:', error);
            checkAllLoaded();
        });

        animationLoader.load('./npc/enemy_jump.fbx', (jumpAnim) => {
            console.log('Animación jump cargada:', jumpAnim);
            if (jumpAnim.animations && jumpAnim.animations.length > 0) {
                animations.jumpClips = jumpAnim.animations;
            }
            checkAllLoaded();
        }, undefined, (error) => {
            console.error('Error cargando animación jump:', error);
            checkAllLoaded();
        });

    }, undefined, (error) => {
        console.error('Error cargando modelo Enemy:', error);
        createFallbackEnemy();
    });
}


// Función auxiliar para crear el enemigo de respaldo (cubo rojo)
function createFallbackEnemy() {
    console.warn("Creando enemigo de respaldo (cubo rojo).");
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(geometry, material);
    // Posiciona el cubo de respaldo donde normalmente iría el enemigo
    const fallbackPosition = findValidEnemyPosition(); // Intenta encontrar una posición válida
    cube.position.copy(fallbackPosition);
    scene.add(cube);
    // Crear instancia de Enemy con el cubo y sin animaciones
    enemy = new Enemy({ model: cube, mainClips: [], attackClips: [] }, scene, playerCollider);
    initHealthSystem(); // Asegúrate de inicializar la UI de salud también para el fallback
}


// ==================== FUNCIONES DEL JUEGO ====================

function animate() {
    if (gamePaused) {
        renderer.render(scene, camera); // Solo renderiza la escena pausada
        return;
    }

    const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;
    debugFrameCount++;

    if (!helper.visible && !playerIsDead) {
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
            controls(deltaTime);
            updatePlayer(deltaTime);
            updateSpheres(deltaTime);

            entities.forEach(entity => {
                if (entity.update) entity.update(deltaTime);
            });

            teleportPlayerIfOob();
        }
    }

    renderer.render(scene, camera);
    stats.update();
}
// Obtener referencia al audio
const bgMusic = document.getElementById('background-music');

// Función para controlar la música
function initAudio() {
    // Configuración inicial
    bgMusic.volume = 0.5; // Volumen al 50%
    
    // Para autoplay en algunos navegadores necesitas esto:
    document.addEventListener('click', () => {
        bgMusic.play().catch(e => console.log("Autoplay preventado:", e));
    }, { once: true });
}

// Llamar al inicializar el juego
initAudio();
function pauseGame() {
    gamePaused = true;
    bgMusic.pause();
    // Pausar todos los sonidosHowler.volume(0); // Si usas howler.js
    // O implementa tu propio sistema de pausa de audio
    entities.forEach(entity => {
        if (entity.mixer) entity.mixer.timeScale = 0;
    });
    
    document.exitPointerLock();
    createPauseMenu();
}

function resumeGame() {
    gamePaused = false;
    bgMusic.play().catch(e => console.log("Error al reanudar música:", e));
    
    // Reanudar sonidosHowler.volume(1); // Si usas howler.js
    entities.forEach(entity => {
        if (entity.mixer) entity.mixer.timeScale = 1;
    });
    
    if (pauseMenu) {
        document.body.removeChild(pauseMenu);
        pauseMenu = null;
    }
    container.requestPointerLock();

}

function togglePause() {
    if (gamePaused) {
        resumeGame();
    } else {
        pauseGame();
    }
}
function createPauseMenu() {
    if (pauseMenu) return;

    pauseMenu = document.createElement('div');
    pauseMenu.style.position = 'absolute';
    pauseMenu.style.top = '0';
    pauseMenu.style.left = '0';
    pauseMenu.style.width = '100%';
    pauseMenu.style.height = '100%';
    pauseMenu.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    pauseMenu.style.display = 'flex';
    pauseMenu.style.flexDirection = 'column';
    pauseMenu.style.justifyContent = 'center';
    pauseMenu.style.alignItems = 'center';
    pauseMenu.style.zIndex = '1000';
    pauseMenu.style.color = 'white';

    const title = document.createElement('h1');
    title.textContent = 'JUEGO PAUSADO';
    title.style.fontSize = '48px';
    title.style.marginBottom = '30px';

    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'Continuar (ESC)';
    resumeBtn.style.padding = '15px 30px';
    resumeBtn.style.fontSize = '20px';
    resumeBtn.style.margin = '10px';
    resumeBtn.style.cursor = 'pointer';

    const quitBtn = document.createElement('button');
    quitBtn.textContent = 'Reiniciar';
    quitBtn.style.padding = '15px 30px';
    quitBtn.style.fontSize = '20px';
    quitBtn.style.margin = '10px';
    quitBtn.style.cursor = 'pointer';

    resumeBtn.addEventListener('click', resumeGame);
    quitBtn.addEventListener('click', () => {
        // Aquí puedes redirigir al menú principal
        location.reload(); // Por ahora solo recarga
    });

    pauseMenu.appendChild(title);
    pauseMenu.appendChild(resumeBtn);
    pauseMenu.appendChild(quitBtn);
    document.body.appendChild(pauseMenu);
}

function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;
        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }
        if (result.depth >= 1e-10) {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);
    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);
    playerCollisions();
    camera.position.copy(playerCollider.end);
}

function playerSphereCollision(sphere) {
    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);
    const sphere_center = sphere.collider.center;
    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    for (const point of [playerCollider.start, playerCollider.end, center]) {
        const d2 = point.distanceToSquared(sphere_center);
        if (d2 < r2) {
            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);
            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, -d);
        }
    }
}

function spheresCollisions() {
    for (let i = 0, length = spheres.length; i < length; i++) {
        const s1 = spheres[i];
        for (let j = i + 1; j < length; j++) {
            const s2 = spheres[j];
            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {
                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);
                const d = (r - Math.sqrt(d2)) / 2;
                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, -d);
            }
        }
    }
}

function updateSpheres(deltaTime) {
    spheres.forEach(sphere => {
        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);
        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {
            sphere.velocity.addScaledVector(result.normal, -result.normal.dot(sphere.velocity) * 1.5);
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
        } else {
            sphere.velocity.y -= GRAVITY * deltaTime;
        }

        const damping = Math.exp(-1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);
        playerSphereCollision(sphere);
    });

    spheresCollisions();

    for (const sphere of spheres) {
        sphere.mesh.position.copy(sphere.collider.center);
    }
}

function getForwardVector() {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    return forward;
}

function getSideVector() {
    const side = new THREE.Vector3(1, 0, 0);
    side.applyQuaternion(camera.quaternion);
    side.y = 0;
    side.normalize();
    return side;
}

function controls(deltaTime) {
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }
    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }
    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }
    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }
    if (playerOnFloor && keyStates['Space']) {
        playerVelocity.y = 15;
    }
}

function teleportPlayerIfOob() {
    if (camera.position.y <= -10) {
        resetPlayerPosition();
    }
}

// ==================== EVENTOS ====================

document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
        togglePause();
        return; // Evita que se procese como otra tecla
    }
    
    if (!gamePaused) {
        keyStates[event.code] = true;
    }
});

document.addEventListener('keyup', (event) => {
    if (!gamePaused) {
        keyStates[event.code] = false;
    }
});

container.addEventListener('mousedown', async () => {
    if (document.pointerLockElement !== container && !playerIsDead) {
        try {
            await container.requestPointerLock();
        } catch (err) {
            console.warn("No se pudo bloquear el puntero:", err);
        }
    }
});



document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === container) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        cameraRotationY -= movementX * cameraRotationSpeed;
        cameraRotationX -= movementY * cameraRotationSpeed;
        cameraRotationX = Math.max(-cameraPitchLimit, Math.min(cameraPitchLimit, cameraRotationX));

        camera.quaternion.setFromEuler(new THREE.Euler(
            cameraRotationX,
            cameraRotationY,
            0,
            'YXZ'
        ));
    }
});

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === container) {
        console.log("Puntero bloqueado ✅");
        lockButton.style.display = "none";
    } else {
        console.log("Puntero liberado ❌");
        lockButton.style.display = "block";
    }
});

document.addEventListener("pointerlockerror", () => {
    console.error("Error con el bloqueo del puntero");
});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== CARGA DEL MAPA ====================

const loader = new GLTFLoader();
const helper = new OctreeHelper(worldOctree);
helper.visible = false;
scene.add(helper);

const gui = new GUI({ width: 200 });
const debugFolder = gui.addFolder('Debug');
debugFolder.add({ debug: false }, 'debug').onChange(function (value) {
    helper.visible = value;
    if (enemy) {
        enemy.setDebugVisible(value);
    }
});

const enemyFolder = gui.addFolder('Enemigo');
enemyFolder.add({ speed: 3.0 }, 'speed', 1.0, 10.0).onChange(function (value) {
    if (enemy) {
        enemy.speed = value;
    }
});

loader.load('./sketchfab_model/map.glb', (gltf) => {
    console.log('Mapa cargado:', gltf);
    const model = gltf.scene;
    scene.add(model);

    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    model.position.sub(center);

    worldOctree.fromGraphNode(model);

    model.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material.map) {
                child.material.map.anisotropy = 4;
            }
        }
    });

    playerCollider.start.set(0, 2, 0);
    playerCollider.end.set(0, 3, 0);
    camera.position.copy(playerCollider.end);

    cameraRotationY = 0;
    cameraRotationX = 0;
    camera.quaternion.setFromEuler(new THREE.Euler(
        cameraRotationX,
        cameraRotationY,
        0,
        'YXZ'
    ));

    loadKidModel();
    loadEnemyModel();
}, undefined, (error) => {
    console.error('Error al cargar el mapa:', error);
});

// Iniciar bucle de animación
renderer.setAnimationLoop(animate);