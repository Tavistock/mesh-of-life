
/*
 * Parametric surface definitions.
 *
 * Adapted from "Interactive Vector Calculus — Parametric Surfaces Gallery"
 * by Juan Carlos Ponce Campuzano (jcponce) / vector-calculus
 *   https://github.com/vector-calculus/vector-calculus.github.io
 * Licensed under CC BY-NC-SA 4.0
 *   https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 * See CREDITS.md for full attribution.
 */

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

// Define commonly used Math functions
const cos = Math.cos;
const sin = Math.sin;
const cosh = Math.cosh;
const sinh = Math.sinh;
const log = Math.log;
const exp = Math.exp;
const pow = Math.pow;
const tan = Math.tan;
const PI = Math.PI;
const max = Math.max;
const min = Math.min;

/**
 * @param {*} u
 * @param {*} v 
 * @param {*} target 
 * Extra parameters...
 * @param {*} uComponent - slider
 * @param {*} vComponent - slider
 */

function appleSurface(u, v, target, uComponent = 6.2831, vComponent = 3.1415) {
    u = uComponent * u;
    v = -PI + (vComponent - (-PI)) * v;

    let x = cos(u) * (4 + 3.8 * cos(v));
    let y = sin(u) * (4 + 3.8 * cos(v));
    let z = (cos(v) + sin(v) - 1) * (1 + sin(v)) * log(1 - (PI * v) / 10) + 7.5 * sin(v);

    target.set(x, y, z);
}

function bernatSurface(u, v, target, s = 0.87, uComponent = 1.2, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let fx, fy, fz, gx, gy, gz, q;
    fx = 4.503 * cos(v);
    fy = 3.266 * sin(v);
    fz = 0;

    gx = s * 3.006 * cos(v);
    gy = s * 2.266 * sin(v);
    gz = - s * 3.006 * cos(v);

    q = 0.251 * pow(u, 3) + 0.389 * pow(u, 2) - 1.64 * u + 1;


    let x = u * fx + q * gx;
    let y = u * fy + q * gy;
    let z = u * fz + q * gz;

    target.set(x, y, z);
}

function bowtieSurface(u, v, target, uComponent = 6.2831, vComponent = 3.1415) {
    const umin = -PI;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x, y, z;
    x = sin(u) / (pow(2, 0.5) + sin(v));
    y = sin(u) / (pow(2, 0.5) + cos(v));
    z = cos(u) / (1 + pow(2, 0.5))

    target.set(x, y, z);
}

function breatherSurface(u, v, target, a = 0.5, uMin = -13.2, uMax = 13.2, vMin = -34.2, vMax = 34.2) {

    u = uMin + (uMax - uMin) * u;
    v = vMin + (vMax - vMin) * v;

    let r = 1 - a ** 2;
    let w = Math.sqrt(r);
    let d = a * (Math.pow(w * Math.cosh(a * u), 2) + Math.pow(a * Math.sin(w * v), 2));

    let x = -u + (2 * r * Math.cosh(a * u) * Math.sinh(a * u) / d);
    let y = 2 * w * Math.cosh(a * u) * (-(w * Math.cos(v) * Math.cos(w * v)) - (Math.sin(v) * Math.sin(w * v))) / d;
    let z = 2 * w * Math.cosh(a * u) * (-(w * Math.sin(v) * Math.cos(w * v)) + (Math.cos(v) * Math.sin(w * v))) / d;

    target.set(x, y, z);
}

function catenoidSurface(u, v, target, c = 1.5, uComponent = 3.1415, vComponent = 2) {
    const umin = -PI;
    const vmin = -2;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x = c * cosh(v / c) * cos(u);
    let y = c * cosh(v / c) * sin(u);
    let z = v;

    target.set(x, y, z);
}


