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

// Clase Enemy optimizada
// Asegúrate de tener acceso a worldOctree (definido globalmente)
// import { worldOctree } from './main.js'; // O como lo tengas referenciado

// --- Constantes de Configuración del Enemigo ---
const ENEMY_JUMP_FORCE = 10;           // Fuerza del salto del enemigo (ajustar)
const ENEMY_JUMP_CHECK_DISTANCE = 1.5; // Qué tan adelante revisar para saltar obstáculos
const ENEMY_JUMP_VERTICAL_THRESHOLD = 0.5; // Cuánta diferencia de altura activa el salto hacia el jugador
const ENEMY_MAX_JUMP_HEIGHT_DIFF = 2.0; // Máxima diferencia de altura que intentará saltar
const ENEMY_ATTACK_RANGE_SQ = 1.8 * 1.8; // Cuadrado de la distancia de ataque
const ENEMY_JUMP_COOLDOWN = 1.0;       // 1 segundo de cooldown para saltar de nuevo
const ENEMY_ROTATION_SPEED = 7.0;      // Velocidad de rotación
const ENEMY_DEFAULT_SPEED = 3.0;       // Velocidad de movimiento base


class Enemy {
    constructor(config, scene, playerCollider, worldOctreeRef) { // Pasar referencia al Octree
        this.model = config.model;
        this.mainClips = config.mainClips || [];
        this.attackClips = config.attackClips || [];
        this.playerCollider = playerCollider; // Referencia al colisionador del jugador
        this.scene = scene;
        this.worldOctree = worldOctreeRef; // Guardar referencia al Octree
        this.animations = {};
        this.currentAction = null;
        this.mixer = null; // Inicializar mixer a null

        // --- Configuración del modelo ---
        this.model.scale.set(0.01, 0.01, 0.01); // Ajusta la escala si es necesario
        this.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // --- Posicionamiento inicial (requiere findValidEnemyPosition global) ---
        // Asumiendo que findValidEnemyPosition está disponible globalmente
        // const validPosition = findValidEnemyPosition(); // Función global
        // O si no, pasar una posición inicial
        const validPosition = config.initialPosition || new THREE.Vector3(10, 0.5, 10);
        this.model.position.copy(validPosition);
        this.scene.add(this.model);

        // --- Configuración del colisionador ---
        this.collider = new Capsule(
            new THREE.Vector3(validPosition.x, validPosition.y, validPosition.z),
            new THREE.Vector3(validPosition.x, validPosition.y + 1.0, validPosition.z), // Ajusta altura si es necesario
            0.3 // Ajusta radio si es necesario
        );

        // --- Configuración de Animación ---
        if (this.model && this.model.animations) { // Asegurarse de que el modelo tenga animaciones
             this.mixer = new THREE.AnimationMixer(this.model);
             this.actionFinishedListener = null;

             // Procesar animación principal
             if (this.mainClips.length > 0) {
                 const mainClip = this.mainClips[0];
                 this.animations['main'] = this.mixer.clipAction(mainClip);
                 this.animations['main'].setEffectiveWeight(1.0).setLoop(THREE.LoopRepeat).setEnabled(true);
             } else {
                 console.warn("Enemigo no tiene animación principal (mainClips).");
             }

             // Procesar animación de ataque
             if (this.attackClips.length > 0) {
                 const attackClip = this.attackClips[0];
                 this.animations['attack'] = this.mixer.clipAction(attackClip);
                 this.animations['attack'].setLoop(THREE.LoopOnce).clampWhenFinished = true;
                 this.animations['attack'].setEffectiveWeight(1.0).setEnabled(true);
             } else {
                  console.warn("Enemigo no tiene animación de ataque (attackClips).");
             }

             // Establecer animación inicial y listener
             if (this.animations['main']) {
                 this.currentAction = this.animations['main'];
                 this.currentAction.play();

                 if (this.animations['attack']) {
                     this.actionFinishedListener = (e) => {
                         if (e.action === this.animations['attack']) {
                             this.playAnimation('main'); // Volver a 'main' después del ataque
                         }
                     };
                     this.mixer.addEventListener('finished', this.actionFinishedListener);
                 }
             } else {
                  console.error("Enemigo no puede iniciar animación principal.");
             }
        } else {
             console.error("Modelo del enemigo no encontrado o no tiene 'animations'.");
        }

        // --- Propiedades de Movimiento y Estado ---
        this.velocity = new THREE.Vector3();
        this.onFloor = false;
        this.speed = ENEMY_DEFAULT_SPEED;
        this.rotationSpeed = ENEMY_ROTATION_SPEED;
        this.isMoving = false;

        // --- Propiedades de Ataque ---
        this.attackDamage = 10;
        this.attackCooldown = 2.0; // s
        this.lastAttackTime = -Infinity; // Permitir ataque inmediato al inicio

        // --- Propiedades de Salto ---
        this.canJump = true;
        this.jumpCooldownTimer = 0;
        this.targetPosition = new THREE.Vector3(); // Dónde quiere ir

        // --- Propiedades Pathfinding (Conceptuales) ---
        // this.path = [];
        // this.currentWaypointIndex = 0;
        // this.pathRecalculateTimer = 0;
        // this.PATH_RECALCULATE_INTERVAL = 1.0;

        // --- Debug Visual ---
        this.colliderHelper = this.createColliderHelper();
        this.colliderHelper.visible = false; // Oculto por defecto
    }

