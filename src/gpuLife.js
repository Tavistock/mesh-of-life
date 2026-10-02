// GPU-resident Game of Life engine.
//
// The simulation runs entirely on the GPU: cell state + age live in a
// ping-pong pair of render-target textures, and each step is a fullscreen
// fragment-shader pass that counts alive neighbors (via an adjacency texture)
// and applies the rule. The CPU only seeds/toggles cells (small texture
// uploads) and occasionally reads pixels back for the alive-count stat.
//
// Texture layout (shared with the renderer):
//   state: texWidth x texHeight RGBA8, 1 texel per face
//     r = alive flag (0/255), g = age low byte, b = age high byte
//   adjacency: texWidth x (texHeight*K) RGBA32F, K texel-rows per face,
//     4 neighbor slots per texel; value = neighborFace + 1 (0 = empty)
//   rule: 64x1 RGBA8, r = birth bit for neighbor count, g = survival bit

import * as THREE from 'three';
import { parseRule } from './ruleEncoding.js';

// Detect whether the GPU simulation can run on this device. Requires WebGL2
// (for gl_VertexID and float textures) and the ability to render to float
// textures (EXT_color_buffer_float) for the alive-count reduction target.
export function isGpuLifeSupported(renderer) {
    try {
        const gl = renderer.getContext();
        if (!gl) return false;
        const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined'
            && gl instanceof WebGL2RenderingContext;
        if (!isWebGL2) return false;
        if (!gl.getExtension('EXT_color_buffer_float')) return false;
        if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < 2048) return false;
        return true;
    } catch (e) {
        return false;
    }
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D srcTex;
varying vec2 vUv;
void main() {
    gl_FragColor = texture2D(srcTex, vUv);
}
`;

const SIM_FRAG = /* glsl */ `uniform sampler2D stateTex;
uniform sampler2D adjTex;
uniform sampler2D ruleTex;
uniform vec2 texSize;
uniform float H;      // state texture height (rows per adjacency block)
uniform float K;      // adjacency texel-rows per face
uniform float maxAge;
varying vec2 vUv;

void main() {
    float x = floor(vUv.x * texSize.x);
    float y = floor(vUv.y * texSize.y);

    vec4 s = texture2D(stateTex, vUv);
    float alive = step(0.5, s.r);
    float age = floor(s.g * 255.0 + 0.5) + floor(s.b * 255.0 + 0.5) * 256.0;

    // Sum alive neighbors via the adjacency texture
    float sum = 0.0;
    for (int k = 0; k < MAXK; k++) {
        vec2 auv = vec2(vUv.x, (y + float(k) * H + 0.5) / (H * K));
        vec4 a = texture2D(adjTex, auv);
        for (int c = 0; c < 4; c++) {
            float idx = a[c];
            if (idx > 0.5) {
                float id = idx - 1.0;
                float nx = mod(id, texSize.x);
                float ny = floor(id / texSize.x);
                sum += texture2D(stateTex, (vec2(nx, ny) + 0.5) / texSize).r;
            }
        }
    }

    // Rule lookup: r = birth, g = survival, indexed by neighbor count
    vec4 rule = texture2D(ruleTex, vec2((clamp(sum, 0.0, 63.0) + 0.5) / 64.0, 0.5));
    float willLive = alive > 0.5 ? step(0.5, rule.g) : step(0.5, rule.r);

    float newAge = willLive > 0.5
        ? (alive > 0.5 ? min(age + 1.0, maxAge) : 1.0)
        : 0.0;

    gl_FragColor = vec4(
        willLive,
        mod(newAge, 256.0) / 255.0,
        floor(newAge / 256.0) / 255.0,
        1.0
    );
}
`;

// Downsample the state texture into a small grid, summing alive cells per
// block. Each output texel's red channel holds the exact count of alive cells
// in its block. The CPU then sums the small readback buffer.
const REDUCE_FRAG = /* glsl */ `
uniform sampler2D stateTex;
uniform vec2 texSize;
uniform float reduceSize;
varying vec2 vUv;

