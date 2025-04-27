import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let container, stats;
let camera, scene, renderer, controls;
const objects = [];

let raycaster;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const worldWidth = 128, worldDepth = 128;
const worldHalfWidth = worldWidth / 2;
const worldHalfDepth = worldDepth / 2;
const data = generateHeight(worldWidth, worldDepth);

init();
animate(); // Make sure to call animate to start the render loop

function init() {
    // Create container
    container = document.getElementById('container') || document.body;

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.y = getY(worldHalfWidth, worldHalfDepth) * 100 + 100;

    // Set up scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);
    scene.fog = new THREE.Fog(0xbfd1e5, 0, 750);

    // Set up raycaster for collision detection
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // Generate terrain geometry
    const geometries = generateTerrainGeometry();
    const geometry = BufferGeometryUtils.mergeGeometries(geometries);
    geometry.computeBoundingSphere();

    // Apply Minecraft texture
    const texture = new THREE.TextureLoader().load('../jsm/textures/minecraft/atlas.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;

    // Create terrain mesh
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }));
    scene.add(mesh);
    objects.push(mesh); // Add to objects for collision detection

    // Set up lighting
    const ambientLight = new THREE.AmbientLight(0xeeeeee, 3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 12);
    directionalLight.position.set(1, 1, 0.5).normalize();
    scene.add(directionalLight);

    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Set up controls
    setupPointerLockControls();

    // Set up stats
    stats = new Stats();
    container.appendChild(stats.dom);

    // Add window resize handler
    window.addEventListener('resize', onWindowResize);
}

function setupPointerLockControls() {
    // Create pointer lock controls
    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.object);

    // Create UI elements if they don't exist
    let blocker = document.getElementById('blocker');
    let instructions = document.getElementById('instructions');
    
    if (!blocker) {
        blocker = document.createElement('div');
        blocker.id = 'blocker';
        blocker.style.position = 'absolute';
        blocker.style.width = '100%';
        blocker.style.height = '100%';
        blocker.style.background = 'rgba(0,0,0,0.5)';
        blocker.style.display = 'flex';
        blocker.style.justifyContent = 'center';
        blocker.style.alignItems = 'center';
        blocker.style.top = '0';
        blocker.style.left = '0';
        document.body.appendChild(blocker);
        
        instructions = document.createElement('div');
        instructions.id = 'instructions';
        instructions.style.width = '100%';
        instructions.style.height = '100%';
        instructions.style.display = 'flex';
        instructions.style.flexDirection = 'column';
        instructions.style.justifyContent = 'center';
        instructions.style.alignItems = 'center';
        instructions.style.color = '#ffffff';
        instructions.style.textAlign = 'center';
        instructions.style.cursor = 'pointer';
        instructions.innerHTML = '<h1>Click to play</h1><p>WASD = Move, SPACE = Jump, MOUSE = Look around</p>';
        blocker.appendChild(instructions);
    }

    // Set up event listeners
    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'block';
        instructions.style.display = '';
    });

    // Set up keyboard controls
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump === true) velocity.y += 350;
            canJump = false;
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function generateTerrainGeometry() {
    const matrix = new THREE.Matrix4();
    const geometries = [];

    // Define plane geometries for the sides of each cube
    const pxGeometry = new THREE.PlaneGeometry(100, 100);
    pxGeometry.attributes.uv.array[1] = 0.5;
    pxGeometry.attributes.uv.array[3] = 0.5;
    pxGeometry.rotateY(Math.PI / 2);
    pxGeometry.translate(50, 0, 0);

    const nxGeometry = new THREE.PlaneGeometry(100, 100);
    nxGeometry.attributes.uv.array[1] = 0.5;
    nxGeometry.attributes.uv.array[3] = 0.5;
    nxGeometry.rotateY(- Math.PI / 2);
    nxGeometry.translate(- 50, 0, 0);

    const pyGeometry = new THREE.PlaneGeometry(100, 100);
    pyGeometry.attributes.uv.array[5] = 0.5;
    pyGeometry.attributes.uv.array[7] = 0.5;
    pyGeometry.rotateX(- Math.PI / 2);
    pyGeometry.translate(0, 50, 0);

    const pzGeometry = new THREE.PlaneGeometry(100, 100);
    pzGeometry.attributes.uv.array[1] = 0.5;
    pzGeometry.attributes.uv.array[3] = 0.5;
    pzGeometry.translate(0, 0, 50);

    const nzGeometry = new THREE.PlaneGeometry(100, 100);
    nzGeometry.attributes.uv.array[1] = 0.5;
    nzGeometry.attributes.uv.array[3] = 0.5;
    nzGeometry.rotateY(Math.PI);
    nzGeometry.translate(0, 0, - 50);

    // Generate terrain geometries
    for (let z = 0; z < worldDepth; z++) {
        for (let x = 0; x < worldWidth; x++) {
            const h = getY(x, z);

            matrix.makeTranslation(
                x * 100 - worldHalfWidth * 100,
                h * 100,
                z * 100 - worldHalfDepth * 100
            );

            const px = getY(x + 1, z);
            const nx = getY(x - 1, z);
            const pz = getY(x, z + 1);
            const nz = getY(x, z - 1);

            geometries.push(pyGeometry.clone().applyMatrix4(matrix));

            if ((px !== h && px !== h + 1) || x === 0) {
                geometries.push(pxGeometry.clone().applyMatrix4(matrix));
            }

            if ((nx !== h && nx !== h + 1) || x === worldWidth - 1) {
                geometries.push(nxGeometry.clone().applyMatrix4(matrix));
            }

            if ((pz !== h && pz !== h + 1) || z === worldDepth - 1) {
                geometries.push(pzGeometry.clone().applyMatrix4(matrix));
            }

            if ((nz !== h && nz !== h + 1) || z === 0) {
                geometries.push(nzGeometry.clone().applyMatrix4(matrix));
            }
        }
    }

    return geometries;
}

