/**
 * colorUtils.js
 * Pure colour-math utilities used by the gradient system.
 * No DOM dependencies — safe to import anywhere.
 */

/**
 * Convert a CSS hex colour string to HSL components.
 *
 * @param {string} hex  e.g. '#2d9e6b'
 * @returns {{ h: number, s: number, l: number }}
 *   h ∈ [0, 360), s ∈ [0, 100], l ∈ [0, 100]
 */
export function hexToHSL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max   = Math.max(r, g, b);
  const min   = Math.min(r, g, b);
  const delta = max - min;

  const l = (max + min) / 2;
  let   h = 0;
  let   s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / delta + 2) / 6;                break;
      case b: h = ((r - g) / delta + 4) / 6;                break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL components to a CSS hex colour string.
 *
 * @param {number} h  hue        (0–360, wraps automatically)
 * @param {number} s  saturation (0–100, clamped)
 * @param {number} l  lightness  (0–100, clamped)
 * @returns {string}  e.g. '#1d7c51'
 */
export function hslToHex(h, s, l) {
  // Normalise inputs
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));

  const sn = s / 100;
  const ln = l / 100;

  /** @param {number} p @param {number} q @param {number} t */
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r, g, b;
  if (sn === 0) {
    r = g = b = ln; // achromatic
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1 / 3);
  }

  return '#' + [r, g, b]
    .map(x => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a harmonious two-colour gradient pair from a single base colour.
 *
 * Strategy — "same palette, analogous shift":
 *   • Color 1: deepen the base (↑ saturation, ↓ lightness) for a rich anchor
 *   • Color 2: shift hue +35° into the adjacent palette zone, lighten it
 *              so it reads as a natural sibling, not a contrasting accent
 *
 * Examples:
 *   green  (#2d9e6b) → deep forest green + soft teal
 *   blue   (#2d6b9e) → deep navy        + sky periwinkle
 *   orange (#e07030) → burnt sienna     + warm amber
 *
 * @param {string} baseHex
 * @returns {[string, string]}  [color1, color2]
 */
export function deriveGradientPair(baseHex) {
  const { h, s, l } = hexToHSL(baseHex);

  // Color 1 — darker, richer anchor
  const c1 = hslToHex(
    h,
    Math.min(s * 1.15, 100),
    Math.max(l * 0.62,   8),
  );

  // Color 2 — analogous hue shift, lifted lightness
  const c2 = hslToHex(
    (h + 35) % 360,
    s * 0.88,
    Math.min(l * 1.48, 78),
  );

  return [c1, c2];
}
