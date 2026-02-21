/**
 * entity.js
 * A single icon living on screen — owns its own physics state and DOM node.
 *
 * Physics model:
 *  - Constant velocity with small random "drift kicks" each frame for
 *    organic, chaotic-feeling motion (not perfectly straight lines).
 *  - Edge detection: velocity component is reflected (±abs) on contact,
 *    ensuring the bounce always sends the icon back into the viewport.
 *  - Rotation: each entity spawns with a fixed random orientation (0–360°).
 *
 * Collision response (handled by EvolutionController):
 *  - onHit()       — colour-shifts the icon via hue-rotate filter + flash anim.
 *  - infectWith()  — async; collapses the icon, swaps SVG, re-expands as new form.
 *  - die()         — slow death: light-red flash → dark-grayscale fade → destroy.
 *
 * DOM structure:
 *  <div class="icon-entity">          ← position + rotation via JS transform
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
  /** Fixed spawn orientation in degrees (0–360) */
  /** @type {number} */ rotation;

  // ── Identity ─────────────────────────────────────────────
  /** The current icon name — changes on infection. */
  /** @type {string} */  entityKey;
  /** @type {string} */  name;
  /** @type {string} */  type;
  /** @type {string} */  color;
  /** @type {boolean} */ alive = true;

  // ── Visual state ──────────────────────────────────────────
  /** Accumulated hue-rotate offset (degrees). Increases on each hit. */
  /** @type {number} */ hueShift = 0;

  // ── DOM ───────────────────────────────────────────────────
  /** @type {HTMLElement|null} */ el     = null;
  /** @type {HTMLElement|null} */ bodyEl = null;

  // ── Private ───────────────────────────────────────────────
  /** @type {boolean} */ #infected = false;
  /** @type {boolean} */ #dying    = false;

  /**
   * @param {{ name: string, type: string, color: string,
   *           x: number, y: number, vx: number, vy: number,
   *           rotation?: number }} config
   */
  constructor({ name, type, color, x, y, vx, vy, rotation }) {
    this.name      = name;
    this.entityKey = name;
    this.type      = type;
    this.color     = color;
    this.x  = x;   this.y  = y;
    this.vx = vx;  this.vy = vy;
    this.rotation = rotation !== undefined ? rotation : Math.random() * 360;
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
    if (!this.el || !this.alive || this.#dying) return;

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

  /**
   * React to a physical collision with another entity.
   * Shifts the hue-rotate filter by a random step and plays a brief
   * scale-punch animation to signal the impact.
   */
  onHit() {
    if (!this.bodyEl || !this.alive || this.#dying) return;
    const shift = DEFAULTS.HIT_HUE_MIN + Math.floor(Math.random() * DEFAULTS.HIT_HUE_RANGE);
    this.hueShift = (this.hueShift + shift) % 360;
    this.bodyEl.style.filter =
      `hue-rotate(${this.hueShift}deg) drop-shadow(0 1px 6px rgba(0,0,0,0.35))`;
    // Flash animation — class removed after its duration
    this.bodyEl.classList.remove('icon-entity__body--hit'); // reset if mid-anim
    void this.bodyEl.offsetWidth;                            // force reflow
    this.bodyEl.classList.add('icon-entity__body--hit');
    setTimeout(() => this.bodyEl?.classList.remove('icon-entity__body--hit'), 350);
  }

  /** True while the entity is in its slow-death sequence. */
  get dying() { return this.#dying; }

  /**
   * Begin a slow death sequence triggered by a virus contact.
   *
   * Phase 1 (immediate): entity stops moving, colour changes to light red.
   * Phase 2 (+KILL_FADE_MS): grayscale-dark CSS class fades the icon out.
   * Phase 3 (+KILL_DEATH_DURATION): entity is removed from the DOM.
   */
  die() {
    if (this.#dying || !this.bodyEl || !this.alive) return;
    this.#dying = true;

    // Freeze movement
    this.vx = 0;
    this.vy = 0;

    // Phase 1: light-red flash — clear any hit filter so CSS class takes over
    this.el.style.color = DEFAULTS.KILL_FADE_COLOR;
    this.hueShift = 0;
    this.bodyEl.style.filter = '';
    this.bodyEl.classList.remove('icon-entity__body--hit');

    // Phase 2: grayscale dark fade
    setTimeout(() => {
      if (this.bodyEl) this.bodyEl.classList.add('icon-entity__body--dying');
    }, DEFAULTS.KILL_FADE_MS);

    // Phase 3: remove from DOM — EvolutionController cleans up entity array each tick
    setTimeout(() => this.destroy(), DEFAULTS.KILL_DEATH_DURATION);
  }

  /**
   * Transform this entity into another icon (infection mechanic).
   * Pre-fetches the new SVG, collapses the current icon, swaps content,
   * then expands the new icon using the standard appear animation.
   *
   * @param {string} iconName  Key of the SVG to transform into (e.g. 'virus-filled')
   * @param {string} color     CSS colour string for the new icon tint
   */
  /**
   * @param {string} iconName
   * @param {string} color
   * @param {{ force?: boolean }} [opts]  force:true bypasses the #infected guard (used for bug cure)
   */
  async infectWith(iconName, color, { force = false } = {}) {
    if (this.#dying || !this.bodyEl || !this.alive) return;
    if (!force && this.#infected) return;
    this.#infected = true;
    this.entityKey = iconName;

    try {
      // Pre-fetch the new SVG (likely cached) before touching the DOM
      const svg = await loadIcon(iconName);
      if (!this.bodyEl || !this.alive) return;

      // Collapse current icon — CSS transition: scale 0.6s spring
      this.bodyEl.dataset.state = 'spawning';

      // Wait ~300 ms — at this point the entity is visibly shrinking.
      // Swap the SVG content while it's small and hard to see.
      await new Promise(r => setTimeout(r, 300));
      if (!this.bodyEl || !this.alive) return;

      this.bodyEl.innerHTML = svg;
      this.color = color;
      this.el.style.color = color;
      this.hueShift = 0;
      this.bodyEl.style.filter = '';  // clear any hit hue-rotate

      // Two rAF ticks guarantee the 'spawning' state was painted
      // before switching to 'alive', so the expand transition fires.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.bodyEl) this.bodyEl.dataset.state = 'alive';
        });
      });
    } catch (err) {
      console.warn('[Entity] infectWith failed:', err);
      this.#infected = false;
      this.entityKey = this.name; // revert
      if (this.bodyEl) this.bodyEl.dataset.state = 'alive';
    }
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
   * Write the current (x, y) position and fixed rotation to the DOM.
   * Using transform keeps this on the compositor thread (no layout).
   * Offset by ICON_HALF so (x, y) is the icon's centre point.
   * rotate() is applied after translate so it spins the icon around
   * its own centre, independent of its screen position.
   */
  _applyTransform() {
    if (!this.el) return;
    const { ICON_HALF: h } = DEFAULTS;
    this.el.style.transform =
      `translate(${this.x - h}px, ${this.y - h}px) rotate(${this.rotation}deg)`;
  }
}
