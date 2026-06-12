// app.js - AXP Kinematic_Hologram (v5.9 Universal Speed & SILO Enabled)

const container = document.getElementById('canvas-container');
const fileUpload = document.getElementById('gltf-upload'); 
const modelSelect = document.getElementById('model-select');
const prismSlider = document.getElementById('prism-slider');
const glassesSelect = document.getElementById('glasses-select');
const lineWidthSlider = document.getElementById('line-width-slider'); 
const redSlider = document.getElementById('red-slider');
const greenSlider = document.getElementById('green-slider');
const blueSlider = document.getElementById('blue-slider');
const hueTuneSlider = document.getElementById('hue-tune-slider'); 
const speedSlider = document.getElementById('speed-slider');
const speedGroup = document.getElementById('speed-group');
const greenGroup = document.getElementById('green-group');
const blueGroup = document.getElementById('blue-group');
const loadingText = document.getElementById('loading-text');

// ==========================================
// AXP 工程專用：UI 狀態強制初始化
// ==========================================
lineWidthSlider.value = "2.0";
prismSlider.value = "0.0";
redSlider.value = "50";
blueSlider.value = "50";
greenSlider.value = "50";
speedSlider.value = "1.0"; // 確保速度預設值為 1.0

// 全域狀態控制
let isPaused = false;
let customScaleMultiplier = 1.0; 
let globalTime = 0;

// 🚀 爆發力訓練：光學記憶暫存器
let savedHPrism = 0.0; 
let savedVPrism = 0.0; 
let isZeroedOut = false; 

// ==========================================
// 0. 動態注入：去抑制閃頻 UI 面板
// ==========================================
const flickerDiv = document.createElement('div');
flickerDiv.className = 'slider-group';
flickerDiv.style.cssText = 'background: rgba(248, 113, 113, 0.15); padding: 12px; border-radius: 6px; border-left: 3px solid #f87171; margin-top: 15px;';
flickerDiv.innerHTML = `
    <h4 style="margin:0 0 8px 0; color:#f87171; font-size:13px;">⚡ 去抑制閃頻 (Anti-Suppression)</h4>
    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#cbd5e1; margin-bottom:8px;">
        <span>狀態: <span id="flicker-status" style="color:#94a3b8;">關閉 [Z 鍵]</span></span>
        <span>頻率: <span id="flicker-hz-val">4.0 Hz</span></span>
    </div>
    <input type="range" id="flicker-hz-slider" min="2" max="12" step="0.5" value="4.0">
`;
document.querySelector('.control-panel').insertBefore(flickerDiv, document.getElementById('speed-group'));

const flickerHzSlider = document.getElementById('flicker-hz-slider');
const flickerStatusText = document.getElementById('flicker-status');
const flickerHzValText = document.getElementById('flicker-hz-val');

let isFlickerActive = false;
let baseIntensityLeft = 0.5;
let baseIntensityRight = 0.5;

flickerHzSlider.addEventListener('input', (e) => {
    flickerHzValText.innerText = parseFloat(e.target.value).toFixed(1) + ' Hz';
});

// ==========================================
// 1. SaaS 雲端模型庫
// ==========================================
const saasModelLibrary = [
    "Animal_Cat.glb",
    "Boxing.glb",
    "Dinosaur_Tyrannosaurus.glb",
    "Double_Helix.glb",
    "Ferrari_F1_2026.glb",
    "Ferrari_Laferrari.glb",
    "Golem_Rock.glb",
    "Gundam_RX93.glb",
    "Gundam_X099.glb",
    "Mecha.glb",
    "Mercedes_E_Class.glb",
    "Plane_Single.glb",
    "Plane_Stylized.glb",
    "Rocket_Hover.glb",
    "Skeleton_Guard.glb",
    "Space_Station.glb",
    "Spaceship.glb",
    "spell_glyph.glb",
    "Star_Wars_Tiein_Interceptor.glb",
    "Stick_Man.glb",
    "Toy_Truck.glb",
    "Transform_Optimus_Prime.glb",
    "Truck.glb",
    "Vertex.glb"
];

