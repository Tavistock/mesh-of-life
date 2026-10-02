// Game of Life engine with rule parsing, typed arrays, and age tracking

import * as THREE from 'three';
import { parseRule } from './ruleEncoding.js';

export class LifeEngine {
    constructor(faceCount, adjacency) {
        this.faceCount = faceCount;
        this.adjacency = adjacency;
        this.state = new Uint8Array(faceCount); // 0 = dead, 1 = alive
        this.age = new Uint16Array(faceCount);  // generations alive
        this.generation = 0;
        this.rule = { birth: new Set([3]), survival: new Set([2, 3]) };
        this.maxAge = 100; // for color gradient

        // GPU-compatible interface: expose a state texture in the same layout
        // the renderer expects (RGBA8, 1 texel per face, r = alive, g/b = age).
        // This lets the CPU engine act as a drop-in fallback for GpuLifeEngine.
        this.texWidth = Math.max(1, Math.ceil(Math.sqrt(faceCount)));
        this.texHeight = Math.max(1, Math.ceil(faceCount / this.texWidth));
        this.texSize = new THREE.Vector2(this.texWidth, this.texHeight);
        this.stateData = new Uint8Array(this.texWidth * this.texHeight * 4);
        this.stateTexture = new THREE.DataTexture(
            this.stateData, this.texWidth, this.texHeight, THREE.RGBAFormat
        );
        this.stateTexture.magFilter = THREE.NearestFilter;
        this.stateTexture.minFilter = THREE.NearestFilter;
        this.stateTexture.generateMipmaps = false;
        this.stateTexture.needsUpdate = true;
    }

    // Pack state + age into the texture and flag it for upload
    syncTexture() {
        const data = this.stateData;
        for (let f = 0; f < this.faceCount; f++) {
            const i = f * 4;
            data[i] = this.state[f] ? 255 : 0;
            const a = this.age[f];
            data[i + 1] = a & 255;
            data[i + 2] = (a >> 8) & 255;
            data[i + 3] = 255;
        }
        this.stateTexture.needsUpdate = true;
    }

    getCurrentTexture() {
        this.syncTexture();
        return this.stateTexture;
    }

    parseRule(ruleString) {
        const { birth, survive } = parseRule(ruleString);
        this.rule = { birth, survival: survive };
    }

    setRule(ruleString) {
        this.parseRule(ruleString);
    }

    randomize(density = 0.3) {
        for (let i = 0; i < this.faceCount; i++) {
            this.state[i] = Math.random() < density ? 1 : 0;
            this.age[i] = this.state[i] ? 1 : 0;
        }
        this.generation = 0;
    }

    clear() {
        this.state.fill(0);
        this.age.fill(0);
        this.generation = 0;
    }

    toggleCell(faceIdx) {
        if (faceIdx < 0 || faceIdx >= this.faceCount) return;
        this.state[faceIdx] = 1 - this.state[faceIdx];
        this.age[faceIdx] = this.state[faceIdx] ? 1 : 0;
    }

    // Flip a batch of cells. Used by the paint brush.
    flipCells(indices) {
        if (!indices) return;
        for (const f of indices) {
            if (f < 0 || f >= this.faceCount) continue;
            this.state[f] = 1 - this.state[f];
            this.age[f] = this.state[f] ? 1 : 0;
        }
    }

    // Overwrite cells from a per-face alive array (1 = alive). If `mask` is
    // given, only faces with mask[f] = 1 are written; the rest keep their
    // current state, so an image can be stamped without clearing the board.
    setCells(aliveArray, mask = null) {
        for (let f = 0; f < this.faceCount; f++) {
            if (mask && !mask[f]) continue;
            const alive = aliveArray[f] ? 1 : 0;
            this.state[f] = alive;
            this.age[f] = alive;
        }
        this.generation = 0;
    }

    // Snapshot the current state (for non-destructive live preview).
    snapshot() {
        return {
            state: this.state.slice(),
            age: this.age.slice(),
            generation: this.generation
        };
    }

    restore(snap) {
        if (!snap) return;
        this.state.set(snap.state);
        this.age.set(snap.age);
        this.generation = snap.generation;
    }

    step() {
        const newState = new Uint8Array(this.faceCount);
        const newAge = new Uint16Array(this.faceCount);

        for (let f = 0; f < this.faceCount; f++) {
            const neighbors = this.adjacency.getNeighbors(f);
            let aliveNeighbors = 0;
            for (const n of neighbors) {
                aliveNeighbors += this.state[n];
            }

            const isAlive = this.state[f];
            let willLive = false;

            if (isAlive) {
                willLive = this.rule.survival.has(aliveNeighbors);
            } else {
                willLive = this.rule.birth.has(aliveNeighbors);
            }

            newState[f] = willLive ? 1 : 0;
            if (willLive) {
                newAge[f] = isAlive ? Math.min(this.age[f] + 1, this.maxAge) : 1;
            } else {
                newAge[f] = 0;
            }
        }

        this.state = newState;
        this.age = newAge;
        this.generation++;
    }

    getAliveCount() {
        let count = 0;
        for (let i = 0; i < this.faceCount; i++) {
            count += this.state[i];
        }
        return count;
    }

    getState() {
        return this.state;
    }

    getAge() {
        return this.age;
    }

    getGeneration() {
        return this.generation;
    }
}