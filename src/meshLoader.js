// Mesh loading: primitives + GLTF/OBJ, with normalization

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loaderGLTF = new GLTFLoader();
const loaderOBJ = new OBJLoader();
const loaderSTL = new STLLoader();
const loaderPLY = new PLYLoader();
const loaderFBX = new FBXLoader();

// Hosted test meshes (OBJ) from the common-3d-test-models repo. These are
// fetched by URL so no binary assets need to be bundled in the workspace.
// raw.githubusercontent.com sends permissive CORS headers, so this works
// from the browser. Note: the Detail slider does not apply to these — they
// use their own fixed resolution.
export const TEST_MODELS = {
    teapot: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/teapot.obj',
    bunny: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/stanford-bunny.obj',
    suzanne: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/suzanne.obj',
    cow: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/cow.obj'
};

export async function loadTestModel(name) {
    const url = TEST_MODELS[name];
    if (!url) throw new Error(`Unknown test model: ${name}`);
    const obj = await loaderOBJ.loadAsync(url);
    return normalizeGeometry(extractFirstGeometry(obj));
}

// `detail` is a power of two (1..256) describing the target resolution.
// Each primitive maps it to its own subdivision/segment parameters.
export function createPrimitive(type, detail = 128) {
    const d = Math.max(1, Math.round(detail));
    let geometry;
    switch (type) {
        case 'icosahedron':
            // Subdivision level is log2(detail): 1 -> 0, 256 -> 8.
            geometry = new THREE.IcosahedronGeometry(1, d);
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(
                1,
                Math.max(3, d * 2),
                Math.max(2, d)
            );
            break;
        case 'torus':
            geometry = new THREE.TorusGeometry(
                1,
                0.4,
                Math.max(3, d),
                Math.max(3, d * 2)
            );
            break;
        case 'box':
            geometry = new THREE.BoxGeometry(1, 1, 1, d, d, d);
            break;
        default:
            geometry = new THREE.IcosahedronGeometry(1, d);
    }
    return normalizeGeometry(geometry);
}

export async function loadGLTF(file) {
    const url = URL.createObjectURL(file);
    try {
        const gltf = await loaderGLTF.loadAsync(url);
        const geometry = extractFirstGeometry(gltf.scene);
        return normalizeGeometry(geometry);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function loadOBJ(file) {
    const url = URL.createObjectURL(file);
    try {
        const obj = await loaderOBJ.loadAsync(url);
        const geometry = extractFirstGeometry(obj);
        return normalizeGeometry(geometry);
    } finally {
        URL.revokeObjectURL(url);
    }
}

// STL and PLY loaders return a BufferGeometry directly (not a scene graph).
export async function loadSTL(file) {
    const url = URL.createObjectURL(file);
    try {
        const geometry = await loaderSTL.loadAsync(url);
        return normalizeGeometry(geometry);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function loadPLY(file) {
    const url = URL.createObjectURL(file);
    try {
        const geometry = await loaderPLY.loadAsync(url);
        return normalizeGeometry(geometry);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function loadFBX(file) {
    const url = URL.createObjectURL(file);
    try {
        const object = await loaderFBX.loadAsync(url);
        const geometry = extractFirstGeometry(object);
        return normalizeGeometry(geometry);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function extractFirstGeometry(object) {
    let geometry = null;
    object.traverse((child) => {
        if (child.isMesh && child.geometry && !geometry) {
            geometry = child.geometry;
        }
    });
    if (!geometry) {
        throw new Error('No mesh geometry found in file');
    }
    return geometry;
}

export function normalizeGeometry(geometry) {
    // Ensure indexed
    if (!geometry.index) {
        geometry = mergeVertices(geometry);
    }

    // Center and scale to unit sphere
    geometry.computeBoundingSphere();
    const center = geometry.boundingSphere.center;
    const radius = geometry.boundingSphere.radius || 1;

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        position.setX(i, (position.getX(i) - center.x) / radius);
        position.setY(i, (position.getY(i) - center.y) / radius);
        position.setZ(i, (position.getZ(i) - center.z) / radius);
    }
    position.needsUpdate = true;

    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
}

// Simple vertex welding by quantized position hash
function mergeVertices(geometry) {
    const position = geometry.attributes.position;
    const vertexMap = new Map();
    const newIndices = new Array(position.count);
    const newPositions = [];
    const quantization = 1e-4;

    for (let i = 0; i < position.count; i++) {
        const x = Math.round(position.getX(i) / quantization);
        const y = Math.round(position.getY(i) / quantization);
        const z = Math.round(position.getZ(i) / quantization);
        const key = `${x},${y},${z}`;

        let newIndex = vertexMap.get(key);
        if (newIndex === undefined) {
            newIndex = newPositions.length / 3;
            vertexMap.set(key, newIndex);
            newPositions.push(position.getX(i), position.getY(i), position.getZ(i));
        }
        newIndices[i] = newIndex;
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setIndex(newIndices);
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));

    // Copy other attributes if they exist (normals, uvs)
    if (geometry.attributes.normal) {
        const normals = [];
        for (let i = 0; i < position.count; i++) {
            const ni = newIndices[i] * 3;
            normals[ni] = geometry.attributes.normal.getX(i);
            normals[ni + 1] = geometry.attributes.normal.getY(i);
            normals[ni + 2] = geometry.attributes.normal.getZ(i);
        }
        newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    if (geometry.attributes.uv) {
        const uvs = [];
        for (let i = 0; i < position.count; i++) {
            const ui = newIndices[i] * 2;
            uvs[ui] = geometry.attributes.uv.getX(i);
            uvs[ui + 1] = geometry.attributes.uv.getY(i);
        }
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }

    return newGeometry;
}

export function getFaceCount(geometry) {
    const index = geometry.index;
    return index ? index.count / 3 : geometry.attributes.position.count / 3;
}