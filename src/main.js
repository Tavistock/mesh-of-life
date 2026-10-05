// Main entry point: scene, camera, renderer, loop, wiring

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPrimitive, loadGLTF, loadOBJ, loadSTL, loadPLY, loadFBX, loadTestModel, TEST_MODELS, getFaceCount, normalizeGeometry } from './meshLoader.js';
import { buildAdjacency, computeAdjacencyStats } from './adjacency.js';
import { GpuLifeEngine, isGpuLifeSupported } from './gpuLife.js';
import { LifeEngine } from './life.js';
import { MeshRenderer } from './renderer.js';
import { setupUI } from './ui.js';
import { randomPalette } from './colors.js';
import { loadImage, loadImageFromUrl, imageToImageData, rasterize } from './rasterizer.js';

// Three.js scene setup
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.minDistance = 1.5;
controls.maxDistance = 10;

// State
let lifeEngine = null;
let meshRenderer = null;
let adjacency = null;
let currentGeometry = null;
let isPlaying = false;
let speed = 10; // generations per second
let lastTick = 0;
let accum = 0;
let useVertexAdjacency = true;
let cachedAvgNeighbors = 0; // computed once per mesh load; O(faceCount) to recompute

// Paint brush state
let brushSize = 3;        // brush size in cells (1 = just the clicked face)
let brushDensity = 0.5;   // fraction of faces in the radius to flip
let lastPointer = null;   // last pointer position over the canvas, or null
let brushDirty = true;    // recompute the highlight on the next frame
let lastBrushFace = -1;   // last face under the cursor (dedupes highlight uploads)
let brushPickPending = false; // a GPU pick readback is in flight
let lastCamPos = new THREE.Vector3();       // detects camera moves
let lastCamQuat = new THREE.Quaternion();

// Image rasterizer state
let sourceImageData = null;   // downscaled ImageData for sampling
let previewSnapshot = null;   // pre-preview engine state (live preview only)

// Shared handler for a freshly decoded image (from a file or a QR data URL):
// store the sampling data and show it in the transform preview.
function handleLoadedImage(img) {
    sourceImageData = imageToImageData(img);
    ui.setPreviewImage(img);
}

// Decide once whether the GPU simulation is usable on this device. If not, we
// fall back to the CPU LifeEngine (same interface, slower at high face counts).
// A `?cpu=1` query param forces the CPU engine (useful for testing/escaping).
const forceCpu = new URLSearchParams(location.search).get('cpu') === '1';
const gpuSupported = !forceCpu && isGpuLifeSupported(renderer);
if (!gpuSupported) {
    console.warn(
        forceCpu
            ? '[mesh-of-life] CPU engine forced via ?cpu=1.'
            : '[mesh-of-life] GPU simulation unsupported (needs WebGL2 + EXT_color_buffer_float). Falling back to CPU engine.'
    );
}

// Load a mesh by primitive type: either a procedural primitive (honoring the
// detail slider) or a hosted test model (fixed resolution).
//
// The mesh build is synchronous and can block the main thread for seconds at
// high detail, so the loading overlay is shown first and the work is deferred
// until after a paint (double rAF) to keep the UI responsive-looking.
function deferAfterPaint(fn) {
    if (document.visibilityState === 'visible') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
        // rAF never fires in a background tab; fall back to a macrotask.
        setTimeout(fn, 0);
    }
}

function loadPrimitiveMesh(type, detail) {
    ui.setLoading(true, 'Loading mesh\u2026');
    deferAfterPaint(() => {
        try {
            if (TEST_MODELS[type]) {
                loadTestModel(type)
                    .then((geo) => { loadMesh(geo); ui.setLoading(false); })
                    .catch((err) => {
                        console.error('[mesh-of-life] test model load failed:', err);
                        ui.setLoading(false);
                    });
            } else {
                loadMesh(createPrimitive(type, detail));
                ui.setLoading(false);
            }
        } catch (err) {
            console.error('[mesh-of-life] mesh load failed:', err);
            ui.setLoading(false);
        }
    });
}

