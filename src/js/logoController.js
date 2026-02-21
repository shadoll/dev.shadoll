/**
 * logoController.js
 * Manages the floating "shadolldev" logo word.
 *
 * The word is made of 10 letter SVG icons flying together as a unit,
 * bouncing off viewport edges. Individual letters absorb bumps from
 * evolution entities; after enough hits (random 500–5000 threshold)
 * a letter ejects and flies freely with a spring pulling it home.
 *
 * EvolutionController drives the physics:
 *  - Calls update(multiplier) every rAF tick to advance word + letter positions.
 *  - Calls checkCollisionsWithEntities(entities[]) after entity positions settle.
 *
 * State is serialised via serialise() and restored in init() so the word
 * continues seamlessly across page reloads.
 */

import { LogoLetter }   from './logoLetter.js';
import { preloadIcons } from './iconLoader.js';
import { DEFAULTS }     from './constants.js';

/** Ordered icon filenames for s·h·a·d·o·l·l·d·e·v */
const WORD_ICONS = [
  'letter-s-box',   // 0  s
  'letter-h-box',   // 1  h
  'letter-a-box',   // 2  a
  'letter-d-box',   // 3  d
  'letter-o-box',   // 4  o
  'letter-l-box',   // 5  l
  'letter-l-box',   // 6  l
  'letter-d',   // 7  d
  'letter-e',       // 8  e
  'letter-v',       // 9  v
];

export class LogoController {
  // ── Word-origin physics ───────────────────────────────────
  /** @type {number} */ #wordX  = 0;
  /** @type {number} */ #wordY  = 0;
  /** @type {number} */ #wordVx = 0;
  /** @type {number} */ #wordVy = 0;

  /** @type {LogoLetter[]} */     #letters   = [];
  /** @type {boolean} */            #thresholdVisible = false;
  /** @type {HTMLElement|null} */ #container = null;
  /** @type {boolean} */          #ready     = false;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Randomise the bump threshold for every letter using the current min/max
   * settings and update the on‑screen labels. Called when settings change or
   * when evolution is restarted.
   */
  resetThresholds() {
    for (const letter of this.#letters) {
      letter.bumpThreshold = DEFAULTS.LOGO_BUMP_THRESHOLD_MIN
        + Math.floor(Math.random()
            * (DEFAULTS.LOGO_BUMP_THRESHOLD_MAX - DEFAULTS.LOGO_BUMP_THRESHOLD_MIN));
      if (letter.thresholdEl) {
        letter.thresholdEl.textContent = String(letter.bumpThreshold);
      }
    }
  }

  /**
   * Mount all letter DOM nodes and initialise physics.
   *
   * @param {HTMLElement} container  Same container as EvolutionController.
   * @param {object|null} savedState  Snapshot from serialise(), or null for a fresh start.
   */
  async init(container, savedState = null) {
    this.#container = container;

    // Warm SVG cache for all unique letter icons before mounting
    await Promise.all([...new Set(WORD_ICONS)].map(n => preloadIcons([n])));

    if (savedState) {
      this.#restoreFromSnapshot(savedState);
    } else {
      this.#initFresh();
    }

    await this.#mountLetters(savedState?.letters ?? null);
    this.#ready = true;
  }