function coneSurface(u, v, target, a = 1, b = 1, c = 1, uComponent = 1, vComponent = 3.1415) {
    u = -1 + (uComponent - (-1)) * u;
    v = -PI + (vComponent - (-PI)) * v;

    let x = u * a * cos(v);
    let y = u * b * sin(v);
    let z = - c * u;
    target.set(x, y, z);
}

function cylinderSurface(u, v, target, h = 1, uComponent = 6.2831, vComponent = 2) {
    u = uComponent * u;
    v = h * v;

    let x = cos(u);
    let y = sin(u);
    let z = (v - 0.5);
    target.set(x, y, z);
}

function dinniSurface(u, v, target, a = 1.5, b = 0.3, uComponent = 12.5663, vComponent = 2) {
    u = uComponent * u;
    v = max(0.01, min(vComponent, v));  // Ensure v is between 0.01 and 2

    let x = a * cos(u) * sin(v);
    let y = a * sin(u) * sin(v);
    let z = a * (cos(v) + log(tan(v / 2))) + b * u;

    target.set(x, y, z);
}

function dupincyclideSurface(u, v, target, a = 0.46, b = 0.5, c = 0.09, d = 0.16, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let h = a - c * cos(u) * cos(v);

    // Check if h is zero or very close to zero
    if (Math.abs(h) < 1e-10) {
        return null; // Return null to indicate an invalid point
    }

    let x, y, z;
    x = (d * (c - a * cos(u) * cos(v)) + b * b * cos(u)) / h;
    y = (b * sin(u) * (a - d * cos(v))) / h;
    z = (b * sin(v) * (c * cos(u) - d)) / h;

    target.set(x, y, z);
    return target; // Return the valid point

}

function eggSurface(u, v, target, a = 0.5, b = 1, c = 1, vComponent = 6.2831) {
    u = a * u;
    v = vComponent * v;

    const x = c * pow(u * (u - a) * (u - b), 0.5) * sin(v);
    const y = u;
    const z = c * pow(u * (u - a) * (u - b), 0.5) * cos(v);

    target.set(x, y, z);
    return target; // Return the valid point
}

function enneperSurface(u, v, target, uComponent = 2, vComponent = 2) {
    const min = -2
    u = min + (uComponent - min) * u;
    v = min + (vComponent - min) * v;

    let x = u - pow(u, 3) / 3 + u * pow(v, 2);
    let y = v - pow(v, 3) / 3 + pow(u, 2) * v;
    let z = pow(u, 2) - pow(v, 2);

    target.set(x, y, z);
}

function projection(w, x, y, z) {
    let a, b, c;

    a = w / (1 - z);
    b = x / (1 - z);
    c = y / (1 - z);

    return { x: a, y: b, z: c }
}

function figure8knotSurface(u, v, target, uComponent = 6.2831, vComponent = 6.2831) {
    u = 2 * PI * u;
    v = 2 * PI * v;

    let x = u - pow(u, 3) + u * pow(v, 2);
    let y = v - pow(v, 3) + pow(u, 2) * v;
    let z = pow(u, 2) - pow(v, 2);

    target.set(x, y, z);
}

function gobletSurface(u, v, target, uComponent = 6.2831, vComponent = 3.1415) {
    u = uComponent * u;
    v = vComponent * v;

    let x = cos(u) * cos(2 * v);
    let y = sin(u) * cos(2 * v);
    let z = -2 * sin(v) + 1;

    target.set(x, y, z);
}

function helicoidSurface(u, v, target, c = 1, uComponent = 2, vComponent = 3.1415) {
    const umin = -2;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x = u * cos(v);
    let y = u * sin(v);
    let z = c * v;

    target.set(x, y, z);
}

function hornSurface(u, v, target, a = 4, b = 2, c = 3.5, uComponent = 1, vComponent = 3.1415) {
    const umin = 0;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x, y, z;
    x = (a + u * cos(v)) * sin(b * PI * u);
    y = (a + u * cos(v)) * cos(b * PI * u) + c * u;
    z = u * sin(v);

    target.set(x, y, z);
}

