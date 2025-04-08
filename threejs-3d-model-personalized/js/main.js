import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const manager = new THREE.LoadingManager();

let camera, scene, renderer, stats, object, loader, guiMorphsFolder;
let mixer;
let currentAction = null;
let allActions = [];
let previousAction = null;
let activeModel = null;

const clock = new THREE.Clock();

const params = {
    animation: 'Capoeira', // Animación inicial
    transitionDuration: 1.0, // Duración predeterminada más larga para transiciones más suaves
    transitionInterpolation: 'sineInOut', // Tipo de interpolación para la transición
    crossFadeRatio: 0.3 // Proporción de superposición entre animaciones
};

// Lista actualizada con los archivos de la imagen
const animations = [
    'Capoeira',
    'Taunt',
    'Angry',
    'Falling',
    'Taunt (1)'
];

// Tipos de interpolación para la transición
const interpolationTypes = [
    'linear',
    'sineIn',
    'sineOut',
    'sineInOut',
    'quadIn',
    'quadOut',
    'quadInOut',
    'cubicIn',
    'cubicOut',
    'cubicInOut'
];

// Mapa para las animaciones disponibles con sus acciones correspondientes
const actions = {};
// Objeto para almacenar todos los modelos cargados
const loadedModels = {};

init();

function init() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(100, 200, 300);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0); // Color de fondo

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 5);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 5);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    scene.add(dirLight);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    loader = new FBXLoader(manager);
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
    
    // Agregar evento para escuchar las teclas
    window.addEventListener('keydown', onKeyDown);

    stats = new Stats();
    container.appendChild(stats.dom);

    const gui = new GUI();
    gui.add(params, 'animation', animations).onChange(function (value) {
        loadModelWithAnimation(value);
    });
    
    // Controles avanzados para la transición
    const transitionFolder = gui.addFolder('Transición');
    transitionFolder.add(params, 'transitionDuration', 0.1, 3.0, 0.1).name('Duración (s)');
    transitionFolder.add(params, 'crossFadeRatio', 0.1, 1.0, 0.1).name('Superposición');
    transitionFolder.add(params, 'transitionInterpolation', interpolationTypes).name('Interpolación');
    transitionFolder.open();

    guiMorphsFolder = gui.addFolder('Morphs').hide();

    // Mensaje de instrucciones en pantalla
    createInstructionsPanel();
}

function createInstructionsPanel() {
    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.bottom = '10px';
    panel.style.left = '10px';
    panel.style.backgroundColor = 'rgba(0,0,0,0.6)';
    panel.style.color = 'white';
    panel.style.padding = '10px';
    panel.style.borderRadius = '5px';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.innerHTML = 'Presiona las teclas 1-5 para cambiar animaciones';
    document.body.appendChild(panel);
}

function loadInitialModel() {
    loadModelWithAnimation(params.animation);
}

// Función para calcular el valor interpolado según el tipo de interpolación
function getInterpolatedValue(t, type) {
    switch(type) {
        case 'linear': return t;
        case 'sineIn': return 1 - Math.cos((t * Math.PI) / 2);
        case 'sineOut': return Math.sin((t * Math.PI) / 2);
        case 'sineInOut': return -(Math.cos(Math.PI * t) - 1) / 2;
        case 'quadIn': return t * t;
        case 'quadOut': return 1 - (1 - t) * (1 - t);
        case 'quadInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        case 'cubicIn': return t * t * t;
        case 'cubicOut': return 1 - Math.pow(1 - t, 3);
        case 'cubicInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        default: return t;
    }
}

// Manejar el evento de teclado
function onKeyDown(event) {
    const keyIndex = parseInt(event.key);
    
    // Verificar si la tecla presionada es un número entre 1 y 5
    if (keyIndex >= 1 && keyIndex <= 5 && keyIndex <= animations.length) {
        // Convertir el índice de tecla (1-5) a índice de array (0-4)
        const animationIndex = keyIndex - 1;
        const newAnimation = animations[animationIndex];
        
        // Actualizar la GUI para reflejar el cambio
        params.animation = newAnimation;
        
        // Comprobar si tenemos el modelo cargado y hacer transición suave
        if (loadedModels[newAnimation]) {
            performSmoothTransition(loadedModels[newAnimation].action);
        } else {
            // Si no está cargado, cargar el nuevo modelo
            loadModelWithAnimation(newAnimation);
        }
    }
}

