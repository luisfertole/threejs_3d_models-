import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const manager = new THREE.LoadingManager();

let camera, scene, renderer, stats, object, loader, guiMorphsFolder;
let mixer;
let currentAction = null;

const clock = new THREE.Clock();

const params = {
    animation: 'Samba Dancing'
};

// Lista ampliada de animaciones
const animations = [
    'Samba Dancing',
    'Hip Hop Dancing',
    'Breakdance',
    'Salsa Dancing',
    'Ballet',
    'Moonwalk'
];

// Objeto para almacenar las acciones de animación
const actions = {};

init();

function init() {

    const container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(100, 200, 300);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);
    scene.fog = new THREE.Fog(0xa0a0a0, 200, 1000);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 5);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 5);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = - 100;
    dirLight.shadow.camera.left = - 120;
    dirLight.shadow.camera.right = 120;
    scene.add(dirLight);

    // scene.add( new THREE.CameraHelper( dirLight.shadow.camera ) );

    // ground
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
    mesh.rotation.x = - Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    loader = new FBXLoader(manager);
    
    // Volvemos al método original de carga pero adaptado para múltiples animaciones
    loadInitialModel();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.update();

    window.addEventListener('resize', onWindowResize);

    // stats
    stats = new Stats();
    container.appendChild(stats.dom);

    const gui = new GUI();
    gui.add(params, 'animation', animations).onChange(function (value) {
        loadModelWithAnimation(value);
    });

    guiMorphsFolder = gui.addFolder('Morphs').hide();
}

function loadInitialModel() {
    // Carga el modelo inicial con la animación predeterminada
    loadModelWithAnimation(params.animation);
}

function loadModelWithAnimation(animationName) {
    // Limpia el objeto previo si existe
    if (object) {
        scene.remove(object);
        
        // Limpia memoria
        object.traverse(function (child) {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                });
            }
            if (child.geometry) child.geometry.dispose();
        });
    }
    
    // Ruta al archivo FBX basado en el nombre de animación
    // Esto asume que tienes un archivo FBX con el nombre de la animación
    const filePath = 'models/fbx/' + animationName + '.fbx';
    
    // Carga el nuevo modelo con la animación seleccionada
    loader.load(filePath, function (fbx) {
        object = fbx;
        
        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Si hay morphs, configura el GUI
                if (child.morphTargetDictionary) {
                    guiMorphsFolder.show();
                    const meshFolder = guiMorphsFolder.addFolder(child.name || child.uuid);
                    Object.keys(child.morphTargetDictionary).forEach((key) => {
                        meshFolder.add(child.morphTargetInfluences, child.morphTargetDictionary[key], 0, 1, 0.01);
                    });
                }
            }
        });
        
        scene.add(object);
        
        // Configura el mixer y la animación
        if (object.animations && object.animations.length) {
            mixer = new THREE.AnimationMixer(object);
            const action = mixer.clipAction(object.animations[0]);
            action.play();
        } else {
            mixer = null;
        }
        
        // Limpia y actualiza carpetas de morphs
        guiMorphsFolder.children.forEach((child) => child.destroy());
        if (guiMorphsFolder.children.length === 0) {
            guiMorphsFolder.hide();
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
    stats.update();
}