function hyperhelicoidSurface(u, v, target, a = 2, uComponent = 4, vComponent = 4) {
    const umin = -4;
    const vmin = -4;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    const d = 1 + cosh(u) * cosh(v);

    let x = cos(a * u) * sinh(v) / d;
    let y = sin(a * u) * sinh(v) / d;
    let z = cosh(v) * sinh(u) / d;

    target.set(x, y, z);
}

function hyperoctahedronSurface(u, v, target, uComponent = 1.5707, vComponent = 3.1415) {
    const umin = -PI / 2;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x = pow(cos(u) * cos(v), 3);
    let y = pow(sin(u) * cos(v), 3);
    let z = pow(sin(v), 3);

    target.set(x, y, z);
}

function hyperparaboloidSurface(u, v, target, uComponent = 1, vComponent = 6.2831) {
    const umin = 0;
    const vmin = 0;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x = u * cos(v);
    let y = u * sin(v);
    let z = u * cos(v) * u * sin(v);

    target.set(x, y, z);
}

function hyperspiralSurface(u, v, target, H = 1, uComponent = 25, vComponent = 1) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = cos(u) / u;
    y = H * v - 0.5;
    z = sin(u) / u;

    target.set(x, y, z);
}

function hypertanspiralSurface(u, v, target, uComponent = 1.5, vComponent = 1.5707) {
    const umin = -1.5;
    const vmin = -PI / 2;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    // Compute Cartesian coordinates
    const denominator = cos(10 * u) + cosh(2 * u);
    const x = sinh(2 * u) / denominator;
    const y = v; // v is unchanged
    const z = sin(10 * u) / denominator;


    target.set(x, y, z);
}

function juliaheartSurface(u, v, target, uComponent = 6.2831, vComponent = 3.1415) {
    // Convert parameters to radians
    u *= uComponent;
    v *= vComponent;

    let x, y, z;
    x = (4 * sin(u) - sin(3 * u)) * sin(v);
    y = 2 * cos(v);
    z = 1.2 * (4 * cos(u) - cos(2 * u) - cos(3 * u) / 2) * sin(v);

    return target.set(x, y, z);
}

function kleinbottleSurface(u, v, target, a = 3, b = 7, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    const r = 2.5 * (1 - cos(u) / 2);

    let x, y, z;
    if (0 <= u && u < PI) {
        x = a * cos(u) * (1 + sin(u)) + r * cos(u) * cos(v);
        y = b * sin(u) + r * sin(u) * cos(v);
    } else if (PI <= u && u <= 2 * PI) {
        x = a * cos(u) * (1 + sin(u)) + r * cos(v + PI);
        y = b * sin(u);
    }
    z = r * sin(v);

    target.set(x, y, z);
}

function kleinbottlenordstrandSurface(u, v, target, uComponent = 12.5663, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = cos(u) * (cos(u / 2) * (pow(2, 0.5) + cos(v)) + sin(u / 2) * sin(v) * cos(v));
    y = sin(u) * (cos(u / 2) * (pow(2, 0.5) + cos(v)) + sin(u / 2) * sin(v) * cos(v));
    z = - sin(u / 2) * (pow(2, 0.5) + cos(v) + cos(u / 2) * sin(v) * cos(v));

    target.set(x, y, z);
}

function knotFigure8Surface(u, v, target, e = 0.3, h = 0.4, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = sin((3 * u)) * ((e * sin((4 * u))) + 1) / ((e * sin((4 * u))) * (1.5 + sin(1.5 * v) / 4) - (1.5 + sin(1.5 * v) / 4));
    y = cos((3 * u)) * ((e * sin((4 * u))) + 1) / ((e * sin((4 * u))) * (1.5 + sin(1.5 * v) / 4) - (1.5 + sin(1.5 * v) / 4));
    z = (-2 * h * sin((2 * u)) * ((e * sin((4 * u))) + 1) / ((e * sin((4 * u))) - 1)) + 0.1 * cos(1.5 * v);

    target.set(x, y, z);
}

