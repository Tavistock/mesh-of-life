// Rasterizer: project a bitmap image onto the mesh's faces.
//
// Each face is reduced to its centroid, the centroid is projected to a 2D UV
// coordinate (spherical or planar), and the image is sampled there. The
// resulting per-face alive flags seed the Game of Life.
//
// Meshes are normalized to a unit sphere (see meshLoader.normalizeGeometry),
// so a spherical (equirectangular) projection is the natural default: it
// wraps the image around the whole surface with no gaps.

// Load a File into an ImageBitmap (decoded off the main thread).
export async function loadImage(file) {
    return await createImageBitmap(file);
}

// Load an image from a URL or data URL into an ImageBitmap.
export async function loadImageFromUrl(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob);
}

// Draw an image into an offscreen canvas and return its ImageData. Large
// images are downscaled to `maxSize` on the longest edge — sampling is
// nearest-neighbour per face, so extra resolution is wasted work.
export function imageToImageData(image, maxSize = 1024) {
    let w = image.width;
    let h = image.height;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

// Per-face centroids from a (possibly indexed) geometry. Face order matches
// the renderer/adjacency face order, so index f here is the same cell f.
// Cached per geometry (WeakMap) since the live preview recomputes often.
const centroidCache = new WeakMap();

export function computeFaceCentroids(geometry) {
    const cached = centroidCache.get(geometry);
    if (cached) return cached;

    const index = geometry.index;
    const pos = geometry.attributes.position;
    const faceCount = index ? index.count / 3 : pos.count / 3;
    const centroids = new Float32Array(faceCount * 3);

    for (let f = 0; f < faceCount; f++) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) {
            const vi = index ? index.getX(f * 3 + k) : f * 3 + k;
            cx += pos.getX(vi);
            cy += pos.getY(vi);
            cz += pos.getZ(vi);
        }
        centroids[f * 3] = cx / 3;
        centroids[f * 3 + 1] = cy / 3;
        centroids[f * 3 + 2] = cz / 3;
    }
    centroidCache.set(geometry, centroids);
    return centroids;
}

// Project a point to UV in [0,1]^2. Returns null if the point falls outside
// the projection's valid range (planar modes only cover the unit cube).
export function projectPoint(x, y, z, mode) {
    if (mode === 'spherical') {
        const len = Math.hypot(x, y, z) || 1;
        const nx = x / len, ny = y / len, nz = z / len;
        const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
        const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
        return [u, v];
    }
    // Planar projections are through-projections: both the front and back of
    // the mesh receive the image (like a decal projected through the object).
    if (mode === 'top') return [(x + 1) / 2, (z + 1) / 2];
    if (mode === 'side') return [(z + 1) / 2, (1 - y) / 2];
    // 'front' (default)
    return [(x + 1) / 2, (1 - y) / 2];
}

// Apply the inverse of the user's preview transform to a UV coordinate.
// The preview shows the image scaled/rotated/translated in the [0,1] UV
// square; sampling must undo that, so we rotate by -rotation and divide by
// scale. Offsets are in UV units (1 = full width/height).
export function applyTransform(u, v, transform) {
    if (!transform) return [u, v];
    const { scale = 1, rotation = 0, offsetX = 0, offsetY = 0 } = transform;
    const x = u - 0.5 - offsetX;
    const y = v - 0.5 - offsetY;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    const s = scale || 1;
    return [rx / s + 0.5, ry / s + 0.5];
}

// Rasterize an image onto the geometry. Returns { alive, mask }:
//   alive[f] = 1 if face f should be alive, 0 if dead
//   mask[f]  = 1 if face f is covered by the image (in bounds + opaque)
// Faces with mask 0 are outside the image (or transparent) and should be
// left untouched by the caller, so the image acts as a stamp rather than
// clearing the whole board.
export function rasterize(geometry, imageData, options = {}) {
    const { mode = 'spherical', threshold = 0.5, invert = false, transform = null } = options;
    const centroids = computeFaceCentroids(geometry);
    const faceCount = centroids.length / 3;
    const { data, width, height } = imageData;
    const alive = new Uint8Array(faceCount);
    const mask = new Uint8Array(faceCount);

    for (let f = 0; f < faceCount; f++) {
        const uv = projectPoint(
            centroids[f * 3], centroids[f * 3 + 1], centroids[f * 3 + 2], mode
        );
        if (!uv) continue;
        const [u, v] = applyTransform(uv[0], uv[1], transform);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;

        const px = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
        const py = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
        const i = (py * width + px) * 4;

        // Transparent pixels are not covered: leave the cell untouched.
        const alpha = data[i + 3] / 255;
        if (alpha <= 0.5) continue;

        const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        let on = lum > threshold;
        if (invert) on = !on;

        mask[f] = 1;
        alive[f] = on ? 1 : 0;
    }
    return { alive, mask };
}
