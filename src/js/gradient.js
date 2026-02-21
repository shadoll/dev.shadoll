/**
 * gradient.js
 * Controls the animated gradient background.
 * Owns all gradient state and applies it via CSS custom properties on <html>.
 */

import { deriveGradientPair } from '../utils/colorUtils.js';
import { DEFAULTS }           from './constants.js';

/** Root element — CSS custom properties live here */
const ROOT = document.documentElement;

/**
 * Speed → animation duration mapping.
 * speed 1  →  ~32 s  (very slow, meditative)
 * speed 5  →  ~19 s  (default, comfortable)
 * speed 10 →  ~3.5 s (fast, energetic)
 *
 * @param {number} speed  integer 1–10
 * @returns {number}  duration in seconds
 */
function speedToDuration(speed) {
  return Math.round(35 - speed * 3.15);
}

export class GradientController {
  /** @type {string} */    #color    = DEFAULTS.GRADIENT_COLOR;
  /** @type {number} */    #speed    = DEFAULTS.GRADIENT_SPEED;
  /** @type {boolean} */   #rotating = DEFAULTS.GRADIENT_ROTATION;

  /**
   * Initialise gradient with a base colour.
   * Call once on app start.
   *
   * @param {string} hex
   */
  init(hex) {
    this.setColor(hex);
    this.setSpeed(this.#speed);
    this.toggleRotation(this.#rotating);
  }

  /**
   * Set the base gradient colour.
   * Automatically derives the companion colour and updates the CSS vars.
   *
   * @param {string} hex
   */
  setColor(hex) {
    this.#color = hex;
    const [c1, c2] = deriveGradientPair(hex);
    ROOT.style.setProperty('--color-1', c1);
    ROOT.style.setProperty('--color-2', c2);
  }

  /**
   * Set animation speed (1 = slowest, 10 = fastest).
   * Updates --anim-duration on the root element.
   *
   * @param {number} speed  integer 1–10
   */
  setSpeed(speed) {
    this.#speed = speed;
    ROOT.style.setProperty('--anim-duration', `${speedToDuration(speed)}s`);
  }

  /**
   * Enable or disable the clockwise rotation animation.
   * Toggles the `.gradient-rotating` class on <body>.
   *
   * @param {boolean} enabled
   */
  toggleRotation(enabled) {
    this.#rotating = enabled;
    document.body.classList.toggle('gradient-rotating', enabled);
  }

  // ── Read-only state accessors ──────────────────────────────
  get color()    { return this.#color;    }
  get speed()    { return this.#speed;    }
  get rotating() { return this.#rotating; }
}