function knotsTorusSeifertSurface(u, v, target, p1 = 2, q1 = 2, R1 = 1, r1 = 1, p2 = 2, q2 = 3, R2 = 1.5, r2 = 0.4, uComponent = 6.2831, vComponent = 1) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = ((1 - v) * (R1 + r1 * cos(q1 * u)) + v * (R2 + r2 * cos(q2 * u))) * cos((1 - v) * p1 * u + v * p2 * u);
    y = ((1 - v) * (R1 + r1 * cos(q1 * u)) + v * (R2 + r2 * cos(q2 * u))) * sin((1 - v) * p1 * u + v * p2 * u);
    z = (1 - v) * r1 * sin(q1 * u) + v * r2 * sin(q2 * u);

    target.set(x, y, z);
}

function knotTorusSurface(u, v, target, p = 7, q = 3, R1 = 7, R2 = 2.5, r = 1, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = (R1 + R2 * cos(p * u) + r * cos(v)) * cos(q * u);
    y = (R1 + R2 * cos(p * u) + r * cos(v)) * sin(q * u);
    z = r * sin(v) + R2 * sin(p * u);

    target.set(x, y, z);
}

function knotTranguloidTrefoilSurface(u, v, target, uComponent = 3.1415, vComponent = 3.1415) {
    const umin = -PI;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x, y, z;

    x = 2 * sin(3 * u) / (2 + cos(v));
    y = 2 * (sin(u) + 2 * sin(2 * u)) / (2 + cos(v + 2 * PI / 3));
    z = (cos(u) - 2 * cos(2 * u)) * (2 + cos(v)) * (2 + cos(v + 2 * PI / 3)) / 4;

    target.set(x, y, z);
}

function knotTrefoilSurface(u, v, target, uComponent = 12.5663, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = cos(u) * cos(v) + 3 * cos(u) * (1.5 + sin(1.5 * u) / 2);
    y = sin(u) * cos(v) + 3 * sin(u) * (1.5 + sin(1.5 * u) / 2);
    z = sin(v) + 2 * cos(1.5 * u);

    target.set(x, y, z);
}

function lawsonbottleSurface(u, v, target, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z, w;
    w = (sin(u) * sin(v) + sin(u / 2) * cos(v)) / pow(2, 0.5);

    x = (sin(u) * sin(v) - sin(u / 2) * cos(v)) / (pow(2, 0.5) * (1 + w));
    y = cos(u) * sin(v) / (1 + w);
    z = cos(u / 2) * cos(v) / (1 + w);

    target.set(x, y, z);
}

function maederowlSurface(u, v, target, uComponent = 12.5663, vComponent = 1) {
    u = uComponent * u;
    v = max(0.001, min(vComponent, v));

    let x = v * cos(u) - 0.5 * (v ** 2) * cos(2 * u);
    let y = - v * sin(u) - 0.5 * (v ** 2) * sin(2 * u);
    let z = 4 * exp(1.5 * log(v)) * cos(3 * u / 2) / 3
    target.set(x, y, z);
}

function mobiusSurface(u, v, target, R = 2, uComponent = 1, vComponent = 6.2831) {
    const umin = -1;
    u = umin + (uComponent - umin) * u;
    v = vComponent * v;

    let x = (R + u * cos(v / 2)) * cos(v);
    let y = (R + u * cos(v / 2)) * sin(v);
    let z = u * sin(v / 2);
    target.set(x, y, z);
}