function generateHeight(width, height) {
    const data = [], perlin = new ImprovedNoise(),
        size = width * height, z = Math.random() * 100;
    let quality = 2;

    for (let j = 0; j < 4; j++) {
        if (j === 0) for (let i = 0; i < size; i++) data[i] = 0;

        for (let i = 0; i < size; i++) {
            const x = i % width, y = (i / width) | 0;
            data[i] += perlin.noise(x / quality, y / quality, z) * quality;
        }

        quality *= 4;
    }

    return data;
}

function getY(x, z) {
    // Make sure x and z are within bounds
    if (x < 0 || x >= worldWidth || z < 0 || z >= worldDepth) {
        return 0;
    }
    return (data[x + z * worldWidth] * 0.15) | 0;
}

function animate() {
    requestAnimationFrame(animate); // Use requestAnimationFrame for the animation loop
    render();
    stats.update();
}

function render() {
    const time = performance.now();

    if (controls.isLocked === true) {
        // Set up raycaster for collision detection
        raycaster.ray.origin.copy(controls.object.position);
        raycaster.ray.origin.y -= 10;

        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        const delta = (time - prevTime) / 1000;

        // Apply physics
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // gravity with mass

        // Calculate movement direction
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // ensures consistent movement in all directions

        // Apply movement forces
        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Handle collision with objects
        if (onObject === true) {
            velocity.y = Math.max(0, velocity.y);
            canJump = true;
        }

        // Move the camera
        controls.moveRight(- velocity.x * delta);
        controls.moveForward(- velocity.z * delta);
        controls.object.position.y += (velocity.y * delta);

        // Get current position in world coordinates
        const worldX = Math.floor((controls.object.position.x + worldHalfWidth * 100) / 100);
        const worldZ = Math.floor((controls.object.position.z + worldHalfDepth * 100) / 100);
        
        // Check if position is within terrain bounds
        if (worldX >= 0 && worldX < worldWidth && worldZ >= 0 && worldZ < worldDepth) {
            // Get terrain height at current position
            const terrainHeight = getY(worldX, worldZ) * 100 + 10;
            
            // Prevent falling below terrain
            if (controls.object.position.y < terrainHeight) {
                velocity.y = 0;
                controls.object.position.y = terrainHeight;
                canJump = true;
            }
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}	