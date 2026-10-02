// Build face adjacency from indexed geometry.
//
// Two modes:
//   - Edge adjacency (useVertexAdjacency = false): faces sharing an edge.
//   - Vertex adjacency (useVertexAdjacency = true): faces sharing at least one
//     vertex. This is a *superset* of edge adjacency (faces sharing an edge
//     also share two vertices), so it is built purely from vertex incidence
//     and deduped per face — edge neighbors are not counted twice.
//
// Performance notes:
//   - Vertex -> face incidence is built as a CSR structure via counting sort
//     over typed arrays, avoiding a Map plus one array per vertex.
//   - Edge adjacency is derived from that CSR (scan the faces around one
//     endpoint and keep those containing the other), which is much faster than
//     an edge-keyed hash map and handles non-manifold edges.

export function buildAdjacency(geometry, useVertexAdjacency = false) {
    const index = geometry.index;
    const position = geometry.attributes.position;
    const faceCount = index ? index.count / 3 : position.count / 3;
    const idxArray = index ? index.array : null;

    // Vertex index of the k-th corner of face f.
    const vertexOf = idxArray
        ? (f, k) => idxArray[f * 3 + k]
        : (f, k) => f * 3 + k;

    // Number of vertices (upper bound on vertex indices + 1).
    const V = idxArray ? maxOf(idxArray) + 1 : position.count;

    const neighborCounts = new Uint16Array(faceCount);
    const neighborOffsets = new Uint32Array(faceCount + 1);
    let maxNeighbors = 0;

    // --- Vertex -> face incidence (CSR via counting sort) -----------------
    const vertexCounts = new Uint32Array(V);
    for (let f = 0; f < faceCount; f++) {
        for (let k = 0; k < 3; k++) vertexCounts[vertexOf(f, k)]++;
    }
    const vertexOffsets = new Uint32Array(V + 1);
    let vAcc = 0;
    for (let v = 0; v < V; v++) {
        vertexOffsets[v] = vAcc;
        vAcc += vertexCounts[v];
    }
    vertexOffsets[V] = vAcc;
    const vertexFaces = new Uint32Array(vAcc);
    const vFill = new Uint32Array(V);
    for (let f = 0; f < faceCount; f++) {
        for (let k = 0; k < 3; k++) {
            const v = vertexOf(f, k);
            vertexFaces[vertexOffsets[v] + vFill[v]++] = f;
        }
    }

    if (useVertexAdjacency) {
        // --- Vertex adjacency (union of edge + vertex sharing) ------------
        // Pass 1: count unique neighbors per face. `stamp[g] === f` marks g as
        // already counted for face f, so shared vertices don't double-add.
        const stamp = new Int32Array(faceCount).fill(-1);
        for (let f = 0; f < faceCount; f++) {
            let count = 0;
            for (let k = 0; k < 3; k++) {
                const v = vertexOf(f, k);
                for (let i = vertexOffsets[v]; i < vertexOffsets[v + 1]; i++) {
                    const g = vertexFaces[i];
                    if (g !== f && stamp[g] !== f) {
                        stamp[g] = f;
                        count++;
                    }
                }
            }
            neighborCounts[f] = count;
            if (count > maxNeighbors) maxNeighbors = count;
        }

        // Prefix sum
        let total = 0;
        for (let f = 0; f < faceCount; f++) {
            neighborOffsets[f] = total;
            total += neighborCounts[f];
        }
        neighborOffsets[faceCount] = total;

        // Pass 2: fill the flat neighbor array (same dedup).
        const neighbors = new Uint32Array(total);
        stamp.fill(-1);
        for (let f = 0; f < faceCount; f++) {
            let pos = neighborOffsets[f];
            for (let k = 0; k < 3; k++) {
                const v = vertexOf(f, k);
                for (let i = vertexOffsets[v]; i < vertexOffsets[v + 1]; i++) {
                    const g = vertexFaces[i];
                    if (g !== f && stamp[g] !== f) {
                        stamp[g] = f;
                        neighbors[pos++] = g;
                    }
                }
            }
        }

        return makeResult(faceCount, neighborCounts, neighborOffsets, neighbors, true, maxNeighbors);
    }

    // --- Edge adjacency ---------------------------------------------------
    // For each edge (a, b) of face f, the faces sharing that edge are exactly
    // the faces around vertex a that also contain b. Using `g > f` emits each
    // unordered pair once; not breaking after the first match keeps non-manifold
    // edges (3+ faces) fully connected.
    const pairA = new Uint32Array(faceCount * 3);
    const pairB = new Uint32Array(faceCount * 3);
    let pairCount = 0;

    for (let f = 0; f < faceCount; f++) {
        const a0 = vertexOf(f, 0);
        const a1 = vertexOf(f, 1);
        const a2 = vertexOf(f, 2);
        const ea = [a0, a1, a2];
        const eb = [a1, a2, a0];
        for (let e = 0; e < 3; e++) {
            const a = ea[e];
            const b = eb[e];
            for (let i = vertexOffsets[a]; i < vertexOffsets[a + 1]; i++) {
                const g = vertexFaces[i];
                if (g <= f) continue;
                if (faceHasVertex(vertexOf, g, b)) {
                    pairA[pairCount] = f;
                    pairB[pairCount] = g;
                    pairCount++;
                    neighborCounts[f]++;
                    neighborCounts[g]++;
                }
            }
        }
    }

    // Prefix sum
    let total = 0;
    for (let f = 0; f < faceCount; f++) {
        neighborOffsets[f] = total;
        total += neighborCounts[f];
        if (neighborCounts[f] > maxNeighbors) maxNeighbors = neighborCounts[f];
    }
    neighborOffsets[faceCount] = total;

    // Fill the flat neighbor array from the emitted pairs.
    const neighbors = new Uint32Array(total);
    const fillPos = new Uint32Array(faceCount);
    for (let p = 0; p < pairCount; p++) {
        const a = pairA[p];
        const b = pairB[p];
        neighbors[neighborOffsets[a] + fillPos[a]++] = b;
        neighbors[neighborOffsets[b] + fillPos[b]++] = a;
    }

    return makeResult(faceCount, neighborCounts, neighborOffsets, neighbors, false, maxNeighbors);
}

function maxOf(arr) {
    let m = 0;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > m) m = arr[i];
    }
    return m;
}

function faceHasVertex(vertexOf, f, v) {
    return vertexOf(f, 0) === v || vertexOf(f, 1) === v || vertexOf(f, 2) === v;
}

function makeResult(faceCount, neighborCounts, neighborOffsets, neighbors, useVertexAdjacency, maxNeighbors) {
    return {
        faceCount,
        neighborCounts,
        neighborOffsets,
        neighbors,
        useVertexAdjacency,
        maxNeighbors,
        // Helper to iterate neighbors of a face
        getNeighbors(faceIdx) {
            const start = this.neighborOffsets[faceIdx];
            const end = this.neighborOffsets[faceIdx + 1];
            return this.neighbors.subarray(start, end);
        }
    };
}

export function computeAdjacencyStats(adj) {
    let totalNeighbors = 0;
    let isolated = 0;
    for (let f = 0; f < adj.faceCount; f++) {
        const count = adj.neighborCounts[f];
        totalNeighbors += count;
        if (count === 0) isolated++;
    }
    return {
        avgNeighbors: adj.faceCount > 0 ? totalNeighbors / adj.faceCount : 0,
        isolatedFaces: isolated
    };
}