function morinSurface(u, v, target, n = 3, k = 1, uComponent = 3.1415, vComponent = 3.1415) {
    u = uComponent * u;
    if (n % 2 === 0) {
        v = 2 * vComponent * v;
    } else v = vComponent * v;

    let sqrt2 = pow(2, 0.5);
    let K = cos(u) / (sqrt2 - k * sin(2 * u) * sin(n * v));

    let x, y, z;
    x = K * (2 / (n - 1) * cos(u) * cos((n - 1) * v) + sqrt2 * sin(u) * cos(v));
    y = K * (2 / (n - 1) * cos(u) * sin((n - 1) * v) - sqrt2 * sin(u) * sin(v));
    z = K * cos(u);

    target.set(x, y, z);
}

function paraboloidSurface(u, v, target, a = 1, h = 1, uComponent = 1, vComponent = 6.2831) {
    const umin = 0;
    const vmin = 0;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;


    let x = a * pow(u / h, 0.5) * cos(v);
    let y = a * pow(u / h, 0.5) * sin(v);
    let z = u;

    target.set(x, y, z);
}

function pillowSurface(u, v, target, a = 0.6, uComponent = 3.1416, vComponent = 3.1415) {
    const umin = 0;
    const vmin = -PI;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;


    let x = cos(u);
    let y = cos(v);
    let z = a * sin(u) * sin(v);

    target.set(x, y, z);
}

function planeSurface(u, v, target, uComponent = 1.5, vComponent = 1.5) {
    const umin = -1.5;
    const vmin = -1.5;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;


    let x = (1.5 * u - 1.0 * v + 1.0);
    let y = (1.0 * u + 1.0 * v + 0.5);
    let z = (1.0 * u + 1.0 * v + 1.0);

    target.set(x, y, z);
}

/* 
 * Rose-shaped by Paul Nylander
 * https://nylander.wordpress.com/2006/06/21/rose-shaped-parametric-surface/
 */
function roseSurface(u, v, target, uMin = 0) {
    u = 1 * u;
    v = uMin + (20 * PI - (uMin)) * v;

    let alpha, s, c, beta, r, x, y, z;
    alpha = 1 - 0.5 * pow(5 / 4 * pow(1 - ((3.6 * v) % (2 * PI)) / PI, 2) - 0.25, 2);
    s = sin(PI / 2 * exp(- v / (8 * PI)));
    c = cos(PI / 2 * exp(- v / (8 * PI)));
    beta = 1.95653 * pow(u, 2) * pow(1.27689 * u - 1, 2);
    r = s * (u + beta * c);

    x = r * alpha * sin(v);
    y = r * alpha * cos(v);
    z = u * c - beta * s * s;

    target.set(x, y, z);
}

function seashellSurface(u, v, target, a = 13, uComponent = 20, vComponent = 6.2831) {
    u *= uComponent;
    v *= vComponent;

    const f = exp(u / (6 * PI)) - 1;
    let x = (2 * f * cos(u) * cos(v / 2) * cos(v / 2));
    let y = (2 * (-f) * sin(u) * cos(v / 2) * cos(v / 2));
    let z = (4 - exp(u / a) - sin(v) + exp(u / (6 * PI)) * sin(v));
    target.set(x, y, z);
}

function sinecosineSurface(u, v, target, type = 'sine', uComponent = 6.2831, vComponent = 6.2831) {
    u *= uComponent;
    v *= vComponent;

    let x, y, z;
    if (type === 'sine') {
        x = sin(u);
        y = sin(v);
        z = sin(u + v);
    } else {
        x = cos(u);
        y = cos(v);
        z = cos(u + v);
    }

    target.set(x, y, z);
}

function sinecubeSurface(u, v, target, uComponent = 3.1415, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = sin(u) * sin(v);
    y = cos(u) * sin(v);
    z = cos(u) * cos(v);

    target.set(x, y, z);
}