// UI hooks
const ui = setupUI({
    loadPrimitive: (type, detail) => loadPrimitiveMesh(type, detail),
    loadFile: (file) => {
        const ext = file.name.toLowerCase().split('.').pop();
        ui.setLoading(true, 'Loading mesh\u2026');
        const done = (geo) => { loadMesh(geo); ui.setLoading(false); };
        const fail = (err) => {
            console.error('[mesh-of-life] mesh load failed:', err);
            ui.setLoading(false);
        };
        if (ext === 'glb' || ext === 'gltf') {
            loadGLTF(file).then(done).catch(fail);
        } else if (ext === 'obj') {
            loadOBJ(file).then(done).catch(fail);
        } else if (ext === 'stl') {
            loadSTL(file).then(done).catch(fail);
        } else if (ext === 'ply') {
            loadPLY(file).then(done).catch(fail);
        } else if (ext === 'fbx') {
            loadFBX(file).then(done).catch(fail);
        } else {
            ui.setLoading(false);
        }
    },
    play: () => { isPlaying = true; ui.setPlaying(true); },
    pause: () => { isPlaying = false; ui.setPlaying(false); },
    step: () => tickSimulation(),
    reset: () => { if (lifeEngine) { lifeEngine.clear(); updateColors(); } },
    setSpeed: (s) => { speed = s; },
    setRule: (rule) => { if (lifeEngine) lifeEngine.setRule(rule); },
    randomize: () => { if (lifeEngine) { lifeEngine.randomize(); updateColors(); } },
    clear: () => { if (lifeEngine) { lifeEngine.clear(); updateColors(); } },
    setBgColor: (hex) => {
        scene.background.set(hex);
        if (meshRenderer) meshRenderer.setBgColor(hex);
        updateColors();
    },
    setDeadColor: (hex) => {
        if (meshRenderer) meshRenderer.setDeadColor(hex);
        updateColors();
    },
    setCellColor: (hex) => {
        if (meshRenderer) meshRenderer.setCellColor(hex);
        updateColors();
    },
    setAgeColor: (hex) => {
        if (meshRenderer) meshRenderer.setAgeColor(hex);
        updateColors();
    },
    randomizeColors: () => applyRandomColors(),
    onCanvasClick: (e) => handleCanvasClick(e),
    onCanvasMove: (e) => handleCanvasMove(e),
    onCanvasLeave: () => {
        lastPointer = null;
        lastBrushFace = -1;
        if (meshRenderer) meshRenderer.clearBrushHighlight();
    },
    setBrushSize: (n) => { brushSize = n; brushDirty = true; lastBrushFace = -1; },
    setBrushDensity: (d) => { brushDensity = d; },
    loadImageFile: (file) => {
        loadImage(file).then(handleLoadedImage)
            .catch((err) => console.error('[mesh-of-life] image load failed:', err));
    },
    loadImageUrl: (url) => {
        loadImageFromUrl(url).then(handleLoadedImage)
            .catch((err) => console.error('[mesh-of-life] image load failed:', err));
    },
    applyImage: (options) => {
        if (!sourceImageData || !currentGeometry || !lifeEngine) return;
        const { alive, mask } = rasterize(currentGeometry, sourceImageData, options);
        lifeEngine.setCells(alive, mask);
        previewSnapshot = null; // committed; nothing to restore
        updateColors();
    },
    // Live preview: show the rasterized result on the mesh without committing.
    // The first call snapshots the current state so it can be restored when
    // live preview is turned off. Passing null restores that snapshot.
    onImagePreview: (options) => {
        if (!lifeEngine) return;
        if (!options) {
            if (previewSnapshot) {
                lifeEngine.restore(previewSnapshot);
                previewSnapshot = null;
                updateColors();
            }
            return;
        }
        if (!sourceImageData || !currentGeometry) return;
        // Start each preview from the original state so faces that are no
        // longer covered by the image revert instead of keeping stale values.
        if (!previewSnapshot) {
            previewSnapshot = lifeEngine.snapshot();
        } else {
            lifeEngine.restore(previewSnapshot);
        }
        const { alive, mask } = rasterize(currentGeometry, sourceImageData, options);
        lifeEngine.setCells(alive, mask);
        updateColors();
    },
    onStateChange: () => syncUrl()
});

// Generate a random palette, push it into the color inputs and apply it to
// the scene/renderer. Used by the Randomize Colors button and on startup.
function applyRandomColors() {
    const palette = randomPalette();
    document.getElementById('bg-color').value = palette.bg;
    document.getElementById('dead-color').value = palette.dead;
    document.getElementById('cell-color').value = palette.cell;
    document.getElementById('age-color').value = palette.age;
    scene.background.set(palette.bg);
    if (meshRenderer) {
        meshRenderer.setBgColor(palette.bg);
        meshRenderer.setDeadColor(palette.dead);
        meshRenderer.setCellColor(palette.cell);
        meshRenderer.setAgeColor(palette.age);
    }
    updateColors();
}

