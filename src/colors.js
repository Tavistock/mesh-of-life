// Color utilities for hex parsing, lerping, and age gradients

export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    return [
        (bigint >> 16) & 255,
        (bigint >> 8) & 255,
        bigint & 255
    ];
}

export function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

export function lerpColor(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}

export function colorForAge(age, maxAge, baseColor, endColor) {
    if (age <= 0) return [0, 0, 0]; // dead = black (will be overridden by bg)
    const t = Math.min(age / maxAge, 1);
    return lerpColor(baseColor, endColor, t);
}

export function applyColorToAttribute(colors, faceIndex, color) {
    const i = faceIndex * 9; // 3 vertices * 3 components
    colors[i] = colors[i + 3] = colors[i + 6] = color[0] / 255;
    colors[i + 1] = colors[i + 4] = colors[i + 7] = color[1] / 255;
    colors[i + 2] = colors[i + 5] = colors[i + 8] = color[2] / 255;
}

export function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// Generate a harmonious random palette: dark background, muted dead cells,
// a vivid alive color, and a contrasting age-gradient end color.
export function randomPalette() {
    const hue = Math.random() * 360;
    // Age color is offset around the wheel for contrast
    const ageHue = hue + 120 + Math.random() * 120;

    return {
        bg: hslToHex(hue, 20 + Math.random() * 25, 4 + Math.random() * 6),
        dead: hslToHex(hue, 15 + Math.random() * 20, 12 + Math.random() * 10),
        cell: hslToHex(hue, 70 + Math.random() * 30, 50 + Math.random() * 15),
        age: hslToHex(ageHue, 80 + Math.random() * 20, 55 + Math.random() * 15)
    };
}