function sinecosinewavesSurface(u, v, target, type = 'sine', a = 1, b = 2, uComponent = 15, vComponent = 15) {
    const umin = -15;
    const vmin = -15;
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x, y, z;
    if (type === 'sine') {
        x = u;
        y = a * sin(b * pow(u ** 2 + v ** 2, 0.5));
        z = v;
    } else {
        x = u;
        y = a * cos(b * pow(u ** 2 + v ** 2, 0.5));
        z = v;
    }

    target.set(x, y, z);
}

function sinusoidalconeSurface(u, v, target, k = 0.4, n = 5, uComponent = 10, vComponent = 3.1415) {
    let umin = -10;
    let vmin;
    if (Number.isInteger(n)) {
        vmin = -PI;
    } else {
        vmin = -2 * PI
    }
    u = umin + (uComponent - umin) * u;
    v = vmin + (vComponent - vmin) * v;

    let x, y, z;
    x = u * cos(v);
    y = u * sin(v);
    z = k * u * cos(n * v);

    target.set(x, y, z);
}

function snailsmusselsSurface(u, v, target, a = 1.25, b = 1.25, c = 1.0, h = 3.5, k = 0.0, w = 0.12, R = 1, uMin = -40, uMax = -1, vComponent = 6.2831) {

    u = uMin + (uMax - uMin) * u;
    v = 2 * PI * v;

    let x = (h + a * cos(v)) * exp(w * u) * cos(c * u);
    let y = R * (h + a * cos(v)) * exp(w * u) * sin(c * u);
    let z = (k + b * sin(v)) * exp(w * u);

    target.set(x, y, z);
}

function sphereSurface(u, v, target, r = 1, uComponent = 6.2831, vComponent = 3.1415) {

    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = r * cos(u) * sin(v);
    y = r * sin(u) * sin(v);
    z = r * cos(v);

    target.set(x, y, z);
}

function spiralwavesSurface(u, v, target, a = 0.75, b = 3, c = 1, uComponent = 6.2831, vComponent = 20) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = v * cos(u);
    y = a * cos(b * u + c * v);
    z = v * sin(u);

    target.set(x, y, z);
}

function torusSurface(u, v, target, r = 2, R = 2, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = cos(u) * (r / 2 * cos(v) + R);
    let y = sin(u) * (r / 2 * cos(v) + R);
    let z = r / 2 * sin(v);

    target.set(x, y, z);
}

function torus8figureSurface(u, v, target, c = 2, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = cos(u) * (c + sin(v) * cos(u) - sin(2 * v) * sin(u) / 2);
    let y = sin(u) * sin(v) + cos(u) * sin(2 * v) / 2
    let z = sin(u) * (c + sin(v) * cos(u) - sin(2 * v) * sin(u) / 2);

    target.set(x, y, z);
}

function torusantisymmetricSurface(u, v, target, a = 1, r = 0.4, R = 2, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = (R + r * cos(v) * (a + sin(u))) * cos(u);
    let y = (R + r * cos(v) * (a + sin(u))) * sin(u);
    let z = r * sin(v) * (a + sin(u));

    target.set(x, y, z);
}

function torusBianchiPinkallSurface(u, v, target, n = 10, a = 0.4, b = 0.2, uComponent = 6.2831, vComponent = 3.1415) {
    u = uComponent * u;
    v = vComponent * v;

    var gamma = a + b * Math.sin(2 * n * v);

    let x, y, z, w, r;
    x = Math.cos(u + v) * Math.cos(gamma);
    y = Math.sin(u + v) * Math.cos(gamma);
    z = Math.cos(u - v) * Math.sin(gamma);
    w = Math.sin(u - v) * Math.sin(gamma);

    r = Math.acos(w) / Math.PI / Math.sqrt(1 - w ** 2);

    target.set(x * r, y * r, z * r);
}

function torusbraidedSurface(u, v, target, a = 0.5, n = 1.25, r = 0.15, R = 1.7, uComponent = 25.1327, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = r * cos(v) * cos(u) + R * cos(u) * (1 + a * cos(n * u));
    let y = 2.5 * (r * sin(v) + a * sin(n * u));
    let z = r * cos(v) * sin(u) + R * sin(u) * (1 + a * cos(n * u));

    target.set(x, y, z);
}

