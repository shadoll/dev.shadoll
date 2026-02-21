/**
 * logoLetter.js
 * A single letter of the "shadolldev" logo word.
 *
 * Each letter:
 *  - Has a "slot" — its home offset from the word origin.
 *  - Is either attached (moves rigidly with the word) or ejected (free-flight).
 *  - Tracks bump count toward a random ejection threshold (500–5000).
 *  - When ejected: spring-attracted back to its slot; re-attaches on arrival.
 *
 * DOM structure mirrors Entity:
 *  <div class="logo-letter">             ← position via JS transform
 *    <div class="logo-letter__body">     ← scale animation via CSS transition
 *      <svg>…</svg>
 *    </div>
 *  </div>
 */

import { loadIcon } from './iconLoader.js';
import { DEFAULTS } from './constants.js';

export class LogoLetter {
  // ── Identity ─────────────────────────────────────────────
  /** @type {string}  */ iconName;
  /** @type {number}  */ slotIndex;    // 0–9, position in the word

  // ── Physics (absolute screen coords, letter centre) ───────
  /** @type {number}  */ x  = 0;
  /** @type {number}  */ y  = 0;
  /** @type {number}  */ vx = 0;
  /** @type {number}  */ vy = 0;

  // ── Ejection state ───────────────────────────────────────
  /** @type {boolean} */ ejected       = false;
  /** @type {number}  */ bumpCount     = 0;
  /** @type {number}  */ bumpThreshold;

  // ── DOM ───────────────────────────────────────────────────
  /** @type {HTMLElement|null} */ el      = null;
  /** @type {HTMLElement|null} */ bodyEl  = null;
  /** @type {HTMLElement|null} */ debugEl = null;
  /** @type {boolean}          */ mounted = false;

