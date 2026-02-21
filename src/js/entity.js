/**
 * entity.js
 * A single icon living on screen — owns its own physics state and DOM node.
 *
 * Physics model:
 *  - Constant velocity with small random "drift kicks" each frame for
 *    organic, chaotic-feeling motion (not perfectly straight lines).
 *  - Edge detection: velocity component is reflected (±abs) on contact,
 *    ensuring the bounce always sends the icon back into the viewport.
 *
 * DOM structure:
 *  <div class="icon-entity">          ← position via JS transform
 *    <div class="icon-entity__body">  ← scale animation via CSS transition
 *      <svg>…</svg>                   ← injected SVG, sized by CSS
 *    </div>
 *  </div>
 *
 * Separating the position element from the scale element avoids any
 * conflict between JS-driven transform updates and CSS transitions.
 */

import { loadIcon }  from './iconLoader.js';
import { DEFAULTS }  from './constants.js';

export class Entity {
  // ── Physics ──────────────────────────────────────────────
  /** @type {number} */ x;
  /** @type {number} */ y;
  /** @type {number} */ vx;
  /** @type {number} */ vy;

  // ── Identity ─────────────────────────────────────────────
  /** @type {string} */  name;
  /** @type {string} */  type;
  /** @type {string} */  color;
  /** @type {boolean} */ alive = true;

  // ── DOM ───────────────────────────────────────────────────
  /** @type {HTMLElement|null} */ el     = null;
  /** @type {HTMLElement|null} */ bodyEl = null;

  /**
   * @param {{ name: string, type: string, color: string,
   *           x: number, y: number, vx: number, vy: number }} config
   */
  constructor({ name, type, color, x, y, vx, vy }) {
    this.name  = name;
    this.type  = type;
    this.color = color;
    this.x = x;  this.y = y;
    this.vx = vx; this.vy = vy;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Build the DOM element, fetch the SVG, attach to container.
   * Triggers the dot → icon appear animation after mount.
   *
   * @param {HTMLElement} container
   */
  async mount(container) {
    // Outer div: physics position handle
    this.el = document.createElement('div');
    this.el.className = 'icon-entity';

    // Inner div: CSS scale transition target
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'icon-entity__body';
    this.bodyEl.dataset.state = 'spawning';

    // Inject SVG
    try {
      this.bodyEl.innerHTML = await loadIcon(this.name);
    } catch (err) {
      console.warn(`[Entity] Could not load icon "${this.name}":`, err);
      this.alive = false;
      return;
    }

    this.el.appendChild(this.bodyEl);
    container.appendChild(this.el);

    // Set initial colour and position
    this.el.style.color = this.color;
    this._applyTransform();

    // Two rAF ticks ensure the browser has painted the spawning state
    // before adding the 'alive' class, guaranteeing the CSS transition fires.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.bodyEl) this.bodyEl.dataset.state = 'alive';
      });
    });
  }

  /**
   * Advance physics by one frame.
   * Call this inside your rAF loop.
   *
   * @param {number} speedMultiplier  scales BASE_SPEED (e.g. slider / 5)
   */
  update(speedMultiplier) {
    if (!this.el || !this.alive) return;

    // Move
    this.x += this.vx * speedMultiplier;
    this.y += this.vy * speedMultiplier;

    // Bounce off viewport edges
    const { ICON_HALF: h } = DEFAULTS;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (this.x - h <= 0)   { this.x = h;      this.vx =  Math.abs(this.vx); }
    if (this.x + h >= vw)  { this.x = vw - h; this.vx = -Math.abs(this.vx); }
    if (this.y - h <= 0)   { this.y = h;      this.vy =  Math.abs(this.vy); }
    if (this.y + h >= vh)  { this.y = vh - h; this.vy = -Math.abs(this.vy); }

    // Chaotic drift: small random velocity kick, applied with low probability
    if (Math.random() < DEFAULTS.DRIFT_CHANCE) {
      this.vx += (Math.random() - 0.5) * DEFAULTS.DRIFT_MAGNITUDE;
      this.vy += (Math.random() - 0.5) * DEFAULTS.DRIFT_MAGNITUDE;

      // Clamp to max speed so drift can't accelerate indefinitely
      const spd = Math.hypot(this.vx, this.vy);
      const max = DEFAULTS.BASE_SPEED * DEFAULTS.MAX_SPEED_FACTOR;
      if (spd > max) {
        this.vx = (this.vx / spd) * max;
        this.vy = (this.vy / spd) * max;
      }
    }

    this._applyTransform();
  }

  /** Remove this entity from the DOM and mark it as dead. */
  destroy() {
    this.alive = false;
    this.el?.remove();
    this.el     = null;
    this.bodyEl = null;
  }

  // ── Private ────────────────────────────────────────────────

  /**
   * Write the current (x, y) position to the DOM via transform.
   * Using transform keeps this on the compositor thread (no layout).
   * We offset by ICON_HALF so (x, y) represents the icon's centre point.
   */
  _applyTransform() {
    if (!this.el) return;
    const { ICON_HALF: h } = DEFAULTS;
    this.el.style.transform = `translate(${this.x - h}px, ${this.y - h}px)`;
  }
}
