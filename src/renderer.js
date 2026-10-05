// Renderer: GPU-side per-face coloring driven by the GPU simulation.
//
// The renderer samples the GpuLifeEngine's state texture directly in the
// fragment shader (1 texel per face, face id from gl_VertexID). There is no
// CPU-side color work at all: simulation and coloring both live on the GPU.

import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying float vFaceId;

void main() {
    // Non-indexed geometry: 3 consecutive vertices per face.
    vFaceId = float(gl_VertexID / 3);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D stateTex;
uniform vec2 texSize;      // texture dimensions (texels)
uniform vec3 deadColor;
uniform vec3 cellColor;
uniform vec3 ageColor;
uniform float maxAge;
uniform sampler2D highlightTex;   // 1 texel per face, r = brush flag
uniform float highlightStrength;  // how much to brighten highlighted faces

varying float vFaceId;

void main() {
    float id = vFaceId;
    float x = mod(id, texSize.x);
    float y = floor(id / texSize.x);
    vec2 uv = (vec2(x, y) + 0.5) / texSize;

    vec4 s = texture2D(stateTex, uv);
    float alive = step(0.5, s.r);
    float age = floor(s.g * 255.0 + 0.5) + floor(s.b * 255.0 + 0.5) * 256.0;

    float t = clamp(age / maxAge, 0.0, 1.0);
    vec3 aliveCol = mix(cellColor, ageColor, t);
    vec3 col = mix(deadColor, aliveCol, alive);

    // Brush highlight (hover): brighten every face in the brush toward white,
    // toward white, keeping its current color. highlightStrength is 0 when no
    // brush is active, so this is a no-op outside paint mode.
    float hl = texture2D(highlightTex, uv).r;
    col = mix(col, vec3(1.0), hl * highlightStrength);

    gl_FragColor = vec4(col, 1.0);
}
`;

// GPU face picking: render the mesh to a 1x1 target with the face id encoded
// in RGB (id + 1, so 0 means "no hit"). The CPU then reads back a single pixel
// instead of raycasting the whole mesh. 24 bits covers ~16M faces.
const pickingVertexShader = /* glsl */ `
varying float vFaceId;

void main() {
    vFaceId = float(gl_VertexID / 3);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const pickingFragmentShader = /* glsl */ `
varying float vFaceId;

void main() {
    float id = vFaceId + 1.0;
    float r = mod(id, 256.0);
    float g = mod(floor(id / 256.0), 256.0);
    float b = mod(floor(id / 65536.0), 256.0);
    gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}
`;

export class MeshRenderer {
    constructor(scene, geometry, bgColor, deadColor, cellColor, ageColor) {
        this.scene = scene;
        this.bgColor = bgColor;
        this.deadColor = deadColor;
        this.cellColor = cellColor;
        this.ageColor = ageColor;
        this.mesh = null;
        this.geometry = null;
        this.faceCount = 0;

        // Brush outline overlay: a 1-texel-per-face texture the main loop
        // updates when the paint brush moves. Kept separate from the sim
        // state so the renderer stays a pure consumer of textures.
        this.highlightData = null;
        this.highlightTexture = null;

        // GPU face picking resources (see pickFaceGPU).
        this.pickingScene = null;
        this.pickingMaterial = null;
        this.pickingMesh = null;
        this.pickingRT = null;

        this.buildMesh(geometry);
    }

    buildMesh(geometry) {
        // Remove old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        // The picking mesh shares the geometry, so only its material/scene
        // entry need cleaning up here (the geometry is disposed above).
        if (this.pickingMesh) {
            this.pickingScene.remove(this.pickingMesh);
            this.pickingMaterial.dispose();
            this.pickingMesh = null;
        }

        // Convert to non-indexed for flat per-face shading. Face id is derived
        // from gl_VertexID, so no extra attribute or color buffer is needed.
        const nonIndexed = geometry.toNonIndexed();
        this.geometry = nonIndexed;
        this.faceCount = nonIndexed.attributes.position.count / 3;

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                stateTex: { value: null },
                texSize: { value: new THREE.Vector2(1, 1) },
                deadColor: { value: new THREE.Color(this.deadColor) },
                cellColor: { value: new THREE.Color(this.cellColor) },
                ageColor: { value: new THREE.Color(this.ageColor) },
                maxAge: { value: 100 },
                highlightTex: { value: null },
                highlightStrength: { value: 0.35 }
            }
        });

        // Allocate the highlight texture to match the state texture layout.
        // It is only written when the brush is active, so a zero-filled
        // buffer is the correct initial state.
        const texW = Math.max(1, Math.ceil(Math.sqrt(this.faceCount)));
        const texH = Math.max(1, Math.ceil(this.faceCount / texW));
        this.highlightData = new Uint8Array(texW * texH * 4);
        this.highlightTexture = new THREE.DataTexture(
            this.highlightData, texW, texH, THREE.RGBAFormat
        );
        this.highlightTexture.magFilter = THREE.NearestFilter;
        this.highlightTexture.minFilter = THREE.NearestFilter;
        this.highlightTexture.generateMipmaps = false;
        this.highlightTexture.needsUpdate = true;
        this.material.uniforms.highlightTex.value = this.highlightTexture;

        this.mesh = new THREE.Mesh(nonIndexed, this.material);
        this.scene.add(this.mesh);

        // GPU picking: a second mesh sharing the geometry, rendered to a 1x1
        // target. The face id is derived from gl_VertexID, so no extra
        // attribute is needed. DoubleSide matches the visible surface.
        this.pickingScene = new THREE.Scene();
        this.pickingScene.background = new THREE.Color(0x000000);
        this.pickingMaterial = new THREE.ShaderMaterial({
            vertexShader: pickingVertexShader,
            fragmentShader: pickingFragmentShader,
            side: THREE.DoubleSide
        });
        this.pickingMesh = new THREE.Mesh(nonIndexed, this.pickingMaterial);
        this.pickingScene.add(this.pickingMesh);
        this.pickingRT = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false,
            generateMipmaps: false
        });
    }

    // Replace the brush highlight set. `faces` is an iterable of face indices
    // to brighten; pass null/empty to clear. Uploads the whole small texture.
    setBrushHighlight(faces) {
        if (!this.highlightData) return;
        this.highlightData.fill(0);
        if (faces) {
            for (const f of faces) {
                if (f >= 0 && f < this.faceCount) this.highlightData[f * 4] = 255;
            }
        }
        this.highlightTexture.needsUpdate = true;
    }

    clearBrushHighlight() {
        if (!this.highlightData) return;
        this.highlightData.fill(0);
        this.highlightTexture.needsUpdate = true;
    }

    // Bind the GPU engine's current state texture. Called every frame so the
    // renderer always samples the latest ping-pong target.
    setStateTexture(texture, texSize, maxAge) {
        this.material.uniforms.stateTex.value = texture;
        this.material.uniforms.texSize.value.copy(texSize);
        this.material.uniforms.maxAge.value = maxAge;
    }

    setBgColor(hex) {
        this.bgColor = hex;
    }

    setDeadColor(hex) {
        this.deadColor = hex;
        if (this.material) this.material.uniforms.deadColor.value.set(hex);
    }

    setCellColor(hex) {
        this.cellColor = hex;
        if (this.material) this.material.uniforms.cellColor.value.set(hex);
    }

    setAgeColor(hex) {
        this.ageColor = hex;
        if (this.material) this.material.uniforms.ageColor.value.set(hex);
    }

    getMesh() {
        return this.mesh;
    }

    getFaceCount() {
        return this.faceCount;
    }

    // GPU face picking. Renders the mesh to a 1x1 target with the face id
    // encoded in RGB, then reads that single pixel back. Returns a Promise
    // resolving to the face index under the cursor, or -1 for a miss.
    //
    // PERF: this uses the SYNCHRONOUS readRenderTargetPixels. The async variant
    // (readRenderTargetPixelsAsync) uses a PIXEL_PACK_BUFFER + fence poll that
    // wedges the frame loop on some drivers: after a fast orbit/hover, rAF
    // collapses to ~1 FPS and never recovers (the PIXEL_PACK buffer is left
    // bound, poisoning later readbacks). A 1x1 readback is cheap enough to do
    // synchronously, and it keeps the cost independent of face count.
    pickFaceGPU(clientX, clientY, camera, renderer) {
        if (!this.pickingMesh || !this.pickingRT) return Promise.resolve(-1);
        const dom = renderer.domElement;
        const rect = dom.getBoundingClientRect();
        const dpr = renderer.getPixelRatio();
        const px = Math.floor((clientX - rect.left) * dpr);
        const py = Math.floor((clientY - rect.top) * dpr);
        if (px < 0 || py < 0 || px >= dom.width || py >= dom.height) {
            return Promise.resolve(-1);
        }

        // Render just the pixel under the cursor by offsetting the view.
        camera.setViewOffset(dom.width, dom.height, px, py, 1, 1);
        const prevTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.pickingRT);
        renderer.render(this.pickingScene, camera);
        const buf = new Uint8Array(4);
        renderer.readRenderTargetPixels(this.pickingRT, 0, 0, 1, 1, buf);
        renderer.setRenderTarget(prevTarget);
        camera.clearViewOffset();

        const id = buf[0] + buf[1] * 256 + buf[2] * 65536;
        return Promise.resolve(id > 0 ? id - 1 : -1);
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.material.dispose();
            this.mesh = null;
        }
        if (this.highlightTexture) {
            this.highlightTexture.dispose();
            this.highlightTexture = null;
            this.highlightData = null;
        }
        if (this.pickingMesh) {
            this.pickingScene.remove(this.pickingMesh);
            this.pickingMaterial.dispose();
            this.pickingMesh = null;
        }
        if (this.pickingRT) {
            this.pickingRT.dispose();
            this.pickingRT = null;
        }
    }
}