// --- URL state ---------------------------------------------------------
// Reflect the primitive, detail and rule in the query string so a setup can
// be shared or reloaded. Uses replaceState to avoid flooding history.
//
// The query string is kept compact:
//   p = primitive code (i/s/t/b/tp/bn/sz/cw)
//   d = detail exponent (0..8, so detail = 2^d)
//   r = rule as "birthHex.surviveHex" (e.g. "08.0C")
// Legacy long keys (primitive/detail/rule) are still accepted on read.

const PRIMITIVE_CODES = {
    // Built-in primitives
    icosahedron: 'i', sphere: 's', torus: 't', box: 'b',
    // Parametric surfaces (keys match PARAMETRIC_GEOMETRIES)
    apple: 'ap', bernat: 'be', bowtie: 'bw', breather: 'br', catenoid: 'ca',
    cone: 'cn', cylinder: 'cy', dinni: 'di', dupincyclide: 'dc', egg: 'eg',
    enneper: 'en', figure8knot: 'f8', goblet: 'go', helicoid: 'he', horn: 'ho',
    hyperhelicoid: 'hh', hyperoctahedron: 'hx', hyperparaboloid: 'hp',
    hyperspiral: 'hs', hypertanspiral: 'ht', juliaheart: 'jh', kleinbottle: 'kb',
    kleinbottlenordstrand: 'kn', knotFigure8: 'kf', knotsTorusSeifert: 'ks',
    knotTorus: 'kt', knotTranguloidTrefoil: 'kg', knotTrefoil: 'kr',
    lawsonbottle: 'lb', maederowl: 'mo', mobius: 'mb', morin: 'mr',
    paraboloid: 'pb', pillow: 'pw', plane: 'pl', rose: 'ro', seashell: 'sh',
    sinecosine: 'sc', sinecube: 'su', sinecosinewaves: 'sw', sinusoidalcone: 'sn',
    snailsmussels: 'sm', spiralwaves: 'sp', torus8figure: 't8',
    torusantisymmetric: 'ta', torusBianchiPinkall: 'tb', torusbraided: 'td',
    torusknot: 'tk', torustwisted8: 't9', torustwisted: 'tw', torusumbilic: 'tu',
    trefoilknot: 'tf', trashcan: 'tc', umbrella: 'um', waveBall: 'wb',
    // Test models
    teapot: 'tp', bunny: 'bn', suzanne: 'sz', cow: 'cw'
};
const CODE_PRIMITIVES = Object.fromEntries(
    Object.entries(PRIMITIVE_CODES).map(([name, code]) => [code, name])
);

// "B0x08/S0x0C" -> "08.0C"
function encodeRule(hexRule) {
    const m = /^B0x([0-9A-Fa-f]+)\/S0x([0-9A-Fa-f]+)$/.exec(hexRule);
    return m ? `${m[1]}.${m[2]}` : hexRule;
}

// "08.0C" -> "B0x08/S0x0C" (leaves already-long rules untouched)
function decodeRule(code) {
    const m = /^([0-9A-Fa-f]+)\.([0-9A-Fa-f]+)$/.exec(code);
    return m ? `B0x${m[1]}/S0x${m[2]}` : code;
}

function syncUrl() {
    if (!ui) return;
    const { primitive, detail, rule } = ui.getState();
    const params = new URLSearchParams();
    params.set('p', PRIMITIVE_CODES[primitive] || primitive);
    params.set('d', Math.round(Math.log2(Math.max(1, detail))));
    params.set('r', encodeRule(rule));
    const url = `${location.pathname}?${params.toString()}`;
    history.replaceState(null, '', url);
}

function readUrlState() {
    const params = new URLSearchParams(location.search);
    const state = {};

    const p = params.get('p') || params.get('primitive');
    if (p) state.primitive = CODE_PRIMITIVES[p] || p;

    if (params.has('d')) {
        const exp = parseInt(params.get('d'), 10);
        if (!isNaN(exp)) state.detail = Math.pow(2, exp);
    } else if (params.has('detail')) {
        const d = parseInt(params.get('detail'), 10);
        if (!isNaN(d)) state.detail = d;
    }

    const r = params.get('r') || params.get('rule');
    if (r) state.rule = decodeRule(r);

    return state;
}

// Vertex adjacency toggle
document.getElementById('vertex-adjacency').addEventListener('change', (e) => {
    useVertexAdjacency = e.target.checked;
    if (currentGeometry) {
        loadMesh(currentGeometry);
    }
});