let localModelRegistry = {}; 
modelSelect.innerHTML = '<option value="procedural">🤖 AXP 戰術重機甲 (原生程序化生成)</option>';
saasModelLibrary.forEach(modelName => {
    modelSelect.add(new Option(`☁️ 雲端解析: ${modelName.replace('.glb', '')}`, modelName));
});

// 光學安全參數設定
const PRISM_LIMITS = { BI: -6.0, BO: 40.0, BU_BD: 2.0 };
prismSlider.min = PRISM_LIMITS.BI;
prismSlider.max = PRISM_LIMITS.BO;

let currentVPrism = 0.0; 
let baseScaleFactor = 1.0; 

// ==========================================
// 2. 基礎場景與渲染器
// ==========================================
const dpr = window.devicePixelRatio || 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0); 
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500); 
camera.position.set(0, 15, 270); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(dpr);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 15, 0);

// ==========================================
// 3. 視光平行相機與 Custom Shader
// ==========================================
const cameraL = new THREE.PerspectiveCamera();
const cameraR = new THREE.PerspectiveCamera();

const rtOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat };
const rtLeft = new THREE.WebGLRenderTarget(window.innerWidth * dpr, window.innerHeight * dpr, rtOptions);
const rtRight = new THREE.WebGLRenderTarget(window.innerWidth * dpr, window.innerHeight * dpr, rtOptions);

