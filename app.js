// app.js - AXP Kinematic_Hologram (v6.2 Crosstalk Optimized Edition)

const container = document.getElementById('canvas-container');
const fileUpload = document.getElementById('gltf-upload'); 
const modelSelect = document.getElementById('model-select');
const prismSlider = document.getElementById('prism-slider');
const glassesSelect = document.getElementById('glasses-select');
const lineWidthSlider = document.getElementById('line-width-slider'); 
const redSlider = document.getElementById('red-slider');
const greenSlider = document.getElementById('green-slider');
const blueSlider = document.getElementById('blue-slider');
const crosstalkSlider = document.getElementById('crosstalk-slider'); 
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
speedSlider.value = "1.0"; 
crosstalkSlider.value = "0";

let isPaused = false;
let customScaleMultiplier = 1.0; 
let globalTime = 0;

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
    "Boxing.glb", "Cell_Polychora.glb", "Dinosaur_Tyrannosaurus.glb", "Double_Helix.glb", 
    "Eagle.glb", "Ferrari_Laferrari.glb", "Flowers.glb", "Gear_Solid.glb", 
    "Gears_Bevel.glb", "Gears_Spur.glb", "Gundam_RX93.glb", "Mecha.glb", "Mercedes_E_Class.glb", 
    "Plane_Single.glb", "Plane_Stylized.glb", "Skeleton_Guard.glb", "Space_Station.glb", 
    "Star_Wars_Tiein_Interceptor.glb", "Stick_Man.glb", "Toy_Truck.glb", "Transform_Optimus_Prime.glb", 
    "Truck.glb", "Vertex.glb"
];

let localModelRegistry = {}; 
modelSelect.innerHTML = ''; 
saasModelLibrary.forEach(modelName => {
    modelSelect.add(new Option(`☁️ 雲端解析: ${modelName.replace('.glb', '')}`, modelName));
});

const PRISM_LIMITS = { BI: -6.0, BO: 40.0, BU_BD: 2.0 };
prismSlider.min = PRISM_LIMITS.BI;
prismSlider.max = PRISM_LIMITS.BO;

let currentVPrism = 0.0; 
let baseScaleFactor = 1.0; 

// ==========================================
// 2. 基礎場景與渲染器
// ==========================================
const dpr = Math.min(window.devicePixelRatio || 1.0, 2); 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0); 
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500); 
camera.position.set(0, 20, 80); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(dpr);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 15, 0);