function loadMesh(geometry) {
    currentGeometry = geometry;

    // Build adjacency
    adjacency = buildAdjacency(geometry, useVertexAdjacency);
    const stats = computeAdjacencyStats(adjacency);
    cachedAvgNeighbors = stats.avgNeighbors;

    // Create the life engine. Prefer the GPU engine; fall back to the CPU
    // engine on devices without WebGL2 / float render-target support.
    if (lifeEngine && lifeEngine.dispose) lifeEngine.dispose();
    lifeEngine = gpuSupported
        ? new GpuLifeEngine(adjacency.faceCount, adjacency, renderer)
        : new LifeEngine(adjacency.faceCount, adjacency);
    document.getElementById('engine-mode').textContent = gpuSupported ? 'GPU' : 'CPU';

    // Extend the rule grid to cover this mesh's maximum neighbor count, then
    // re-apply the selected rule (a fresh engine starts with the default
    // B3/S23, which would otherwise diverge from the UI).
    ui.setMaxNeighbors(adjacency.maxNeighbors);
    ui.reapplyRule();

    // Create renderer
    const bgColor = document.getElementById('bg-color').value;
    const deadColor = document.getElementById('dead-color').value;
    const cellColor = document.getElementById('cell-color').value;
    const ageColor = document.getElementById('age-color').value;
    scene.background.set(bgColor);

    if (meshRenderer) meshRenderer.dispose();
    meshRenderer = new MeshRenderer(scene, geometry, bgColor, deadColor, cellColor, ageColor);

    // Seed the simulation with a random starting population
    lifeEngine.randomize();
    updateColors();

    // Update UI stats
    ui.updateStats(
        adjacency.faceCount,
        stats.avgNeighbors,
        lifeEngine.getGeneration(),
        lifeEngine.getAliveCount()
    );

    // Reset simulation state
    isPlaying = false;
    ui.setPlaying(false);
    lastTick = performance.now();
    accum = 0;
    lastBrushFace = -1;
    brushPickPending = false;
}

function updateColors() {
    if (!lifeEngine || !meshRenderer) return;
    // GPU engine: bind its current state texture directly — no CPU work.
    meshRenderer.setStateTexture(
        lifeEngine.getCurrentTexture(),
        lifeEngine.texSize,
        lifeEngine.maxAge
    );
    ui.updateStats(
        adjacency.faceCount,
        cachedAvgNeighbors,
        lifeEngine.getGeneration(),
        lifeEngine.getAliveCount()
    );
}

function tickSimulation() {
    if (!lifeEngine) return;
    lifeEngine.step();
}

// Advance the simulation by up to maxTicks generations, then refresh colors and
// stats once. Per-tick color updates are O(faceCount) and would dominate runtime
// at high speeds, so they are batched per frame instead.
function advanceSimulation(maxTicks = 4) {
    if (!lifeEngine) return;
    for (let i = 0; i < maxTicks && accum >= 1 / speed; i++) {
        lifeEngine.step();
        accum -= 1 / speed;
    }
    updateColors();
}

// Raycast the pointer against the mesh and return the hit face index, or -1.
// CPU fallback used only when GPU picking is unavailable.
function pickFace(clientX, clientY) {
    if (!meshRenderer || !currentGeometry) return -1;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(meshRenderer.getMesh());
    if (intersects.length > 0) {
        const faceIndex = intersects[0].faceIndex;
        if (faceIndex !== undefined && faceIndex >= 0) return faceIndex;
    }
    return -1;
}

// Pick the face under the cursor. Prefers GPU picking (a 1x1 render + a cheap
// synchronous readback, cost independent of face count) and falls back to the
// CPU raycast if the renderer has no picking mesh. Always resolves to a face
// index or -1.
function pickFaceAsync(clientX, clientY) {
    if (meshRenderer) {
        return meshRenderer.pickFaceGPU(clientX, clientY, camera, renderer);
    }
    return Promise.resolve(pickFace(clientX, clientY));
}

// Breadth-first expansion over face adjacency, returning the faces within
// `radius` hops of `startFace` (inclusive). Capped to avoid pathological
// blowups on very dense meshes.
function collectBrushFaces(startFace, radius) {
    const result = [];
    if (!adjacency || startFace < 0) return result;
    const maxFaces = 20000;
    const visited = new Set([startFace]);
    let frontier = [startFace];
    result.push(startFace);
    for (let hop = 0; hop < radius && frontier.length; hop++) {
        const next = [];
        for (const f of frontier) {
            const neighbors = adjacency.getNeighbors(f);
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    visited.add(n);
                    result.push(n);
                    next.push(n);
                    if (result.length >= maxFaces) return result;
                }
            }
        }
        frontier = next;
    }
    return result;
}