function torusknotSurface(u, v, target, size = 0.12, translate = 2.9) {
    u = 4 * PI * u;
    v = 2 * PI * v;

    let NN = 1.5;
    let AA = 0.6;
    let w = 3 * cos(u) / 4;

    let XX, YY, ZZ;
    XX = -size * (cos(u) * cos(v) + 3 * cos(u) * (1.5 + sin(1.5 * u) / 2)) + translate;
    YY = size * (sin(u) * cos(v) + 3 * sin(u) * (1.5 + sin(1.5 * u) / 2));
    ZZ = size * (sin(v) + 2 * cos(1.5 * u));
    let norm2 = pow(XX, 2) + pow(YY, 2) + pow(ZZ, 2);

    let x = 0.5 * XX / norm2;
    let y = 0.5 * YY / norm2;
    let z = 0.5 * ZZ / norm2;

    target.set(x, y, z);
}

function torustwisted8Surface(u, v, target, r = 1, R = 2, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = (R + r * (cos(u / 2) * sin(v) - sin(u / 2) * sin(2 * v))) * cos(u);
    let y = (R + r * (cos(u / 2) * sin(v) - sin(u / 2) * sin(2 * v))) * sin(u);
    let z = r * (sin(u / 2) * sin(v) + cos(u / 2) * sin(2 * v));

    target.set(x, y, z);
}

function torustwistedSurface(u, v, target, n = 14, t = 3, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let R = pow(pow(cos(v), n) + pow(sin(v), n), -1 / n);

    let x = (4 + R * cos(t * u + v)) * cos(u);
    let y = (4 + R * cos(t * u + v)) * sin(u);
    let z = R * sin(t * u + v);

    target.set(x, y, z);
}

function torusumbilicSurface(u, v, target, uComponent = 6.2831, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let x = sin(u) * (7 + cos(u / 3 - 2 * v) + 2 * cos(u / 3 + v));
    let y = cos(u) * (7 + cos(u / 3 - 2 * v) + 2 * cos(u / 3 + v));
    let z = sin(u / 3 - 2 * v) + 2 * sin(u / 3 + v);

    target.set(x, y, z);
}

// Not finished
function trefoilknotSurface(u, v, target, uComponent = 2 * PI, vComponent = 2 * PI, size = 1, tx = 0, ty = 0, tz = 0) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = -size * (cos(u) * cos(v) + 3 * cos(u) * (1.5 + sin(1.5 * u) / 2)) + tx;
    y = size * (sin(u) * cos(v) + 3 * sin(u) * (1.5 + sin(1.5 * u) / 2)) + ty;
    z = size * (sin(v) + 2 * cos(1.5 * u)) + tz;

    target.set(x, y, z);
} 


function trashcanSurface(u, v, target, a = 1, b = 1, uComponent = 6.2831, vComponent = 2) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = (b + v) * cos(u);
    y = v * sin(u);
    z = a * v ** 2 - 2;

    target.set(x, y, z);
}

function umbrellaSurface(u, v, target, R = 1, n = 8, h = 0.6, uComponent = 1, vComponent = 6.2831) {
    u = uComponent * u;
    v = vComponent * v;

    let r = R / n;
    let x, y, z;
    x = pow(u, 1 / 3) * ((R - r) * cos(v) + r * cos((n - 1) * v));
    y = pow(u, 1 / 3) * ((R - r) * sin(v) - r * sin((n - 1) * v));
    z = h * (1 - u);

    target.set(x, y, z);
}

function waveBallSurface(u, v, target, uComponent = 14, vComponent = 4.71238) {
    u = uComponent * u;
    v = vComponent * v;

    let x, y, z;
    x = u * cos(cos(u)) * cos(v);
    y = u * cos(cos(u)) * sin(v);
    z = u * sin(cos(u));

    target.set(x, y, z);
}

