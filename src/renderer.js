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
uniform sampler2D highlightTex;   // 1 texel per face, r = outline flag
uniform vec3 highlightColor;
uniform float highlightStrength;

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

    // Brush outline overlay (paint-mode hover). highlightStrength is 0 when
    // no brush is active, so this is a no-op outside paint mode.
    float hl = texture2D(highlightTex, uv).r;
    col = mix(col, highlightColor, hl * highlightStrength);

    gl_FragColor = vec4(col, 1.0);
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

        this.buildMesh(geometry);
    }

    buildMesh(geometry) {
        // Remove old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
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
                highlightColor: { value: new THREE.Color(0xffffff) },
                highlightStrength: { value: 0 }
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
    }

    // Replace the outline set. `faces` is an iterable of face indices to
    // outline; pass null/empty to clear. Uploads the whole small texture.
    setHighlight(faces) {
        if (!this.highlightData) return;
        this.highlightData.fill(0);
        if (faces) {
            for (const f of faces) {
                if (f >= 0 && f < this.faceCount) this.highlightData[f * 4] = 255;
            }
        }
        this.highlightTexture.needsUpdate = true;
        this.material.uniforms.highlightStrength.value = faces && faces.length ? 1 : 0;
    }

    clearHighlight() {
        if (!this.highlightData) return;
        this.highlightData.fill(0);
        this.highlightTexture.needsUpdate = true;
        this.material.uniforms.highlightStrength.value = 0;
    }

    setHighlightColor(hex) {
        if (this.material) this.material.uniforms.highlightColor.value.set(hex);
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
    }
}