  /**
   * @param {{ iconName: string, slotIndex: number, bumpThreshold?: number }} cfg
   */
  constructor({ iconName, slotIndex, bumpThreshold }) {
    this.iconName      = iconName;
    this.slotIndex     = slotIndex;
    this.bumpThreshold = bumpThreshold
      ?? (DEFAULTS.LOGO_BUMP_THRESHOLD_MIN
          + Math.floor(Math.random()
            * (DEFAULTS.LOGO_BUMP_THRESHOLD_MAX - DEFAULTS.LOGO_BUMP_THRESHOLD_MIN)));
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Build the DOM element, fetch the SVG, attach to container.
   * Triggers the scale-in appear animation.
   *
   * @param {HTMLElement} container
   */
  async mount(container) {
    this.el     = document.createElement('div');
    this.el.className = 'logo-letter';

    this.bodyEl = document.createElement('div');
    this.bodyEl.className   = 'logo-letter__body';
    this.bodyEl.dataset.state = 'spawning';

    try {
      this.bodyEl.innerHTML = await loadIcon(this.iconName);
    } catch (err) {
      console.warn(`[LogoLetter] Could not load "${this.iconName}":`, err);
      return;
    }

    this.debugEl = document.createElement('span');
    this.debugEl.className   = 'logo-letter__debug';
    this.debugEl.textContent = '0';

    this.el.appendChild(this.bodyEl);
    this.el.appendChild(this.debugEl);
    container.appendChild(this.el);
    this.mounted = true;

    // Double-rAF guarantees the 'spawning' state was painted before 'alive',
    // ensuring the CSS scale transition actually fires.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.bodyEl) this.bodyEl.dataset.state = 'alive';
      });
    });
  }

  /**
   * Snap position to the word slot (used when attached).
   *
   * @param {number} wordX  word origin x
   * @param {number} wordY  word origin y
   */
  snapToSlot(wordX, wordY) {
    this.x = wordX + (this.slotIndex - 4.5) * DEFAULTS.LOGO_LETTER_GAP;
    this.y = wordY;
    this._applyTransform();
  }

  /**
   * Compute the absolute slot position without moving the letter.
   *
   * @param {number} wordX
   * @param {number} wordY
   * @returns {{ sx: number, sy: number }}
   */
  slotPosition(wordX, wordY) {
    return {
      sx: wordX + (this.slotIndex - 4.5) * DEFAULTS.LOGO_LETTER_GAP,
      sy: wordY,
    };
  }

  /**
   * Advance free-flight physics for one frame.
   * Spring force pulls toward slot; velocity is damped; viewport edges bounce.
   *
   * @param {number} wordX
   * @param {number} wordY
   * @param {number} multiplier  speed multiplier from settings
   */
  updateEjected(wordX, wordY, multiplier) {
    const { sx, sy } = this.slotPosition(wordX, wordY);

    // Spring force toward slot (applied every frame regardless of multiplier)
    this.vx += (sx - this.x) * DEFAULTS.LOGO_SPRING_K;
    this.vy += (sy - this.y) * DEFAULTS.LOGO_SPRING_K;

    // Damping
    this.vx *= DEFAULTS.LOGO_SPRING_DAMPING;
    this.vy *= DEFAULTS.LOGO_SPRING_DAMPING;

    // Speed cap
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > DEFAULTS.LOGO_EJECT_MAX_SPEED) {
      this.vx = (this.vx / spd) * DEFAULTS.LOGO_EJECT_MAX_SPEED;
      this.vy = (this.vy / spd) * DEFAULTS.LOGO_EJECT_MAX_SPEED;
    }

    // Integrate position
    this.x += this.vx * multiplier;
    this.y += this.vy * multiplier;

    // Viewport edge bounce
    const h  = DEFAULTS.LOGO_LETTER_HALF;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (this.x - h <= 0)   { this.x = h;      this.vx =  Math.abs(this.vx); }
    if (this.x + h >= vw)  { this.x = vw - h; this.vx = -Math.abs(this.vx); }
    if (this.y - h <= 0)   { this.y = h;       this.vy =  Math.abs(this.vy); }
    if (this.y + h >= vh)  { this.y = vh - h;  this.vy = -Math.abs(this.vy); }

    this._applyTransform();
  }

  /** True when the letter is within LOGO_REATTACH_RADIUS of its slot. */
  isNearSlot(wordX, wordY) {
    const { sx, sy } = this.slotPosition(wordX, wordY);
    return Math.hypot(this.x - sx, this.y - sy) <= DEFAULTS.LOGO_REATTACH_RADIUS;
  }

  /**
   * Called on every entity collision with this letter.
   * Returns true if this particular hit triggers ejection.
   *
   * @returns {boolean}
   */
  onBump() {
    this.bumpCount++;
    if (this.debugEl) this.debugEl.textContent = String(this.bumpCount);
    this._flashHit();
    return !this.ejected && this.bumpCount >= this.bumpThreshold;
  }

  /**
   * Launch this letter as a free-flying projectile.
   *
   * @param {number} impulseVx
   * @param {number} impulseVy
   */
  eject(impulseVx, impulseVy) {
    this.ejected  = true;
    this.vx       = impulseVx;
    this.vy       = impulseVy;
    this.el?.classList.add('logo-letter--ejected');
  }

  /**
   * Re-attach the letter to its slot after it has drifted back.
   * Picks a new random threshold for the next ejection cycle.
   */
  reattach() {
    this.ejected      = false;
    this.vx           = 0;
    this.vy           = 0;
    this.bumpCount    = 0;
    this.bumpThreshold = DEFAULTS.LOGO_BUMP_THRESHOLD_MIN
      + Math.floor(Math.random()
        * (DEFAULTS.LOGO_BUMP_THRESHOLD_MAX - DEFAULTS.LOGO_BUMP_THRESHOLD_MIN));
    this.el?.classList.remove('logo-letter--ejected');
    if (this.debugEl) this.debugEl.textContent = '0';
  }

  /**
   * Show or hide the debug hit-count label.
   * @param {boolean} visible
   */
  setDebugVisible(visible) {
    this.el?.classList.toggle('logo-letter--show-debug', visible);
  }

  /** Remove this letter from the DOM. */
  destroy() {
    this.el?.remove();
    this.el      = null;
    this.bodyEl  = null;
    this.debugEl = null;
    this.mounted = false;
  }

  // ── Private ────────────────────────────────────────────────

  _applyTransform() {
    if (!this.el) return;
    const h = DEFAULTS.LOGO_LETTER_HALF;
    this.el.style.transform = `translate(${this.x - h}px, ${this.y - h}px)`;
  }

  _flashHit() {
    if (!this.bodyEl) return;
    this.bodyEl.classList.remove('logo-letter__body--hit');
    void this.bodyEl.offsetWidth; // force reflow so animation restarts
    this.bodyEl.classList.add('logo-letter__body--hit');
    setTimeout(() => this.bodyEl?.classList.remove('logo-letter__body--hit'), 350);
  }
}