// Wrap a surface function into a geometry factory. Each surface declares its
// own parameter defaults in its signature, so no extra arguments are needed.
// `slices` subdivides u (along the axis) and `stacks` subdivides v (around it);
// both scale with the detail value `d` (a power of two).
function makeSurface(surface, slices = 1, stacks = 2) {
    return (d) => {
        const fn = (u, v, target) => surface(u, v, target);
        return new ParametricGeometry(
            fn,
            Math.max(3, d * slices),
            Math.max(3, d * stacks)
        );
    };
}

// Surface function for each registry key, in dropdown order.
const SURFACES = {
    apple: appleSurface,
    bernat: bernatSurface,
    bowtie: bowtieSurface,
    breather: breatherSurface,
    catenoid: catenoidSurface,
    cone: coneSurface,
    cylinder: cylinderSurface,
    dinni: dinniSurface,
    dupincyclide: dupincyclideSurface,
    egg: eggSurface,
    enneper: enneperSurface,
    // figure8knot: figure8knotSurface,
    goblet: gobletSurface,
    helicoid: helicoidSurface,
    horn: hornSurface,
    hyperhelicoid: hyperhelicoidSurface,
    hyperoctahedron: hyperoctahedronSurface,
    hyperparaboloid: hyperparaboloidSurface,
    // hyperspiral: hyperspiralSurface,
    hypertanspiral: hypertanspiralSurface,
    juliaheart: juliaheartSurface,
    kleinbottle: kleinbottleSurface,
    kleinbottlenordstrand: kleinbottlenordstrandSurface,
    knotFigure8: knotFigure8Surface,
    knotsTorusSeifert: knotsTorusSeifertSurface,
    knotTorus: knotTorusSurface,
    knotTranguloidTrefoil: knotTranguloidTrefoilSurface,
    knotTrefoil: knotTrefoilSurface,
    lawsonbottle: lawsonbottleSurface,
    maederowl: maederowlSurface,
    mobius: mobiusSurface,
    morin: morinSurface,
    paraboloid: paraboloidSurface,
    pillow: pillowSurface,
    plane: planeSurface,
    rose: roseSurface,
    seashell: seashellSurface,
    sinecosine: sinecosineSurface,
    sinecube: sinecubeSurface,
    sinecosinewaves: sinecosinewavesSurface,
    sinusoidalcone: sinusoidalconeSurface,
    snailsmussels: snailsmusselsSurface,
    sphere: sphereSurface,
    spiralwaves: spiralwavesSurface,
    torus: torusSurface,
    torus8figure: torus8figureSurface,
    torusantisymmetric: torusantisymmetricSurface,
    torusBianchiPinkall: torusBianchiPinkallSurface,
    torusbraided: torusbraidedSurface,
    torusknot: torusknotSurface,
    torustwisted8: torustwisted8Surface,
    torustwisted: torustwistedSurface,
    torusumbilic: torusumbilicSurface,
    trefoilknot: trefoilknotSurface,
    trashcan: trashcanSurface,
    umbrella: umbrellaSurface,
    waveBall: waveBallSurface
};

// Registry of parametric surfaces. Each entry builds a geometry at the given
// resolution (`d` is the detail value, a power of two). Parameter defaults are
// declared inline in each surface function's signature.
export const PARAMETRIC_GEOMETRIES = Object.fromEntries(
    Object.entries(SURFACES).map(([key, surface]) => [key, makeSurface(surface)])
);

// Build a parametric geometry by name, or return null if the name is unknown.
export function createParametricGeometry(type, detail = 128) {
    const factory = PARAMETRIC_GEOMETRIES[type];
    if (!factory) return null;
    const d = Math.max(1, Math.round(detail));
    return factory(d);
}