    playAnimation(name, fadeDuration = 0.2) {
        if (!this.mixer) return; // No hacer nada si no hay mixer
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
            // Si es la misma acción pero no se está ejecutando
            this.currentAction.reset().play();
        } else if (!nextAction) {
            console.warn(`Animación llamada "${name}" no encontrada para el enemigo.`);
        }
    }

    attackPlayer() {
        const now = performance.now() / 1000; // Usar segundos
        if (now - this.lastAttackTime >= this.attackCooldown && this.animations['attack']) {
            // Asumiendo que existe una función global damagePlayer(amount)
            // damagePlayer(this.attackDamage);
            console.log("Enemigo ataca!"); // Placeholder
            this.lastAttackTime = now;
            this.playAnimation('attack', 0.1); // Transición rápida al ataque
        }
    }

    updateRotation(deltaTime, targetPos) {
        const direction = vector1; // Usar vector global
        direction.subVectors(targetPos, this.model.position);
        direction.y = 0; // Mantener rotación en plano horizontal

        if (direction.lengthSq() > 0.001) {
            direction.normalize();

            // Calcular rotación objetivo usando atan2
            const targetRotationY = Math.atan2(direction.x, direction.z);

            // Interpolar suavemente
            let currentRotationY = this.model.rotation.y;
            let angleDiff = targetRotationY - currentRotationY;

            // Normalizar diferencia al rango (-PI, PI]
            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            // Aplicar rotación interpolada
            this.model.rotation.y += angleDiff * Math.min(1.0, deltaTime * this.rotationSpeed);
        }
    }

    // --- Lógica de Salto ---
    tryJump(targetY) {
        if (!this.onFloor || !this.canJump) {
             return false; // No puede saltar si no está en el suelo o está en cooldown
        }

        const enemyHeight = this.collider.end.y; // Altura aprox. de los "ojos"
        const heightDifference = targetY - enemyHeight;

        // Condición 1: Saltar para alcanzar al jugador más alto
        if (heightDifference > ENEMY_JUMP_VERTICAL_THRESHOLD && heightDifference < ENEMY_MAX_JUMP_HEIGHT_DIFF) {
            // Podríamos añadir un raycast aquí para ver si el camino está libre arriba
            console.log("Enemy trying height jump");
            this.velocity.y = ENEMY_JUMP_FORCE;
            this.canJump = false; // Iniciar cooldown
            this.jumpCooldownTimer = ENEMY_JUMP_COOLDOWN;
            this.onFloor = false; // Asegurarse de que ya no está en el suelo
            return true; // Saltó
        }

        // Condición 2: Saltar sobre obstáculo (requiere info de colisión o raycast)
        // Comprobamos si está intentando moverse pero la velocidad horizontal es muy baja
        if (this.isMoving && Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.z) < 0.1) {
            // Raycast corto hacia adelante para ver si es un obstáculo bajo
            const forwardDir = vector2.set(0, 0, -1).applyQuaternion(this.model.quaternion); // Usar vector global
            const rayOrigin = vector3.copy(this.collider.start).add(forwardDir.multiplyScalar(this.collider.radius * 0.5)).add(new THREE.Vector3(0, 0.1, 0)); // Origen ligeramente adelante y arriba de los pies

            const raycaster = new THREE.Raycaster(rayOrigin, forwardDir, 0, ENEMY_JUMP_CHECK_DISTANCE);
            const intersects = raycaster.intersectOctree(this.worldOctree); // Usar el octree global

            if (intersects.length > 0) {
                const hit = intersects[0];
                // Si el obstáculo es bajo (normal no muy vertical) y está cerca
                if (hit.normal.y < 0.7 && hit.distance < ENEMY_JUMP_CHECK_DISTANCE * 0.8) {
                    // Raycast hacia arriba para ver si hay espacio
                    const upRayOrigin = hit.point.clone().add(new THREE.Vector3(0, 0.05, 0)); // Ligeramente por encima del punto de impacto
                    const upRaycaster = new THREE.Raycaster(upRayOrigin, vector1.set(0,1,0), 0, ENEMY_MAX_JUMP_HEIGHT_DIFF);

                    if (upRaycaster.intersectOctree(this.worldOctree).length === 0) { // Si no hay nada arriba
                       console.log("Enemy trying obstacle jump");
                       this.velocity.y = ENEMY_JUMP_FORCE;
                       this.canJump = false;
                       this.jumpCooldownTimer = ENEMY_JUMP_COOLDOWN;
                       this.onFloor = false;
                       return true;
                    }
                }
            }
        }
        return false; // No saltó
    }

    update(deltaTime, playerIsDead) { // Pasar estado del jugador
        // No actualizar si no hay mixer o el jugador está muerto
        if (!this.mixer || playerIsDead) {
             // Podríamos querer detener la animación o la velocidad si el jugador muere
             if (playerIsDead && this.currentAction && this.currentAction.isRunning()) {
                 // this.currentAction.stop(); // O fadeOut
                 this.velocity.set(0,0,0); // Detener movimiento
             }
             return;
        }

        this.mixer.update(deltaTime);

        // --- Manejo Cooldown de Salto ---
        if (!this.canJump) {
            this.jumpCooldownTimer -= deltaTime;
            if (this.jumpCooldownTimer <= 0) {
                this.canJump = true;
            }
        }

        // --- Aplicar Gravedad ---
        this.velocity.y -= GRAVITY * deltaTime; // GRAVITY debe ser una constante global

        // --- Lógica de Seguimiento (Objetivo) ---
        // Placeholder: Objetivo directo al jugador
        const playerCenter = vector1.addVectors(this.playerCollider.start, this.playerCollider.end).multiplyScalar(0.5);
        this.targetPosition.copy(playerCenter);

        // --- Calcular Dirección y Distancia ---
        const direction = vector2; // Usar vector global
        const enemyCenter = vector3.copy(this.collider.start).add(this.collider.end).multiplyScalar(0.5);
        direction.subVectors(this.targetPosition, enemyCenter);
        const distanceToTargetSq = direction.lengthSq();

        // --- Estado de Ataque ---
        const isAttacking = this.animations['attack'] && this.currentAction === this.animations['attack'] && this.currentAction.isRunning();

        // --- Lógica de Movimiento ---
        let desiredSpeed = this.speed;
        this.isMoving = false; // Resetear flag

        if (!isAttacking && distanceToTargetSq > ENEMY_ATTACK_RANGE_SQ) {
            // Moverse si no ataca y está lejos del objetivo
            direction.y = 0; // Moverse horizontalmente hacia el objetivo
            if (direction.lengthSq() > 0.001) {
                 direction.normalize();
                 this.velocity.x = direction.x * desiredSpeed;
                 this.velocity.z = direction.z * desiredSpeed;
                 this.isMoving = true;
            } else { // Ya está en la posición XZ del objetivo
                 this.velocity.x = 0;
                 this.velocity.z = 0;
            }

            // Rotar hacia el objetivo
            this.updateRotation(deltaTime, this.targetPosition);

            // Reproducir animación de movimiento
            if (this.isMoving && this.currentAction !== this.animations['main']) {
                this.playAnimation('main');
            }

        } else {
            // Detenerse si está atacando o cerca del objetivo
             this.velocity.x *= 0.5; // Frenar rápido
             this.velocity.z *= 0.5;
             if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
             if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;

             this.isMoving = Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01;

             // Asegurar que sigue mirando al jugador si está cerca pero no atacando
             if (!isAttacking) {
                 this.updateRotation(deltaTime, this.targetPosition);
             }

             // Podría detener la animación 'main' si no se mueve y no ataca
             if (!this.isMoving && !isAttacking && this.currentAction === this.animations['main']) {
                 // Podríamos tener una animación 'idle' o simplemente detener 'main'
                 // this.currentAction.stop(); // O this.playAnimation('idle');
             }
        }

        // --- Intentar Saltar ---
        // Solo intentar saltar si quiere moverse (está lejos o bloqueado)
        if (this.isMoving || distanceToTargetSq > ENEMY_ATTACK_RANGE_SQ) {
             this.tryJump(this.targetPosition.y);
        }

        // --- Aplicar Fricción (Damping) ---
        const dampingFactor = this.onFloor ? 10 : 1; // Más fricción en suelo
        const damping = Math.exp(-dampingFactor * deltaTime) - 1;
        if (!this.isMoving && this.onFloor) { // Aplicar solo si no hay input de movimiento activo
             this.velocity.x += this.velocity.x * damping;
             this.velocity.z += this.velocity.z * damping;
        } else if (!this.onFloor) { // Fricción de aire siempre se aplica a XZ
            this.velocity.x += this.velocity.x * (Math.exp(-1 * deltaTime) - 1); // Menor fricción aire
            this.velocity.z += this.velocity.z * (Math.exp(-1 * deltaTime) - 1);
        }


        // --- Aplicar Movimiento y Colisiones ---
        const deltaPosition = vector1.copy(this.velocity).multiplyScalar(deltaTime);
        this.collider.translate(deltaPosition);

        this.detectCollisions(); // Detectar colisiones y ajustar estado/velocidad

        // --- Actualizar Posición del Modelo ---
        this.model.position.copy(this.collider.start);
        // this.model.position.y -= OFFSET; // Ajustar si el pivote no está en los pies

        // --- Actualizar Helper Visual ---
        this.updateColliderHelper(); // Llamar a función separada para limpieza

        // --- Lógica de Ataque ---
        if (!isAttacking && distanceToTargetSq <= ENEMY_ATTACK_RANGE_SQ) {
            this.attackPlayer();
        }
    }

    detectCollisions() {
        const result = this.worldOctree.capsuleIntersect(this.collider);
        let wasOnFloor = this.onFloor;
        this.onFloor = false;

        if (result) {
            const collisionNormalY = result.normal.y;
            // Considerar suelo si la normal es suficientemente vertical
            this.onFloor = collisionNormalY > 0.5; // Umbral más estricto para suelo firme

            // --- Ajustes de Velocidad por Colisión ---
            if (this.onFloor) {
                // Aterrizaje: Detener velocidad vertical descendente
                if (!wasOnFloor) { // Si *acaba* de aterrizar
                     this.velocity.y = Math.max(0, this.velocity.y);
                     // Opcional: resetear cooldown de salto al tocar suelo
                     // this.canJump = true;
                } else { // Ya estaba en el suelo, asegurarse que no lo atraviese
                    this.velocity.y = Math.max(0, this.velocity.y);
                }
                 // Aplicar fricción de suelo (se hace con damping en update)

            } else { // Colisión en aire (paredes, techos, pendientes)
                 // Reflejar velocidad para deslizar/rebotar
                 const bounceFactor = 0.5; // 0 = sin rebote, 1 = rebote perfecto (ajustar)
                 this.velocity.addScaledVector(result.normal, -result.normal.dot(this.velocity) * (1 + bounceFactor));

                 // Si choca con un techo (normal apuntando hacia abajo)
                 if (collisionNormalY < -0.9) {
                    this.velocity.y = Math.min(0, this.velocity.y); // Detener movimiento ascendente
                 }
            }

            // --- Resolver Penetración ---
            // Hacerlo SIEMPRE después de ajustar velocidades
            if (result.depth > 1e-10) {
                 this.collider.translate(result.normal.multiplyScalar(result.depth));
            }

        }
        // Si no hubo colisión (result es null), this.onFloor permanece false
        // La gravedad se aplica en update independientemente
    }

    createColliderHelper() {
        // Crear geometría inicial (se actualizará)
        const geometry = new THREE.CylinderGeometry(
            this.collider.radius, this.collider.radius,
            this.collider.end.y - this.collider.start.y,
            8 // Segmentos
        );
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5
        });
        const helper = new THREE.Mesh(geometry, material);
        this.scene.add(helper);
        return helper;
    }

    updateColliderHelper() {
        if (this.colliderHelper && this.colliderHelper.visible) {
            const center = vector1.addVectors(this.collider.start, this.collider.end).multiplyScalar(0.5);
            this.colliderHelper.position.copy(center);
            // Recalcular altura y actualizar geometría si es necesario (si la cápsula puede cambiar de tamaño)
            const height = this.collider.end.y - this.collider.start.y;
            if (this.colliderHelper.geometry.parameters.height !== height) {
                this.colliderHelper.geometry.dispose();
                this.colliderHelper.geometry = new THREE.CylinderGeometry(this.collider.radius, this.collider.radius, height, 8);
            }
             // Asegurar que el helper esté vertical (asume cápsula vertical)
             this.colliderHelper.rotation.set(0, 0, 0);
        }
    }

    dispose() {
        console.log("Disposing enemy...");
        // Quitar listener de animación
        if (this.mixer && this.actionFinishedListener) {
            this.mixer.removeEventListener('finished', this.actionFinishedListener);
        }
        // Quitar helper de la escena y liberar sus recursos
        if (this.colliderHelper) {
            this.scene.remove(this.colliderHelper);
            this.colliderHelper.geometry.dispose();
            this.colliderHelper.material.dispose();
            this.colliderHelper = null;
        }
        // Quitar modelo de la escena
        if (this.model) {
            this.scene.remove(this.model);
            // Idealmente, recorrer y liberar geometrías/materiales del modelo también
            this.model.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material.isMaterial) {
                         // Limpiar texturas si existen
                         Object.values(child.material).forEach(value => {
                              if (value instanceof THREE.Texture) {
                                   value.dispose();
                              }
                         });
                         child.material.dispose();
                    } else if (Array.isArray(child.material)) { // Para MultiMaterial
                         child.material.forEach(material => {
                              Object.values(material).forEach(value => {
                                   if (value instanceof THREE.Texture) {
                                        value.dispose();
                                   }
                              });
                              material.dispose();
                         });
                    }
                }
            });
            this.model = null;
        }
        // Limpiar referencias
        this.animations = {};
        this.mixer = null;
        this.playerCollider = null;
        this.worldOctree = null;
        this.scene = null;
    }

    setDebugVisible(visible) {
        if (this.colliderHelper) {
            this.colliderHelper.visible = visible;
        }
    }
}