  /**
   * Advance word + letter physics one frame.
   * Called from EvolutionController's rAF tick BEFORE collision checks.
   *
   * @param {number} multiplier  settings speed multiplier (1 = normal)
   */
  update(multiplier) {
    if (!this.#ready) return;

    // Move word origin
    this.#wordX += this.#wordVx * multiplier;
    this.#wordY += this.#wordVy * multiplier;

    // Bounce word off viewport edges.
    // Word spans: wordX ± (4.5 * GAP) and wordY ± LETTER_HALF
    const halfW = 4.5 * DEFAULTS.LOGO_LETTER_GAP + DEFAULTS.LOGO_LETTER_HALF;
    const halfH = DEFAULTS.LOGO_LETTER_HALF;
    const vw    = window.innerWidth;
    const vh    = window.innerHeight;

    if (this.#wordX - halfW <= 0)      { this.#wordX = halfW;          this.#wordVx =  Math.abs(this.#wordVx); }
    if (this.#wordX + halfW >= vw)     { this.#wordX = vw - halfW;     this.#wordVx = -Math.abs(this.#wordVx); }
    if (this.#wordY - halfH <= 0)      { this.#wordY = halfH;          this.#wordVy =  Math.abs(this.#wordVy); }
    if (this.#wordY + halfH >= vh)     { this.#wordY = vh - halfH;     this.#wordVy = -Math.abs(this.#wordVy); }

    // Update each letter
    for (const letter of this.#letters) {
      if (letter.ejected) {
        letter.updateEjected(this.#wordX, this.#wordY, multiplier);
        // Re-attach when drifted back close enough
        if (letter.isNearSlot(this.#wordX, this.#wordY)) {
          letter.reattach();
          letter.snapToSlot(this.#wordX, this.#wordY);
        }
      } else {
        letter.snapToSlot(this.#wordX, this.#wordY);
      }
    }
  }

  /**
   * Check every entity against every letter.
   * Called from EvolutionController's rAF tick AFTER entity positions are updated
   * and AFTER entity-entity collisions are resolved.
   *
   * Collision response:
   *  - Attached letter: entity reflects like a solid wall; letter unmoved.
   *  - Ejected letter: equal-mass elastic exchange along collision normal.
   *  - Letter bump count increments; if threshold reached, letter ejects.
   *
   * @param {import('./entity.js').Entity[]} entities
   */
  checkCollisionsWithEntities(entities) {
    if (!this.#ready) return;

    const colDiam = DEFAULTS.LOGO_COLLISION_DIAMETER;

    for (const entity of entities) {
      if (!entity.alive || entity.dying) continue;

      for (const letter of this.#letters) {
        if (!letter.mounted) continue;

        const dx   = entity.x - letter.x;
        const dy   = entity.y - letter.y;
        const dist = Math.hypot(dx, dy);

        if (dist >= colDiam || dist === 0) continue;

        // Collision normal pointing from letter centre → entity centre
        const nx = dx / dist;
        const ny = dy / dist;

        // Velocity of entity relative to letter along the collision normal.
        // nx points FROM letter TO entity, so dot < 0 means entity is approaching.
        const dot = (entity.vx - letter.vx) * nx + (entity.vy - letter.vy) * ny;

        if (dot < 0) {
          // Entity moving toward letter — reflect fully, like a screen edge.
          // Letters are rigid obstacles regardless of ejected state.
          entity.vx -= 2 * dot * nx;
          entity.vy -= 2 * dot * ny;
        }

        // Positional correction — push entity out only (letter is unmoved)
        const overlap = colDiam - dist;
        entity.x += overlap * nx;
        entity.y += overlap * ny;

        // Visual hit on entity
        entity.onHit();

        // Bump the letter; eject if threshold crossed
        const shouldEject = letter.onBump();
        if (shouldEject) {
          // Eject in the direction the entity pushed from (away from entity)
          const ejVx = -nx * DEFAULTS.LOGO_EJECT_IMPULSE;
          const ejVy = -ny * DEFAULTS.LOGO_EJECT_IMPULSE;
          letter.eject(ejVx, ejVy);
          // after detaching, reset bump counter and pick a fresh threshold
          letter.bumpCount = 0;
          letter.bumpThreshold = DEFAULTS.LOGO_BUMP_THRESHOLD_MIN
            + Math.floor(Math.random()
                * (DEFAULTS.LOGO_BUMP_THRESHOLD_MAX - DEFAULTS.LOGO_BUMP_THRESHOLD_MIN));
          if (letter.thresholdEl) {
            letter.thresholdEl.textContent = String(letter.bumpThreshold);
          }
        }
      }
    }
  }

  /**
   * Serialise complete logo state for localStorage.
   * Called by EvolutionController's #saveState().
   *
   * @returns {object}
   */
  serialise() {
    // Note: we deliberately do **not** persist each letter's bumpThreshold.
    // When the page reloads we want thresholds to be freshly chosen from the
    // current min/max settings rather than sticking to whatever they were.
    return {
      wordX:  this.#wordX,
      wordY:  this.#wordY,
      wordVx: this.#wordVx,
      wordVy: this.#wordVy,
      letters: this.#letters.map(l => ({
        slotIndex:     l.slotIndex,
        iconName:      l.iconName,
        bumpCount:     l.bumpCount,
        // bumpThreshold intentionally omitted
        ejected:       l.ejected,
        x:             l.x,
        y:             l.y,
        vx:            l.vx,
        vy:            l.vy,
      })),
    };
  }

  /** Remove all letter DOM nodes. */
  destroy() {
    this.#letters.forEach(l => l.destroy());
    this.#letters = [];
    this.#ready   = false;
  }

  get ready() { return this.#ready; }

  /**
   * Show or hide the hit-count debug label on every letter.
   * @param {boolean} visible
   */
  setDebugVisible(visible) {
    for (const letter of this.#letters) {
      letter.setDebugVisible(visible);
    }
  }

  /**
   * Toggle the visibility of the bump-threshold numbers on every letter.
   * @param {boolean} visible
   */
  setThresholdVisible(visible) {
    this.#thresholdVisible = visible;
    for (const letter of this.#letters) {
      letter.setThresholdVisible(visible);
    }
  }

  /**
   * Return an array of the current bump counts for each letter (slot order).
   * Used by SettingsController so the zero values are included when persisting.
   * @returns {number[]}
   */
  getHitCounts() {
    return this.#letters.map(l => l.bumpCount);
  }

  /**
   * Apply previously saved bump counts back onto the letters. If the array is
   * shorter/longer than the current word, it is truncated or padded with zeros.
   * @param {number[]} counts
   */
  setHitCounts(counts) {
    if (!Array.isArray(counts)) return;
    for (let i = 0; i < this.#letters.length; i++) {
      this.#letters[i].bumpCount = counts[i] ?? 0;
      if (this.#letters[i].debugEl) {
        this.#letters[i].debugEl.textContent = String(this.#letters[i].bumpCount);
      }
    }
  }

  /**
   * Reset all bump counters back to zero (used when evolution is cleared).
   */
  resetCounters() {
    for (const letter of this.#letters) {
      letter.bumpCount = 0;
      if (letter.debugEl) letter.debugEl.textContent = '0';
      // remove any red proximity colouring so letters appear white again
      if (typeof letter._resetProximityColor === 'function') {
        letter._resetProximityColor();
      }
    }
  }

  // ── Private ────────────────────────────────────────────────

  /** Set up a brand-new word at the viewport centre with a random direction. */
  #initFresh() {
    const vw    = window.innerWidth;
    const vh    = window.innerHeight;
    const angle = Math.random() * Math.PI * 2;

    this.#wordX  = vw / 2;
    this.#wordY  = vh / 2;
    this.#wordVx = Math.cos(angle) * DEFAULTS.LOGO_WORD_BASE_SPEED;
    this.#wordVy = Math.sin(angle) * DEFAULTS.LOGO_WORD_BASE_SPEED;

    this.#letters = WORD_ICONS.map((iconName, i) =>
      new LogoLetter({ iconName, slotIndex: i })
    );
  }

  /** Restore word origin and letter objects from a saved snapshot. */
  #restoreFromSnapshot(state) {
    this.#wordX  = state.wordX  ?? window.innerWidth  / 2;
    this.#wordY  = state.wordY  ?? window.innerHeight / 2;
    this.#wordVx = state.wordVx ?? 0;
    this.#wordVy = state.wordVy ?? DEFAULTS.LOGO_WORD_BASE_SPEED;

    // Ignore saved bumpThreshold; always regenerate using current settings
    this.#letters = WORD_ICONS.map((iconName, i) => {
      const saved = state.letters?.[i];
      const letter = new LogoLetter({
        iconName,
        slotIndex:     i,
        // no bumpThreshold argument -> constructor uses DEFAULTS range
      });
      // restore bumpCount/ejected/position if present
      if (saved) {
        letter.bumpCount = saved.bumpCount ?? 0;
        letter.ejected   = saved.ejected   ?? false;
      }
      return letter;
    });
  }

  /**
   * Mount all letters.
   * If savedLetterStates is provided, applies runtime state after mounting.
   *
   * @param {Array|null} savedLetterStates
   */
  async #mountLetters(savedLetterStates) {
    if (!this.#container) return;

    await Promise.all(this.#letters.map(async (letter, i) => {
      await letter.mount(this.#container);
      if (!letter.mounted) return;

      // apply current threshold visibility immediately
      if (this.#thresholdVisible) {
        letter.setThresholdVisible(true);
      }

      const saved = savedLetterStates?.[i];
      if (saved) {
        letter.bumpCount = saved.bumpCount ?? 0;
        letter.ejected   = saved.ejected   ?? false;

        // reflect proximity colour based on the restored bump count
        if (typeof letter._updateProximityColor === 'function') {
          letter._updateProximityColor();
        }

        if (saved.ejected) {
          letter.x  = saved.x  ?? letter.x;
          letter.y  = saved.y  ?? letter.y;
          letter.vx = saved.vx ?? 0;
          letter.vy = saved.vy ?? 0;
          letter.el?.classList.add('logo-letter--ejected');
          letter._applyTransform();
        } else {
          letter.snapToSlot(this.#wordX, this.#wordY);
        }
      } else {
        letter.snapToSlot(this.#wordX, this.#wordY);
      }
    }));
  }
}