// Función avanzada para realizar una transición ultra suave entre animaciones
function performSmoothTransition(newAction) {
    if (currentAction === newAction) return;
    
    previousAction = currentAction;
    currentAction = newAction;
    
    // Si no hay acción anterior, simplemente reproducir la nueva
    if (!previousAction) {
        currentAction.reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .play();
        return;
    }
    
    // Guardar el tiempo de reproducción actual para sincronizar las animaciones
    const prevTime = previousAction.time;
    
    // Preparar la nueva acción pero mantenerla en peso cero
    currentAction.reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(0)
        .play();
    
    // Sincronizar el tiempo de reproducción para una transición más natural
    currentAction.time = prevTime % currentAction.getClip().duration;
    
    // Configurar la duración de mezcla basada en los parámetros
    const duration = params.transitionDuration;
    
    // Iniciar el tiempo de transición
    let transitionTime = 0;
    const transitionInterval = 1000 / 60; // 60fps
    
    // Crear una función para animar la transición frame por frame
    function animateTransition() {
        transitionTime += transitionInterval / 1000; // Convertir ms a segundos
        
        if (transitionTime < duration) {
            // Calcular el ratio de progreso (0-1)
            const ratio = transitionTime / duration;
            
            // Aplicar la función de interpolación seleccionada
            const interpolatedRatio = getInterpolatedValue(ratio, params.transitionInterpolation);
            
            // Ajustar los pesos de las acciones para una transición suave
            const crossFadeStart = 1.0 - params.crossFadeRatio;
            
            // Para una transición suave, la acción anterior mantiene su peso hasta crossFadeStart
            // y luego disminuye, mientras que la nueva acción aumenta gradualmente desde 0
            if (ratio < crossFadeStart) {
                previousAction.setEffectiveWeight(1);
                currentAction.setEffectiveWeight(interpolatedRatio / crossFadeStart * params.crossFadeRatio);
            } else {
                const fadeOutRatio = (ratio - crossFadeStart) / (1 - crossFadeStart);
                previousAction.setEffectiveWeight(1 - fadeOutRatio);
                currentAction.setEffectiveWeight(params.crossFadeRatio + (1 - params.crossFadeRatio) * fadeOutRatio);
            }
            
            // Continuar la transición en el siguiente frame
            setTimeout(animateTransition, transitionInterval);
        } else {
            // Finalizar la transición
            previousAction.setEffectiveWeight(0);
            currentAction.setEffectiveWeight(1);
            previousAction.stop();
        }
    }
    
    // Iniciar la animación de transición
    animateTransition();
}

function loadModelWithAnimation(animationName) {
    // Si el modelo ya está cargado, simplemente hacemos la transición
    if (loadedModels[animationName]) {
        if (object !== loadedModels[animationName].model) {
            if (object) scene.remove(object);
            object = loadedModels[animationName].model;
            scene.add(object);
            mixer = loadedModels[animationName].mixer;
        }
        
        performSmoothTransition(loadedModels[animationName].action);
        return;
    }

    if (object) {
        scene.remove(object);
    }

    const filePath = '../models/fbx/' + animationName + '.fbx';

    // Mostrar indicador de carga
    const loadingElement = document.createElement('div');
    loadingElement.style.position = 'absolute';
    loadingElement.style.top = '50%';
    loadingElement.style.left = '50%';
    loadingElement.style.transform = 'translate(-50%, -50%)';
    loadingElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    loadingElement.style.color = 'white';
    loadingElement.style.padding = '20px';
    loadingElement.style.borderRadius = '10px';
    loadingElement.style.fontFamily = 'Arial, sans-serif';
    loadingElement.style.zIndex = '1000';
    loadingElement.innerHTML = `Cargando ${animationName}...`;
    document.body.appendChild(loadingElement);

    loader.load(filePath, function (fbx) {
        // Eliminar el indicador de carga
        document.body.removeChild(loadingElement);
        
        object = fbx;

        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

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

        if (object.animations && object.animations.length) {
            mixer = new THREE.AnimationMixer(object);
            const action = mixer.clipAction(object.animations[0]);
            
            // Guardar el modelo y su animación para uso futuro
            loadedModels[animationName] = {
                model: object,
                mixer: mixer,
                action: action
            };
            
            // Transición a la nueva animación
            performSmoothTransition(action);
        } else {
            mixer = null;
            currentAction = null;
        }

        guiMorphsFolder.children.forEach((child) => child.destroy());
        if (guiMorphsFolder.children.length === 0) {
            guiMorphsFolder.hide();
        }
    }, 
    // Progress callback
    function(xhr) {
        const percent = Math.floor((xhr.loaded / xhr.total) * 100);
        loadingElement.innerHTML = `Cargando ${animationName}... ${percent}%`;
    },
    // Error callback
    function(error) {
        document.body.removeChild(loadingElement);
        console.error('Error cargando el modelo:', error);
        
        // Mostrar mensaje de error
        const errorElement = document.createElement('div');
        errorElement.style.position = 'absolute';
        errorElement.style.top = '50%';
        errorElement.style.left = '50%';
        errorElement.style.transform = 'translate(-50%, -50%)';
        errorElement.style.backgroundColor = 'rgba(255,0,0,0.7)';
        errorElement.style.color = 'white';
        errorElement.style.padding = '20px';
        errorElement.style.borderRadius = '10px';
        errorElement.style.fontFamily = 'Arial, sans-serif';
        errorElement.style.zIndex = '1000';
        errorElement.innerHTML = `Error al cargar ${animationName}`;
        document.body.appendChild(errorElement);
        
        setTimeout(() => {
            document.body.removeChild(errorElement);
        }, 3000);
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