// ==========================================
// 3. 視光平行相機與 Custom Shader (漏光補償演算法)
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
        "prismOffset": { value: new THREE.Vector2(0.0, 0.0) },
        "crosstalk": { value: 0.0 } 
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D mapLeft; uniform sampler2D mapRight;
        uniform vec3 colorLeft; uniform vec3 colorRight;
        uniform float intensityLeft; uniform float intensityRight;
        uniform vec2 prismOffset; 
        uniform float crosstalk; 
        varying vec2 vUv;
        void main() {
            vec2 uvL = vUv - prismOffset;
            vec2 uvR = vUv + prismOffset; 
            
            if(uvL.x < 0.0 || uvL.x > 1.0 || uvR.x < 0.0 || uvR.x > 1.0 || uvL.y < 0.0 || uvL.y > 1.0 || uvR.y < 0.0 || uvR.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return;
            }
            
            vec4 texelLeft = texture2D(mapLeft, uvL);
            vec4 texelRight = texture2D(mapRight, uvR);
            
            float lumLeft = dot(texelLeft.rgb, vec3(0.299, 0.587, 0.114));
            float lumRight = dot(texelRight.rgb, vec3(0.299, 0.587, 0.114));

            // AXP 矩陣相減：動態抵消物理漏光
            float cleanLeft = max(0.0, lumLeft - lumRight * crosstalk);
            float cleanRight = max(0.0, lumRight - lumLeft * crosstalk);

            vec3 finalColor = (vec3(cleanLeft) * colorLeft * intensityLeft) + (vec3(cleanRight) * colorRight * intensityRight);
            gl_FragColor = vec4(finalColor, max(texelLeft.a, texelRight.a));
        }
    `
};

const postMaterial = new THREE.ShaderMaterial(anaglyphShader);
const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

// ==========================================
// 4. AXP 材質設定與 GPU 記憶體清理兵器
// ==========================================
const matSolid = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, depthWrite: true });
const matLine = new THREE.LineMaterial({ color: 0xffffff, linewidth: 2.0, transparent: true, opacity: 1.0, resolution: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) });

let activeMecha = new THREE.Group(); scene.add(activeMecha);
let mixers = []; let activeActions = [];
const loader = new THREE.GLTFLoader();

function disposeHierarchy(node) {
    for (let i = node.children.length - 1; i >= 0; i--) {
        disposeHierarchy(node.children[i]);
    }
    if (node.isMesh || node.isLineSegments) {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach(m => m.dispose());
            } else {
                node.material.dispose();
            }
        }
    }
    node.parent?.remove(node);
}

// ==========================================
// 5. 外部 GLB 載入與邊界效能優化 
// ==========================================
fileUpload.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    modelSelect.innerHTML = '';
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
    disposeHierarchy(activeMecha); 
    activeMecha = new THREE.Group();
    scene.add(activeMecha);

    mixers = []; activeActions = [];
    customScaleMultiplier = 1.0; 
    
    if (speedGroup) speedGroup.style.display = 'block'; 

    camera.position.set(0, 20, 80); 
    loadingText.innerText = `準備解析模組...`; loadingText.style.color = "#facc15";

    const fileTarget = localModelRegistry[modelName] || `./${modelName}`;

    loader.load(
        fileTarget, 
        function (gltf) {
            const rawModel = gltf.scene;
            const boundingBox = new THREE.Box3().setFromObject(rawModel);

            if(boundingBox.isEmpty()) { 
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
        function (error) { loadingText.innerText = `解析失敗！請確認檔案目錄。`; loadingText.style.color = "#f87171"; }
    );
}

modelSelect.addEventListener('change', (e) => loadNewModel(e.target.value));

// ==========================================
// 6. UI 對接、狀態同步與 SILO 感知
// ==========================================
function updateOptics() {
    let prismVal = parseFloat(prismSlider.value); 
    prismVal = THREE.MathUtils.clamp(prismVal, PRISM_LIMITS.BI, PRISM_LIMITS.BO);
    prismSlider.value = prismVal;

    const rVal = parseInt(redSlider.value); 
    const gVal = parseInt(greenSlider.value); 
    const bVal = parseInt(blueSlider.value);
    const crosstalkRate = parseInt(crosstalkSlider.value); 
    const lineWidth = parseFloat(lineWidthSlider.value); 

    baseIntensityRight = rVal / 100.0;

    document.getElementById('r-val').innerText = rVal + '%';
    document.getElementById('crosstalk-val').innerText = crosstalkRate + '%';
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
    postMaterial.uniforms.crosstalk.value = crosstalkRate / 100.0; 
    
    const mode = glassesSelect.value;
    
    if (mode === 'rb') {
        greenGroup.style.display = 'none'; blueGroup.style.display = 'block';
        document.getElementById('b-val').innerText = bVal + '%';
        postMaterial.uniforms.colorLeft.value.setRGB(0.0, 0.0, 1.0); 
        baseIntensityLeft = bVal / 100.0;
    } else if (mode === 'rg') {
        greenGroup.style.display = 'block'; blueGroup.style.display = 'none';
        document.getElementById('g-val').innerText = gVal + '%';
        postMaterial.uniforms.colorLeft.value.setRGB(0.0, 1.0, 0.0); 
        baseIntensityLeft = gVal / 100.0;
    }
    
    if (!isFlickerActive) {
        postMaterial.uniforms.intensityLeft.value = baseIntensityLeft;
        postMaterial.uniforms.intensityRight.value = baseIntensityRight;
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

[prismSlider, glassesSelect, redSlider, greenSlider, blueSlider, crosstalkSlider, lineWidthSlider].forEach(el => el.addEventListener('input', updateOptics));
glassesSelect.addEventListener('change', updateOptics);

// ==========================================
// 7. 快捷鍵與 Kinematic 控制系統 
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
        crosstalkSlider.value = 0;
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
// 8. 動畫與視光專屬平行相機渲染迴圈 
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    const newDPR = Math.min(window.devicePixelRatio || 1.0, 2);
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
        
        const walkSpeed = parseFloat(speedSlider.value); 

        mixers.forEach(mixer => mixer.update(delta * walkSpeed));
        
        if(mixers.length === 0 && activeMecha.children.length > 0) {
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
if (saasModelLibrary.length > 0) {
    loadNewModel(saasModelLibrary[0]); 
}
animate();