// Flip a random subset (brushDensity) of the faces within the brush radius.
function paintAt(faceIndex) {
    if (!lifeEngine || faceIndex < 0) return;
    const faces = collectBrushFaces(faceIndex, brushSize - 1);
    const toFlip = [];
    for (const f of faces) {
        if (Math.random() < brushDensity) toFlip.push(f);
    }
    if (toFlip.length === 0) return;
    lifeEngine.flipCells(toFlip);
    updateColors();
}

function handleCanvasClick(event) {
    if (!meshRenderer || !lifeEngine || !currentGeometry) return;
    const { clientX, clientY } = event;
    pickFaceAsync(clientX, clientY).then((faceIndex) => {
        if (faceIndex < 0) return;
        paintAt(faceIndex);
    });
}

// Hover: remember the pointer position and refresh the brush highlight.
// Painting only happens on click; dragging the pointer just moves the highlight.
function handleCanvasMove(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
    brushDirty = true;
}

// Recompute the brush highlight from the last pointer position. Uses GPU face
// picking (a 1x1 render + async readback) so the cost is independent of face
// count. Called every frame while the pointer is over the canvas so the
// highlight stays in sync when the camera moves (orbit damping, zoom) without
// the mouse moving.
function updateBrushHighlight() {
    if (!meshRenderer || !currentGeometry || !lastPointer) return;
    // Only one readback in flight at a time; the next frame retries.
    if (brushPickPending) return;
    brushPickPending = true;
    // The pick reads camera.matrixWorld, which is normally refreshed at render
    // time; make sure it reflects the camera's current transform.
    camera.updateMatrixWorld();
    const pickX = lastPointer.x;
    const pickY = lastPointer.y;
    pickFaceAsync(pickX, pickY).then((faceIndex) => {
        brushPickPending = false;
        if (!meshRenderer || !lastPointer) return;
        // If the pointer moved while the readback was in flight, pick again.
        if (lastPointer.x !== pickX || lastPointer.y !== pickY) brushDirty = true;
        if (faceIndex < 0) {
            if (lastBrushFace !== -1) {
                lastBrushFace = -1;
                meshRenderer.clearBrushHighlight();
            }
            return;
        }
        if (faceIndex === lastBrushFace) return; // highlight unchanged
        lastBrushFace = faceIndex;
        meshRenderer.setBrushHighlight(collectBrushFaces(faceIndex, brushSize - 1));
    });
}

// Animation loop
let fpsFrames = 0;
let fpsLastUpdate = 0;

function animate(time) {
    requestAnimationFrame(animate);

    controls.update();

    // Keep the brush highlight in sync with the cursor when the camera moves
    // (orbit damping, zoom) even if the pointer itself hasn't moved.
    if (!camera.position.equals(lastCamPos) || !camera.quaternion.equals(lastCamQuat)) {
        lastCamPos.copy(camera.position);
        lastCamQuat.copy(camera.quaternion);
        brushDirty = true;
    }
    if (brushDirty) {
        updateBrushHighlight();
        brushDirty = false;
    }

    // FPS measurement (updated ~2x per second)
    fpsFrames++;
    if (time - fpsLastUpdate >= 500) {
        const fps = Math.round((fpsFrames * 1000) / (time - fpsLastUpdate));
        document.getElementById('fps-count').textContent = fps;
        fpsFrames = 0;
        fpsLastUpdate = time;
    }

    // Simulation tick: advance at most a few generations per frame and clamp
    // the accumulator so a slow frame can't trigger an ever-growing catch-up
    // burst (which would compound into a multi-second freeze).
    if (isPlaying && lifeEngine) {
        const dt = (time - lastTick) / 1000;
        lastTick = time;
        accum = Math.min(accum + dt, 4 / speed);
        advanceSimulation();
    } else {
        lastTick = time;
    }

    renderer.render(scene, camera);
}

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start with the primitive/detail/rule from the URL, falling back to defaults.
const urlState = readUrlState();
if (Object.keys(urlState).length > 0) {
    ui.setState(urlState);
}
// Randomize the palette on load
applyRandomColors();
const initial = ui.getState();
loadPrimitiveMesh(initial.primitive, initial.detail);
syncUrl();

// Start animation loop
requestAnimationFrame(animate);