const anaglyphShader = {
    uniforms: {
        "mapLeft": { value: rtLeft.texture },
        "mapRight": { value: rtRight.texture },
        "colorLeft": { value: new THREE.Color(0.0, 0.0, 1.0) },
        "colorRight": { value: new THREE.Color(1.0, 0.0, 0.0) },
        "intensityLeft": { value: 0.5 },
        "intensityRight": { value: 0.5 },
        "prismOffset": { value: new THREE.Vector2(0.0, 0.0) } 
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D mapLeft; uniform sampler2D mapRight;
        uniform vec3 colorLeft; uniform vec3 colorRight;
        uniform float intensityLeft; uniform float intensityRight;
        uniform vec2 prismOffset; varying vec2 vUv;
        void main() {
            vec2 uvL = vUv - vec2(prismOffset.x, prismOffset.y);
            vec2 uvR = vUv + vec2(prismOffset.x, prismOffset.y); 
            
            if(uvL.x < 0.0 || uvL.x > 1.0 || uvR.x < 0.0 || uvR.x > 1.0 || uvL.y < 0.0 || uvL.y > 1.0 || uvR.y < 0.0 || uvR.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return;
            }
            
            vec4 texelLeft = texture2D(mapLeft, uvL);
            vec4 texelRight = texture2D(mapRight, uvR);
            float lumLeft = dot(texelLeft.rgb, vec3(0.299, 0.587, 0.114));
            float lumRight = dot(texelRight.rgb, vec3(0.299, 0.587, 0.114));
            vec3 finalColor = (vec3(lumLeft) * colorLeft * intensityLeft) + (vec3(lumRight) * colorRight * intensityRight);
            gl_FragColor = vec4(finalColor, max(texelLeft.a, texelRight.a));
        }
    `
};

const postMaterial = new THREE.ShaderMaterial(anaglyphShader);
const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

// ==========================================
// 4. AXP 材質設定與線條優化
// ==========================================
const matSolid = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, depthWrite: true });
const matLine = new THREE.LineMaterial({ color: 0xffffff, linewidth: 2.0, transparent: true, opacity: 1.0, resolution: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) });

let activeMecha = new THREE.Group(); scene.add(activeMecha);
let mixers = []; let activeActions = []; let procMecha = null;
const loader = new THREE.GLTFLoader();

// ==========================================
// 5. 原生程序化機甲工廠
// ==========================================
function createMechaPart(geometry) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, matSolid);
    const edges = new THREE.EdgesGeometry(geometry, 15); 
    const lines = new THREE.LineSegments2(new THREE.LineSegmentsGeometry().fromEdgesGeometry(edges), matLine);
    group.add(mesh); group.add(lines); return group;
}

function createPointedVFin() {
    const group = new THREE.Group(); const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.lineTo(2, 16); finShape.lineTo(4, 16); finShape.lineTo(1.5, 0); finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 2, bevelEnabled: false }).center();
    const finL = createMechaPart(finGeo); finL.position.set(-5, 8, 0); finL.rotation.z = Math.PI / 3; group.add(finL);
    const finR = createMechaPart(finGeo); finR.position.set(5, 8, 0); finR.rotation.z = -Math.PI / 3; group.add(finR);
    return group;
}

function createClenchedFist() {
    const fistGroup = new THREE.Group();
    const palm = createMechaPart(new THREE.BoxGeometry(9, 8, 9)); fistGroup.add(palm);
    for (let i = 0; i < 4; i++) {
        const finger = createMechaPart(new THREE.BoxGeometry(10, 2, 2));
        finger.position.set(0, 2.5 - i * 2, 4); palm.add(finger);
    }
    const thumb = createMechaPart(new THREE.BoxGeometry(3, 8, 3));
    thumb.position.set(4, 0, 4); thumb.rotation.set(0, -Math.PI / 4, 0); palm.add(thumb);
    fistGroup.scale.set(1.1, 1.1, 1.1); return fistGroup;
}

function buildNativeMecha() {
    const root = new THREE.Group();
    const torso = createMechaPart(new THREE.BoxGeometry(24, 28, 16)); root.add(torso);
    const head = createMechaPart(new THREE.BoxGeometry(10, 12, 12)); head.position.y = 22; torso.add(head);
    const eyeL = createMechaPart(new THREE.BoxGeometry(3, 3, 2)); eyeL.position.set(-2, 1, 6.5); head.add(eyeL);
    const eyeR = createMechaPart(new THREE.BoxGeometry(3, 3, 2)); eyeR.position.set(2, 1, 6.5); head.add(eyeR);
    const noseShape = new THREE.Shape(); noseShape.moveTo(0, 2); noseShape.lineTo(2, 0); noseShape.lineTo(-2, 0); noseShape.closePath();
    const nose = createMechaPart(new THREE.ExtrudeGeometry(noseShape, { depth: 2, bevelEnabled: false }).center());
    nose.position.set(0, -1.5, 6.5); head.add(nose);
    const vFin = createPointedVFin(); vFin.position.z = 6; vFin.scale.set(0.7, 0.7, 0.7); head.add(vFin);
    const pelvis = createMechaPart(new THREE.BoxGeometry(26, 12, 18)); pelvis.position.y = -20; torso.add(pelvis);

    const shoulderArmorGeo = new THREE.IcosahedronGeometry(10, 0); const armGeo = new THREE.BoxGeometry(8, 24, 8);
    const armL = new THREE.Group(); armL.position.set(-22, 12, 0); torso.add(armL); 
    const shoulderL = new THREE.Group(); armL.add(shoulderL);
    const sArmorL = createMechaPart(shoulderArmorGeo); sArmorL.scale.set(1.2, 0.9, 1.2); sArmorL.position.x = -2; shoulderL.add(sArmorL); 
    const lowerArmL = createMechaPart(armGeo); lowerArmL.position.y = -20; shoulderL.add(lowerArmL);
    const fistL = createClenchedFist(); fistL.position.set(0, -14, 0); lowerArmL.add(fistL);

    const armR = new THREE.Group(); armR.position.set(22, 12, 0); torso.add(armR); 
    const shoulderR = new THREE.Group(); armR.add(shoulderR);
    const sArmorR = createMechaPart(shoulderArmorGeo); sArmorR.scale.set(1.2, 0.9, 1.2); sArmorR.position.x = 2; shoulderR.add(sArmorR); 
    const lowerArmR = createMechaPart(armGeo); lowerArmR.position.y = -20; shoulderR.add(lowerArmR);
    const fistR = createClenchedFist(); fistR.position.set(0, -14, 0); lowerArmR.add(fistR);

    const thighGeo = new THREE.BoxGeometry(12, 24, 12); const calfGeo = new THREE.BoxGeometry(14, 28, 16); const footGeo = new THREE.BoxGeometry(16, 6, 26);
    const kneePadGeo = new THREE.IcosahedronGeometry(7, 0);
    const thighL = new THREE.Group(); thighL.position.set(-8, -6, 0); pelvis.add(thighL);
    const thighMeshL = createMechaPart(thighGeo); thighMeshL.position.y = -12; thighL.add(thighMeshL);
    const kneeJointL = new THREE.Group(); kneeJointL.position.y = -14; thighMeshL.add(kneeJointL); 
    const kneePadL = createMechaPart(kneePadGeo); kneePadL.scale.set(1.1, 0.7, 0.7); kneePadL.position.z = 8; kneeJointL.add(kneePadL);
    const calfL = createMechaPart(calfGeo); calfL.position.set(0, -12, 0); kneeJointL.add(calfL); 
    const footL = createMechaPart(footGeo); footL.position.set(0, -16, 4); calfL.add(footL);

    const thighR = new THREE.Group(); thighR.position.set(8, -6, 0); pelvis.add(thighR);
    const thighMeshR = createMechaPart(thighGeo); thighMeshR.position.y = -12; thighR.add(thighMeshR);
    const kneeJointR = new THREE.Group(); kneeJointR.position.y = -14; thighMeshR.add(kneeJointR); 
    const kneePadR = createMechaPart(kneePadGeo); kneePadR.scale.set(1.1, 0.7, 0.7); kneePadR.position.z = 8; kneeJointR.add(kneePadR);
    const calfR = createMechaPart(calfGeo); calfR.position.set(0, -12, 0); kneeJointR.add(calfR); 
    const footR = createMechaPart(footGeo); footR.position.set(0, -16, 4); calfR.add(footR);

    const wingGeo = new THREE.BoxGeometry(20, 50, 4);
    const wingL = createMechaPart(wingGeo); wingL.position.set(-15, 10, -15); wingL.rotation.set(0.2, -0.3, 0.4); torso.add(wingL);
    const wingR = createMechaPart(wingGeo); wingR.position.set(15, 10, -15); wingR.rotation.set(0.2, 0.3, -0.4); torso.add(wingR);

    root.position.y = 15;
    return { root, torso, head, shoulderL, shoulderR, thighL, thighR, calfL, calfR, wingL, wingR };
}

// ==========================================
// 6. 外部 GLB 載入與全域速度解鎖
// ==========================================
fileUpload.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    modelSelect.innerHTML = '<option value="procedural">🤖 AXP 戰術重機甲 (原生程序化生成)</option>';
    localModelRegistry = {};

    Array.from(files).forEach((file) => {
        const objectURL = URL.createObjectURL(file);
        localModelRegistry[file.name] = objectURL;
        modelSelect.add(new Option(`📦 暫存上傳: ${file.name}`, file.name));
    });
    
    modelSelect.value = files[0].name;
    loadNewModel(files[0].name);
});

function applyHologramOptics(modelGroup) {
    const meshes = [];
    modelGroup.traverse((child) => { 
        if (child.isMesh) {
            meshes.push(child);
            child.frustumCulled = false; 
        } 
    });
    
    meshes.forEach((mesh) => {
        if (mesh.isSkinnedMesh) {
            mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, skinning: true, transparent: true, opacity: 0.6 });
        } else {
            mesh.material = matSolid;
            const edges = new THREE.EdgesGeometry(mesh.geometry, 15); 
            const lineGeo = new THREE.LineSegmentsGeometry().fromEdgesGeometry(edges);
            const line = new THREE.LineSegments2(lineGeo, matLine);
            line.frustumCulled = false; 
            mesh.add(line);
        }
    });
}

function loadNewModel(modelName) {
    while(activeMecha.children.length > 0){ activeMecha.remove(activeMecha.children[0]); }
    mixers = []; activeActions = []; procMecha = null;
    customScaleMultiplier = 1.0; 
    
    // 🌟 核心修復：無論是原生機甲還是外部模型，強制顯示動態速度滑桿！
    if (speedGroup) speedGroup.style.display = 'block'; 

    if (modelName === 'procedural') {
        camera.position.set(0, 15, 270);
        baseScaleFactor = 1.0; 
        procMecha = buildNativeMecha();
        procMecha.root.traverse(c => { c.frustumCulled = false; });
        activeMecha.add(procMecha.root);
        loadingText.innerText = "原生程序化核心啟動完畢！"; loadingText.style.color = "#4ade80";
        updateOptics(); return;
    }

    camera.position.set(0, 20, 80); 
    loadingText.innerText = `準備解析模組...`; loadingText.style.color = "#facc15";

    const fileTarget = localModelRegistry[modelName] || `./${modelName}`;

    loader.load(
        fileTarget, 
        function (gltf) {
            const rawModel = gltf.scene;

            rawModel.position.set(0, 0, 0);
            rawModel.scale.set(1, 1, 1);
            rawModel.rotation.set(0, 0, 0);
            rawModel.updateMatrixWorld(true);

            const boundingBox = new THREE.Box3();
            boundingBox.makeEmpty();
            let hasMesh = false;

            rawModel.traverse(c => { 
                if (c.isMesh) {
                    hasMesh = true;
                    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                    const childBox = new THREE.Box3().copy(c.geometry.boundingBox);
                    childBox.applyMatrix4(c.matrixWorld);
                    boundingBox.union(childBox);
                } 
            });

            if(!hasMesh || boundingBox.isEmpty()) { 
                loadingText.innerText = "模型內無實體網格，無法解析。"; loadingText.style.color = "#f87171"; return; 
            }

            const size = boundingBox.getSize(new THREE.Vector3());
            const center = boundingBox.getCenter(new THREE.Vector3());

            const wrapper = new THREE.Group();
            rawModel.position.x = -center.x;
            rawModel.position.y = -center.y;
            rawModel.position.z = -center.z;
            wrapper.add(rawModel);

            const targetHeight = 25; 
            const maxDimension = Math.max(size.x, size.y, size.z);
            baseScaleFactor = targetHeight / (maxDimension || 1);
            
            wrapper.scale.setScalar(baseScaleFactor);
            applyHologramOptics(wrapper);
            activeMecha.add(wrapper);
            updateOptics(); 

            if (gltf.animations && gltf.animations.length > 0) {
                loadingText.innerText = `解析成功！(啟動 ${gltf.animations.length} 組動力軌道)`; loadingText.style.color = "#4ade80";
                const mixer = new THREE.AnimationMixer(rawModel);
                gltf.animations.forEach((clip) => {
                    const action = mixer.clipAction(clip);
                    action.setLoop(THREE.LoopRepeat); action.play(); activeActions.push(action); 
                });
                mixers.push(mixer);
            } else {
                loadingText.innerText = "解析成功！(無內建動力，啟動微幅自轉)"; loadingText.style.color = "#38bdf8";
            }
        }, undefined,
        function (error) { loadingText.innerText = `解析失敗！請確認檔案是否存在於正確目錄。`; loadingText.style.color = "#f87171"; }
    );
}

modelSelect.addEventListener('change', (e) => loadNewModel(e.target.value));

// ==========================================
// 7. UI 對接、光學稜鏡與動態 SILO 感知
// ==========================================
function updateOptics() {
    let prismVal = parseFloat(prismSlider.value); 
    prismVal = THREE.MathUtils.clamp(prismVal, PRISM_LIMITS.BI, PRISM_LIMITS.BO);
    prismSlider.value = prismVal;

    const rVal = parseInt(redSlider.value); 
    const gVal = parseInt(greenSlider.value); 
    const bVal = parseInt(blueSlider.value);
    const hueTune = parseInt(hueTuneSlider.value); 
    const lineWidth = parseFloat(lineWidthSlider.value); 

    document.getElementById('r-val').innerText = rVal + '%';
    document.getElementById('hue-tune-val').innerText = hueTune;
    document.getElementById('line-width-val').innerText = lineWidth.toFixed(1);

    const prismText = prismVal > 0 ? `${prismVal.toFixed(1)} Δ (BO)` : prismVal < 0 ? `${Math.abs(prismVal).toFixed(1)} Δ (BI)` : `0.0 Δ (平光)`;
    const vPrismText = currentVPrism !== 0 ? ` | V: ${Math.abs(currentVPrism).toFixed(1)}Δ` : '';
    
    let statusText = prismText + vPrismText;
    if (isPaused) statusText += ' ⏸️ [已暫停]';
    if (isZeroedOut) statusText += ' 🎯 [正位測試中]';
    if (customScaleMultiplier !== 1.0) statusText += ` 🔍 [${customScaleMultiplier.toFixed(1)}X]`;
    document.getElementById('prism-val').innerText = statusText;

    matLine.linewidth = lineWidth;
    
    postMaterial.uniforms.colorRight.value.setRGB(1.0, 0.0, 0.0); 
    postMaterial.uniforms.intensityRight.value = rVal / 100.0;
    
    let leftColor = new THREE.Color();
    const mode = glassesSelect.value;
    
    if (mode === 'rb') {
        greenGroup.style.display = 'none'; blueGroup.style.display = 'block';
        document.getElementById('b-val').innerText = bVal + '%';
        leftColor.setHSL((240 + hueTune) / 360, 1.0, 0.5); 
        postMaterial.uniforms.colorLeft.value.copy(leftColor);
        postMaterial.uniforms.intensityLeft.value = bVal / 100.0;
    } else if (mode === 'rg') {
        greenGroup.style.display = 'block'; blueGroup.style.display = 'none';
        document.getElementById('g-val').innerText = gVal + '%';
        leftColor.setHSL((120 + hueTune) / 360, 1.0, 0.5); 
        postMaterial.uniforms.colorLeft.value.copy(leftColor);
        postMaterial.uniforms.intensityLeft.value = gVal / 100.0;
    }
    
    const workDistanceMeters = 0.5; 
    const screenWidthCm = 35.5;  
    
    const screenAspect = window.innerWidth / window.innerHeight;
    const screenHeightCm = screenWidthCm / screenAspect;

    const hShift = (prismVal * workDistanceMeters) / screenWidthCm;
    const vShift = (currentVPrism * workDistanceMeters) / screenHeightCm; 
    postMaterial.uniforms.prismOffset.value.set(hShift / 2.0, vShift / 2.0); 

    let siloScale = 1.0; 
    let siloZ = 0;
    if (prismVal > 0) { 
        siloScale = Math.pow(1.0 - (prismVal / PRISM_LIMITS.BO) * 0.35, 1.2); 
        siloZ = prismVal * 1.5; 
    } else if (prismVal < 0) { 
        siloScale = Math.pow(1.0 + Math.abs(prismVal / PRISM_LIMITS.BI) * 0.3, 1.2); 
        siloZ = prismVal * 2.5; 
    }
    
    const finalBaseScale = baseScaleFactor * customScaleMultiplier;
    activeMecha.scale.setScalar(finalBaseScale * siloScale);
    activeMecha.position.z = siloZ;
}

[prismSlider, glassesSelect, redSlider, greenSlider, blueSlider, hueTuneSlider, lineWidthSlider].forEach(el => el.addEventListener('input', updateOptics));
glassesSelect.addEventListener('change', updateOptics);

// ==========================================
// 8. 快捷鍵與 Kinematic 控制系統 
// ==========================================
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    
    if (e.code === 'KeyQ') {
        if (!document.fullscreenElement) {
            document.body.requestFullscreen().then(() => {
                const hud = document.getElementById('hud-header');
                if (hud) hud.style.display = 'none';
            }).catch(() => {});
        } else {
            document.exitFullscreen();
        }
    } else if (e.code === 'KeyE') {
        const panel = document.querySelector('.control-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; 
    } else if (e.code === 'KeyM') {
        customScaleMultiplier += 0.2; 
        updateOptics();
    } else if (e.code === 'KeyN') {
        customScaleMultiplier = Math.max(0.1, customScaleMultiplier - 0.2); 
        updateOptics();
    } else if (e.code === 'Enter') {
        isZeroedOut = false;
        savedHPrism = 0.0;
        savedVPrism = 0.0;
        currentVPrism = 0.0;
        prismSlider.value = 0.0;
        customScaleMultiplier = 1.0;
        lineWidthSlider.value = "2.0";
        speedSlider.value = 1.0;
        if (document.getElementById('speed-val')) document.getElementById('speed-val').innerText = '1.0x';
        redSlider.value = 50;
        blueSlider.value = 50;
        greenSlider.value = 50;
        hueTuneSlider.value = 0;
        updateOptics();
    } else if (e.code === 'KeyZ') {
        isFlickerActive = !isFlickerActive;
        flickerStatusText.innerText = isFlickerActive ? "運作中 [Z 鍵]" : "關閉 [Z 鍵]";
        flickerStatusText.style.color = isFlickerActive ? "#4ade80" : "#94a3b8";
        if(!isFlickerActive) updateOptics(); 
    } else if (e.code === 'Space') {
        isPaused = !isPaused;
        e.preventDefault(); 
        updateOptics(); 
    } else if (e.code === 'Comma') {
        isZeroedOut = true;
        prismSlider.value = 0.0;
        currentVPrism = 0.0;
        updateOptics();
    } else if (e.code === 'Period') {
        isZeroedOut = false;
        prismSlider.value = savedHPrism;
        currentVPrism = savedVPrism;
        updateOptics();
    } else if (e.code === 'ArrowRight') {
        prismSlider.value = Math.min(PRISM_LIMITS.BO, parseFloat(prismSlider.value) + 0.5);
        if (!isZeroedOut) savedHPrism = parseFloat(prismSlider.value);
        updateOptics();
    } else if (e.code === 'ArrowLeft') {
        prismSlider.value = Math.max(PRISM_LIMITS.BI, parseFloat(prismSlider.value) - 0.5);
        if (!isZeroedOut) savedHPrism = parseFloat(prismSlider.value);
        updateOptics();
    } else if (e.code === 'ArrowUp') {
        currentVPrism = Math.min(PRISM_LIMITS.BU_BD, currentVPrism + 0.1);
        if (!isZeroedOut) savedVPrism = currentVPrism;
        updateOptics();
    } else if (e.code === 'ArrowDown') {
        currentVPrism = Math.max(-PRISM_LIMITS.BU_BD, currentVPrism - 0.1);
        if (!isZeroedOut) savedVPrism = currentVPrism;
        updateOptics();
    }
});

prismSlider.addEventListener('input', (e) => {
    if (!isZeroedOut) savedHPrism = parseFloat(e.target.value);
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        const hud = document.getElementById('hud-header');
        if (hud) hud.style.display = 'block';
    }
});

// ==========================================
// 9. 動畫與視光專屬平行相機渲染迴圈 (全域變速核心)
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    const newDPR = window.devicePixelRatio || 1.0;
    rtLeft.setSize(window.innerWidth * newDPR, window.innerHeight * newDPR);
    rtRight.setSize(window.innerWidth * newDPR, window.innerHeight * newDPR);
    matLine.resolution.set(window.innerWidth * newDPR, window.innerHeight * newDPR);
    updateOptics(); 
});

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); 
    
    if (!isPaused) {
        globalTime += delta;
        controls.update();
        
        // 🌟 核心變更：在此抓取動態速度滑桿的數值
        const walkSpeed = parseFloat(speedSlider.value); 

        if (procMecha) {
            const t = globalTime * walkSpeed;
            procMecha.root.position.y = 15 + Math.abs(Math.sin(t)) * 3.5;
            procMecha.shoulderL.rotation.x = Math.sin(t) * 0.7; procMecha.shoulderR.rotation.x = -Math.sin(t) * 0.7;
            procMecha.thighL.rotation.x = -Math.sin(t) * 0.7; procMecha.thighR.rotation.x = Math.sin(t) * 0.7;
            procMecha.calfL.rotation.x = Math.max(0, Math.cos(t)) * 1.0; procMecha.calfR.rotation.x = Math.max(0, -Math.cos(t)) * 1.0;
            procMecha.torso.rotation.y = Math.sin(t) * 0.08; procMecha.head.rotation.y = Math.sin(t * 0.5) * 0.15;
            procMecha.wingL.rotation.y = -0.3 + Math.sin(t * 0.5) * 0.1; procMecha.wingR.rotation.y = 0.3 - Math.sin(t * 0.5) * 0.1;
            activeMecha.rotation.y = globalTime * 0.3 * walkSpeed; // 讓旋轉也跟著變速
        } 
        else {
            // 🌟 核心變更：將外部 GLB 模型的動畫播放速度乘上 walkSpeed
            mixers.forEach(mixer => mixer.update(delta * walkSpeed));
            
            if(mixers.length === 0 && activeMecha.children.length > 0) {
                // 如果模型沒有內建動畫，它的懸浮與旋轉也受速度滑桿控制
                const t = globalTime * walkSpeed;
                const hoverY = Math.sin(t * 1.5) * 1.2; 
                const swayX  = Math.sin(t * 0.8) * 0.03; 
                activeMecha.position.y = hoverY; activeMecha.rotation.x = swayX;
                activeMecha.rotation.y += (0.005 * walkSpeed); 
            } else if (mixers.length > 0) {
                activeMecha.position.y = 0; activeMecha.rotation.x = 0;
                activeMecha.rotation.y = Math.sin(globalTime * walkSpeed * 0.1) * 0.1;
            }
        }
    }

    if (isFlickerActive && !isPaused) {
        const hz = parseFloat(flickerHzSlider.value);
        const period = 1.0 / hz;
        const phase = (globalTime % period) / period;
        const leftOn = phase < 0.5;
        postMaterial.uniforms.intensityLeft.value = leftOn ? baseIntensityLeft : 0.05;
        postMaterial.uniforms.intensityRight.value = !leftOn ? baseIntensityRight : 0.05;
    }

    const eyeSep = 0.04; 
    cameraL.copy(camera);
    cameraR.copy(camera);
    cameraL.position.x -= eyeSep / 2;
    cameraR.position.x += eyeSep / 2;
    
    cameraL.updateProjectionMatrix();
    cameraR.updateProjectionMatrix();
    cameraL.updateMatrixWorld();
    cameraR.updateMatrixWorld();

    renderer.setRenderTarget(rtLeft); renderer.render(scene, cameraL);
    renderer.setRenderTarget(rtRight); renderer.render(scene, cameraR);
    renderer.setRenderTarget(null); renderer.render(postScene, postCamera);
}

window.dispatchEvent(new Event('resize'));
loadNewModel('procedural'); 
animate();