// Exportar la clase si estás usando módulos ES6
// export { Enemy };
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
    // Asegúrate de que estas rutas coincidan con tus archivos descargados
    const baseModelPath = './npc/enemy_run.fbx'; // Archivo CON skin y animación run/idle
    const attackAnimPath = './npc/enemy_attack.fbx'; // Archivo SIN skin y animación attack

    console.log('Cargando modelo base enemigo desde:', baseModelPath);

    // 1. Cargar el modelo base CON la animación principal (run/idle)
    fbxLoader.load(baseModelPath, (baseFbxModel) => {
        console.log('Modelo base FBX cargado:', baseFbxModel);

        if (!baseFbxModel) {
            console.error('Modelo base vacío');
            // Crear fallback si falla la carga base
            createFallbackEnemy();
            return;
        }

        const mainAnimations = baseFbxModel.animations || [];
        console.log('Animaciones principales encontradas:', mainAnimations.length);
        if (mainAnimations.length === 0) {
            console.warn("El modelo base no contiene animaciones. Asegúrate de descargarlo con una animación de Mixamo.");
        }

        // 2. Cargar la animación de ataque SIN skin
        console.log('Cargando animación de ataque desde:', attackAnimPath);
        fbxLoader.load(attackAnimPath, (attackFbx) => {
            console.log('Animación de ataque FBX cargada:', attackFbx);
            const attackAnimations = attackFbx.animations || [];
            console.log('Animaciones de ataque encontradas:', attackAnimations.length);

            if (attackAnimations.length === 0) {
                console.warn("El archivo de ataque no contiene animaciones.");
            }

            // 3. Crear el enemigo pasando el modelo y AMBAS listas de animaciones
            enemy = new Enemy({
                model: baseFbxModel, // El modelo 3D viene del primer archivo
                mainClips: mainAnimations, // Animación(es) del primer archivo
                attackClips: attackAnimations // Animación(es) del segundo archivo
            }, scene, playerCollider);

            console.log('Enemigo creado:', enemy);
            initHealthSystem(); // Inicializar la barra de vida DESPUÉS de crear el enemigo

        }, (xhr) => {
            console.log(`Cargando animación ataque: ${(xhr.loaded / xhr.total * 100)}%`);
        }, (error) => {
            console.error('Error al cargar animación de ataque FBX:', error);
            // Si falla la carga de la animación de ataque, crear enemigo solo con la principal
            console.warn("No se pudo cargar la animación de ataque. El enemigo podría no atacar visualmente.");
            enemy = new Enemy({
                model: baseFbxModel,
                mainClips: mainAnimations,
                attackClips: [] // Lista vacía si falla
            }, scene, playerCollider);
            console.log('Enemigo creado (sin animación de ataque):', enemy);
            initHealthSystem();
        });

    }, (xhr) => {
        console.log(`Cargando modelo base: ${(xhr.loaded / xhr.total * 100)}%`);
    }, (error) => {
        console.error('Error CRÍTICO al cargar modelo base FBX:', error);
        // Crear fallback si falla la carga base
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
    const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;

    if (!helper.visible && !playerIsDead) {
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
            controls(deltaTime);
            updatePlayer(deltaTime);
            updateSpheres(deltaTime);
            if (enemy) enemy.update(deltaTime);
            teleportPlayerIfOob();
        }
    }

    renderer.render(scene, camera);
    stats.update();
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
    keyStates[event.code] = true;
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
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

document.addEventListener('mouseup', () => {
    if (document.pointerLockElement === container) {
        throwBall();
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

    loadEnemyModel();
}, undefined, (error) => {
    console.error('Error al cargar el mapa:', error);
});

// Iniciar bucle de animación
renderer.setAnimationLoop(animate);