void main() {
    float bx = floor(vUv.x * reduceSize);
    float by = floor(vUv.y * reduceSize);
    float blockW = texSize.x / reduceSize;
    float blockH = texSize.y / reduceSize;

    // Exact, non-overlapping texel range for this block
    float x0 = floor(bx * blockW);
    float x1 = min(floor((bx + 1.0) * blockW), texSize.x);
    float y0 = floor(by * blockH);
    float y1 = min(floor((by + 1.0) * blockH), texSize.y);

    float sum = 0.0;
    for (int j = 0; j < MAXBLOCK; j++) {
        if (y0 + float(j) >= y1) break;
        for (int i = 0; i < MAXBLOCK; i++) {
            if (x0 + float(i) >= x1) break;
            vec2 p = vec2(x0 + float(i) + 0.5, y0 + float(j) + 0.5);
            sum += step(0.5, texture2D(stateTex, p / texSize).r);
        }
    }
    gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
}
`;

export class GpuLifeEngine {
    // Minimum time between full GPU->CPU alive-count readbacks (ms)
    static STATS_INTERVAL_MS = 250;
    constructor(faceCount, adjacency, glRenderer) {        this.faceCount = faceCount;
        this.adjacency = adjacency;
        this.gl = glRenderer;
        this.generation = 0;
        this.maxAge = 100;
        this.rule = { birth: new Set([3]), survival: new Set([2, 3]) };

        // Shared 2D texture layout (renderer must use the same)
        this.texWidth = Math.max(1, Math.ceil(Math.sqrt(faceCount)));
        this.texHeight = Math.max(1, Math.ceil(faceCount / this.texWidth));
        this.texSize = new THREE.Vector2(this.texWidth, this.texHeight);

        const rtOpts = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
        };
        this.rtA = new THREE.WebGLRenderTarget(this.texWidth, this.texHeight, rtOpts);
        this.rtB = new THREE.WebGLRenderTarget(this.texWidth, this.texHeight, rtOpts);
        this.current = 0; // 0 -> rtA holds current state

        // CPU-side seed mirror: authoritative state for randomize/clear/toggle
        this.seedData = new Uint8Array(this.texWidth * this.texHeight * 4);
        this.seedTexture = new THREE.DataTexture(
            this.seedData, this.texWidth, this.texHeight, THREE.RGBAFormat
        );
        this.seedTexture.magFilter = THREE.NearestFilter;
        this.seedTexture.minFilter = THREE.NearestFilter;
        this.seedTexture.generateMipmaps = false;

        // Adjacency texture (float, sampled only — never rendered to)
        this.K = Math.max(1, Math.ceil(adjacency.maxNeighbors / 4));
        const adjData = new Float32Array(this.texWidth * this.texHeight * this.K * 4);
        const { neighborOffsets, neighbors } = adjacency;
        for (let f = 0; f < faceCount; f++) {
            const col = f % this.texWidth;
            const row = Math.floor(f / this.texWidth);
            let slot = 0;
            for (let j = neighborOffsets[f]; j < neighborOffsets[f + 1]; j++, slot++) {
                const k = Math.floor(slot / 4);
                const c = slot % 4;
                // Layout: texel (f, k) at row (k*H + row)
                adjData[((k * this.texHeight + row) * this.texWidth + col) * 4 + c] = neighbors[j] + 1;
            }
        }
        this.adjTexture = new THREE.DataTexture(
            adjData, this.texWidth, this.texHeight * this.K, THREE.RGBAFormat, THREE.FloatType
        );
        this.adjTexture.magFilter = THREE.NearestFilter;
        this.adjTexture.minFilter = THREE.NearestFilter;
        this.adjTexture.generateMipmaps = false;
        this.adjTexture.needsUpdate = true;

        // Rule lookup texture: 64 entries (neighbor count -> birth/survival)
        this.ruleData = new Uint8Array(64 * 4);
        this.ruleTexture = new THREE.DataTexture(this.ruleData, 64, 1, THREE.RGBAFormat);
        this.ruleTexture.magFilter = THREE.NearestFilter;
        this.ruleTexture.minFilter = THREE.NearestFilter;
        this.ruleTexture.generateMipmaps = false;
        this.ruleTexture.needsUpdate = true;

        // Fullscreen quad for compute passes
        this.scene = new THREE.Scene();
        this.camera = new THREE.Camera();
        this.copyMaterial = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERT,
            fragmentShader: COPY_FRAG,
            uniforms: { srcTex: { value: null } },
            depthTest: false,
            depthWrite: false
        });
        this.simMaterial = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERT,
            fragmentShader: SIM_FRAG,
            defines: { MAXK: this.K },
            uniforms: {
                stateTex: { value: null },
                adjTex: { value: this.adjTexture },
                ruleTex: { value: this.ruleTexture },
                texSize: { value: this.texSize },
                H: { value: this.texHeight },
                K: { value: this.K },
                maxAge: { value: this.maxAge }
            },
            depthTest: false,
            depthWrite: false
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
        this.scene.add(this.quad);

        // Alive-count reduction: downsample the state texture to a small
        // REDUCTION x REDUCTION target, then read back only that (64KB instead
        // of the full ~1.3MB state texture). Each reduction texel sums a block
        // of state texels, so the CPU just adds up the small buffer.
        this.reductionSize = 64;
        this.reduceMaterial = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERT,
            fragmentShader: REDUCE_FRAG,
            defines: { MAXBLOCK: Math.max(1, Math.ceil(Math.max(this.texWidth, this.texHeight) / this.reductionSize)) },
            uniforms: {
                stateTex: { value: null },
                texSize: { value: this.texSize },
                reduceSize: { value: this.reductionSize }
            },
            depthTest: false,
            depthWrite: false
        });
        this.reduceRT = new THREE.WebGLRenderTarget(this.reductionSize, this.reductionSize, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
        });
        this.reduceBuf = new Float32Array(this.reductionSize * this.reductionSize * 4);

        // Stats readback throttling
        this.statsDirty = true;
        this.cachedAlive = 0;
        this.lastRead = 0;
    }

    currentRT() {
        return this.current === 0 ? this.rtA : this.rtB;
    }

    getCurrentTexture() {
        return this.currentRT().texture;
    }

    // Render a fullscreen pass into the current state target
    renderPass(material, target) {
        this.quad.material = material;
        this.gl.setRenderTarget(target);
        this.gl.render(this.scene, this.camera);
        this.gl.setRenderTarget(null);
    }

    // Upload the CPU seed mirror into the current state target
    flushSeed() {
        this.seedTexture.needsUpdate = true;
        this.copyMaterial.uniforms.srcTex.value = this.seedTexture;
        this.renderPass(this.copyMaterial, this.currentRT());
        this.statsDirty = true;
    }

    // Pull the current GPU state into the CPU seed mirror (for read-modify-write)
    syncSeedFromGpu() {
        this.gl.readRenderTargetPixels(
            this.currentRT(), 0, 0, this.texWidth, this.texHeight, this.seedData
        );
    }

    parseRule(ruleString) {
        const { birth, survive } = parseRule(ruleString);
        this.rule = { birth, survival: survive };
        this.ruleData.fill(0);
        for (const b of birth) if (b < 64) this.ruleData[b * 4] = 255;
        for (const s of survive) if (s < 64) this.ruleData[s * 4 + 1] = 255;
        this.ruleTexture.needsUpdate = true;
    }

    setRule(ruleString) {
        this.parseRule(ruleString);
    }

    randomize(density = 0.3) {
        const data = this.seedData;
        for (let f = 0; f < this.faceCount; f++) {
            const i = f * 4;
            const alive = Math.random() < density ? 1 : 0;
            data[i] = alive ? 255 : 0;
            data[i + 1] = alive ? 1 : 0; // age = 1
            data[i + 2] = 0;
            data[i + 3] = 255;
        }
        this.generation = 0;
        this.flushSeed();
    }

    clear() {
        this.seedData.fill(0);
        this.generation = 0;
        this.flushSeed();
    }

    toggleCell(faceIdx) {
        if (faceIdx < 0 || faceIdx >= this.faceCount) return;
        // Read current GPU state first so the toggle applies on top of it
        this.syncSeedFromGpu();
        const i = faceIdx * 4;
        const alive = this.seedData[i] > 127 ? 0 : 1;
        this.seedData[i] = alive ? 255 : 0;
        this.seedData[i + 1] = alive ? 1 : 0;
        this.seedData[i + 2] = 0;
        this.flushSeed();
    }

    // Flip a batch of cells in one read-modify-write pass. Used by the paint
    // brush, which flips a random subset of the faces within its radius.
    flipCells(indices) {
        if (!indices || indices.length === 0) return;
        this.syncSeedFromGpu();
        const data = this.seedData;
        for (const f of indices) {
            if (f < 0 || f >= this.faceCount) continue;
            const i = f * 4;
            const alive = data[i] > 127 ? 0 : 1;
            data[i] = alive ? 255 : 0;
            data[i + 1] = alive ? 1 : 0;
            data[i + 2] = 0;
        }
        this.flushSeed();
    }

    // Overwrite cells from a per-face alive array (1 = alive). If `mask` is
    // given, only faces with mask[f] = 1 are written; the rest keep their
    // current state, so an image can be stamped without clearing the board.
    setCells(aliveArray, mask = null) {
        const data = this.seedData;
        if (mask) this.syncSeedFromGpu();
        for (let f = 0; f < this.faceCount; f++) {
            if (mask && !mask[f]) continue;
            const i = f * 4;
            const alive = aliveArray[f] ? 1 : 0;
            data[i] = alive ? 255 : 0;
            data[i + 1] = alive ? 1 : 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
        }
        this.generation = 0;
        this.flushSeed();
    }

    // Snapshot the current state (for non-destructive live preview).
    snapshot() {
        this.syncSeedFromGpu();
        return { data: new Uint8Array(this.seedData), generation: this.generation };
    }

    restore(snap) {
        if (!snap) return;
        this.seedData.set(snap.data);
        this.generation = snap.generation;
        this.flushSeed();
    }

    step() {
        const src = this.currentRT();
        const dst = this.current === 0 ? this.rtB : this.rtA;
        this.simMaterial.uniforms.stateTex.value = src.texture;
        this.simMaterial.uniforms.maxAge.value = this.maxAge;
        this.renderPass(this.simMaterial, dst);
        this.current = 1 - this.current;
        this.generation++;
        this.statsDirty = true;
    }

    // Alive count via a GPU reduction pass + small readback. The full state
    // texture (~1.3 MB at detail 128) is downsampled to a 64x64 float target
    // on the GPU, so the CPU only reads back 64 KB. Throttled so the readback
    // stall happens at most every STATS_INTERVAL_MS.
    getAliveCount() {
        const now = performance.now();
        if (this.lastRead && now - this.lastRead < GpuLifeEngine.STATS_INTERVAL_MS) {
            return this.cachedAlive;
        }
        this.reduceMaterial.uniforms.stateTex.value = this.currentRT().texture;
        this.renderPass(this.reduceMaterial, this.reduceRT);
        this.gl.readRenderTargetPixels(
            this.reduceRT, 0, 0, this.reductionSize, this.reductionSize, this.reduceBuf
        );
        let count = 0;
        const buf = this.reduceBuf;
        for (let i = 0; i < buf.length; i += 4) {
            count += buf[i];
        }
        this.cachedAlive = Math.round(count);
        this.statsDirty = false;
        this.lastRead = now;
        return this.cachedAlive;
    }

    getGeneration() {
        return this.generation;
    }

    dispose() {
        this.rtA.dispose();
        this.rtB.dispose();
        this.seedTexture.dispose();
        this.adjTexture.dispose();
        this.ruleTexture.dispose();
        this.reduceRT.dispose();
        this.quad.geometry.dispose();
        this.copyMaterial.dispose();
        this.simMaterial.dispose();
        this.reduceMaterial.dispose();
    }
}
