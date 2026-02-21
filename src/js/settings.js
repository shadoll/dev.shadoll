/**
 * settings.js
 * Connects the settings UI controls to GradientController and EvolutionController.
 *
 * Persistence:
 *  - Every setting change is immediately written to localStorage.
 *  - Call loadSaved() from main.js (after gradient.init()) to restore the
 *    saved state on the next page load so the system continues as configured.
 *
 * Reset:
 *  - resetBtn clears the settings storage and restores DEFAULTS for the
 *    *settings* that are exposed in the modal (gradient, animation, logo
 *    hit‑count visibility, etc). This button does **not** touch the evolution
 *    simulation state (entity population, saved logo hit counts, timers, etc).
 *    The guide panel is responsible for restarting/clearing the evolution.
 */

import { DEFAULTS } from './constants.js';

const STORAGE_KEY = 'devpage:settings';

// settings storage keys
const STORAGE_HIT_COUNT_KEY = 'letterHitCountVisible';
const STORAGE_THRESHOLD_KEY = 'letterThresholdVisible';
const STORAGE_BUMP_MIN_KEY  = 'bumpThresholdMin';
const STORAGE_BUMP_MAX_KEY  = 'bumpThresholdMax';

// capture original constants so reset can restore later
const ORIGINAL_BUMP_MIN = DEFAULTS.LOGO_BUMP_THRESHOLD_MIN;
const ORIGINAL_BUMP_MAX = DEFAULTS.LOGO_BUMP_THRESHOLD_MAX;

export class SettingsController {
  /** @type {import('./gradient.js').GradientController} */
  #gradient;

  /** @type {import('./evolution.js').EvolutionController} */
  #evolution;

  /** @type {import('./logoController.js').LogoController|null} */
  #logo = null;

  /** @type {number[]|null} */
  #savedLetterHitCounts = null; // stored when loadSaved runs before logo is ready

  /**
   * @param {import('./gradient.js').GradientController}   gradient
   * @param {import('./evolution.js').EvolutionController} evolution
   */
  constructor(gradient, evolution) {
    this.#gradient  = gradient;
    this.#evolution = evolution;
    this.#bindEvents();
    this.#syncControls();

    // persist counts whenever a letter is bumped so storage reflects live
    // values, not just whatever was saved by the last manual change.
    document.addEventListener('logoLetterBumped', () => this.#saveState());

    // when the evolution system is restarted via the guide panel we want to
    // clear the stored letter hit counts (they belong to simulation state,
    // not permanent settings). remove the field so loadSaved() won't reapply it
    document.addEventListener('evolutionCleared', () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && typeof s === 'object' && 'letterHitCounts' in s) {
            delete s.letterHitCounts;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
          }
        }
      } catch { /* ignore */ }
    });
  }

  // ── Public ──────────────────────────────────────────────────

  /**
   * Wire in the LogoController once it is ready.
   * Applies any saved debug setting immediately.
   *
   * @param {import('./logoController.js').LogoController} logo
   */
  setLogoController(logo) {
    this.#logo = logo;
    const toggle = /** @type {HTMLInputElement} */ (document.getElementById('letterHitCountToggle'));
    if (toggle) logo.setDebugVisible(toggle.checked);
    const thrToggle = /** @type {HTMLInputElement} */ (document.getElementById('letterThresholdToggle'));
    if (thrToggle) logo.setThresholdVisible(thrToggle.checked);

    // if we previously loaded hit counts before the logo was available,
    // reapply them now so the labels display correctly immediately on load
    if (this.#savedLetterHitCounts && typeof logo.setHitCounts === 'function') {
      logo.setHitCounts(this.#savedLetterHitCounts);
      this.#savedLetterHitCounts = null;
    }
  }

  /**
   * Apply saved localStorage settings to the controllers and sync the UI.
   * Must be called AFTER gradient.init() so saved values override DEFAULTS.
   */
  loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.gradientColor    === 'string')  this.#gradient.setColor(s.gradientColor);
      if (typeof s.gradientSpeed    === 'number')  this.#gradient.setSpeed(s.gradientSpeed);
      if (typeof s.gradientRotation === 'boolean') this.#gradient.toggleRotation(s.gradientRotation);
      if (typeof s.moveSpeed        === 'number')  this.#evolution.setMoveSpeed(s.moveSpeed);
      if (typeof s.spawnRate        === 'number')  this.#evolution.setSpawnRate(s.spawnRate);
      if (typeof s.virusKillChance  === 'number')  this.#evolution.setVirusKillChance(s.virusKillChance);
      if (typeof s.bugSpawnChance   === 'number')  this.#evolution.setBugSpawnChance(s.bugSpawnChance);
      if (typeof s.bugMaxCount      === 'number')  this.#evolution.setBugMaxCount(s.bugMaxCount);
      if (typeof s[STORAGE_HIT_COUNT_KEY] === 'boolean') {
        const toggle = /** @type {HTMLInputElement} */ (document.getElementById('letterHitCountToggle'));
        if (toggle) toggle.checked = s[STORAGE_HIT_COUNT_KEY];
        this.#logo?.setDebugVisible(s[STORAGE_HIT_COUNT_KEY]);
      }
      if (typeof s[STORAGE_THRESHOLD_KEY] === 'boolean') {
        const toggle = /** @type {HTMLInputElement} */ (document.getElementById('letterThresholdToggle'));
        if (toggle) toggle.checked = s[STORAGE_THRESHOLD_KEY];
        this.#logo?.setThresholdVisible(s[STORAGE_THRESHOLD_KEY]);
      }
      if (typeof s[STORAGE_BUMP_MIN_KEY] === 'number') {
        DEFAULTS.LOGO_BUMP_THRESHOLD_MIN = s[STORAGE_BUMP_MIN_KEY];
      }
      if (typeof s[STORAGE_BUMP_MAX_KEY] === 'number') {
        DEFAULTS.LOGO_BUMP_THRESHOLD_MAX = s[STORAGE_BUMP_MAX_KEY];
      }
      // restore any saved hit‑count numbers (including zeros). if the
      // LogoController isn't wired yet we keep the array so setLogoController()
      // can apply it later.
      if (Array.isArray(s.letterHitCounts)) {
        if (this.#logo && typeof this.#logo.setHitCounts === 'function') {
          this.#logo.setHitCounts(s.letterHitCounts);
        } else {
          this.#savedLetterHitCounts = s.letterHitCounts.slice();
        }
      }
      // after restoring bump range, ensure letters use it
      if (this.#logo && typeof this.#logo.resetThresholds === 'function') {
        this.#logo.resetThresholds();
      }
    } catch { /* corrupt storage — ignore */ }
    this.#syncControls();
  }

  // ── Private ────────────────────────────────────────────────

  #bindEvents() {
    const colorPicker     = /** @type {HTMLInputElement}  */ (document.getElementById('colorPicker'));
    const colorValue      = /** @type {HTMLElement}       */ (document.getElementById('colorValue'));
    const speedSlider     = /** @type {HTMLInputElement}  */ (document.getElementById('speedSlider'));
    const rotToggle       = /** @type {HTMLInputElement}  */ (document.getElementById('rotationToggle'));
    const moveSpeedSlider = /** @type {HTMLInputElement}  */ (document.getElementById('moveSpeedSlider'));
    const spawnRateSlider = /** @type {HTMLInputElement}  */ (document.getElementById('spawnRateSlider'));
    const virusKillSlider = /** @type {HTMLInputElement}  */ (document.getElementById('virusKillSlider'));
    const bugChanceSlider = /** @type {HTMLInputElement}  */ (document.getElementById('bugChanceSlider'));
    const bugCountSlider  = /** @type {HTMLInputElement}  */ (document.getElementById('bugCountSlider'));
    const resetBtn           = /** @type {HTMLButtonElement} */ (document.getElementById('resetBtn'));
    const letterHitCountToggle = /** @type {HTMLInputElement}  */ (document.getElementById('letterHitCountToggle'));
    const letterThresholdToggle = /** @type {HTMLInputElement}  */ (document.getElementById('letterThresholdToggle'));
    const thresholdMinInput = /** @type {HTMLInputElement}  */ (document.getElementById('thresholdMinInput'));
    const thresholdMaxInput = /** @type {HTMLInputElement}  */ (document.getElementById('thresholdMaxInput'));

    // ── Rotation toggle ────────────────────────────────────
    rotToggle.addEventListener('change', (e) => {
      this.#gradient.toggleRotation(/** @type {HTMLInputElement} */ (e.target).checked);
      this.#saveState();
    });

    // ── Gradient animation speed ───────────────────────────
    speedSlider.addEventListener('input', (e) => {
      const val = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#gradient.setSpeed(val);
      document.getElementById('speedValue').textContent = String(val);
      this.#saveState();
    });

    // ── Icon movement speed ────────────────────────────────
    moveSpeedSlider.addEventListener('input', (e) => {
      const val = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setMoveSpeed(val);
      document.getElementById('moveSpeedValue').textContent = String(val);
      this.#saveState();
    });

    // ── Spawn rate ─────────────────────────────────────────
    spawnRateSlider.addEventListener('input', (e) => {
      const val = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setSpawnRate(val);
      document.getElementById('spawnRateValue').textContent = String(val);
      this.#saveState();
    });

    // ── Virus lethality ────────────────────────────────────
    virusKillSlider.addEventListener('input', (e) => {
      const num = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setVirusKillChance(num / 100);
      document.getElementById('virusKillValue').textContent = num + '%';
      this.#saveState();
    });

    // ── Bug spawn chance ───────────────────────────────────
    bugChanceSlider.addEventListener('input', (e) => {
      const num = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setBugSpawnChance(num / 100);
      document.getElementById('bugChanceValue').textContent = num + '%';
      this.#saveState();
    });

    // ── Bump threshold range ───────────────────────────────
    thresholdMinInput.addEventListener('input', (e) => {
      const val = Number(/** @type {HTMLInputElement} */ (e.target).value);
      DEFAULTS.LOGO_BUMP_THRESHOLD_MIN = val;
      document.getElementById('thresholdMinValue').textContent = String(val);
      // keep min ≤ max
      if (val > DEFAULTS.LOGO_BUMP_THRESHOLD_MAX) {
        DEFAULTS.LOGO_BUMP_THRESHOLD_MAX = val;
        thresholdMaxInput.value = String(val);
        document.getElementById('thresholdMaxValue').textContent = String(val);
      }
      this.#logo?.resetThresholds();
      this.#saveState();
    });
    thresholdMaxInput.addEventListener('input', (e) => {
      const val = Number(/** @type {HTMLInputElement} */ (e.target).value);
      DEFAULTS.LOGO_BUMP_THRESHOLD_MAX = val;
      document.getElementById('thresholdMaxValue').textContent = String(val);
      // keep max ≥ min
      if (val < DEFAULTS.LOGO_BUMP_THRESHOLD_MIN) {
        DEFAULTS.LOGO_BUMP_THRESHOLD_MIN = val;
        thresholdMinInput.value = String(val);
        document.getElementById('thresholdMinValue').textContent = String(val);
      }
      this.#logo?.resetThresholds();
      this.#saveState();
    });

    // ── Bug max count ──────────────────────────────────────
    bugCountSlider.addEventListener('input', (e) => {
      const num = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setBugMaxCount(num);
      document.getElementById('bugCountValue').textContent = String(num);
      this.#saveState();
    });

    // ── Logo: letter hit count ────────────────────────────
    // The label on each logo letter shows how many bumps it has taken.
    // Persist the visibility state along with the other settings.
    letterHitCountToggle.addEventListener('change', (e) => {
      const on = /** @type {HTMLInputElement} */ (e.target).checked;
      this.#logo?.setDebugVisible(on);
      this.#saveState();
    });

    // ── Logo: threshold number ────────────────────────────
    // Shows how many bumps are required before ejection.
    letterThresholdToggle.addEventListener('change', (e) => {
      const on = /** @type {HTMLInputElement} */ (e.target).checked;
      this.#logo?.setThresholdVisible(on);
      this.#saveState();
    });

    // ── Reset to defaults ──────────────────────────────────
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      this.#gradient.setColor(DEFAULTS.GRADIENT_COLOR);
      this.#gradient.setSpeed(DEFAULTS.GRADIENT_SPEED);
      this.#gradient.toggleRotation(DEFAULTS.GRADIENT_ROTATION);
      // reset bump threshold range to original constants
      DEFAULTS.LOGO_BUMP_THRESHOLD_MIN = ORIGINAL_BUMP_MIN;
      DEFAULTS.LOGO_BUMP_THRESHOLD_MAX = ORIGINAL_BUMP_MAX;
      thresholdMinInput.value = String(DEFAULTS.LOGO_BUMP_THRESHOLD_MIN);
      thresholdMaxInput.value = String(DEFAULTS.LOGO_BUMP_THRESHOLD_MAX);

      // NOTE: moveSpeed/spawnRate/etc. are evolution configuration options that
      // live in the same UI but are considered part of the simulation state.
      // They are **not** reset here; clearing the evolution (including those
      // values) is done via the guide panel.
      letterHitCountToggle.checked = false;
      this.#logo?.setDebugVisible(false);
      // also clear threshold display toggle
      letterThresholdToggle.checked = false;
      this.#logo?.setThresholdVisible(false);
      this.#syncControls();
    });
  }

  /** Persist current controller state to localStorage. */
  #saveState() {
    try {
      // gather optional hit counts from the logo controller; we want to persist
    // zeros as well so that a fresh word is restored exactly the same after a
    // reload. The counts are also part of the evolution storage but keeping a
    // copy here allows the settings key to mirror “all other settings”.
    let counts = null;
    if (this.#logo && typeof this.#logo.getHitCounts === 'function') {
      counts = this.#logo.getHitCounts();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gradientColor:    this.#gradient.color,
        gradientSpeed:    this.#gradient.speed,
        gradientRotation: this.#gradient.rotating,
        moveSpeed:        this.#evolution.moveSpeed,
        spawnRate:        this.#evolution.spawnRate,
        virusKillChance:  this.#evolution.virusKillChance,
        bugSpawnChance:   this.#evolution.bugSpawnChance,
        bugMaxCount:      this.#evolution.bugMaxCount,
        [STORAGE_HIT_COUNT_KEY]:    (/** @type {HTMLInputElement} */ (document.getElementById('letterHitCountToggle')))?.checked ?? false,
        [STORAGE_THRESHOLD_KEY]:    (/** @type {HTMLInputElement} */ (document.getElementById('letterThresholdToggle')))?.checked ?? false,
        letterHitCounts:  counts,
      }));
    } catch { /* quota exceeded or private browsing — ignore */ }
  }

  /**
   * Push controller state → DOM controls so the UI always matches.
   * Called on construction, after loadSaved(), and after reset.
   */
  #syncControls() {
    const colorPicker     = /** @type {HTMLInputElement} */ (document.getElementById('colorPicker'));
    const colorValue      = /** @type {HTMLElement}      */ (document.getElementById('colorValue'));
    const speedSlider     = /** @type {HTMLInputElement} */ (document.getElementById('speedSlider'));
    const rotToggle       = /** @type {HTMLInputElement} */ (document.getElementById('rotationToggle'));
    const moveSpeedSlider = /** @type {HTMLInputElement} */ (document.getElementById('moveSpeedSlider'));
    const spawnRateSlider = /** @type {HTMLInputElement} */ (document.getElementById('spawnRateSlider'));
    const virusKillSlider = /** @type {HTMLInputElement} */ (document.getElementById('virusKillSlider'));
    const bugChanceSlider = /** @type {HTMLInputElement} */ (document.getElementById('bugChanceSlider'));
    const bugCountSlider      = /** @type {HTMLInputElement} */ (document.getElementById('bugCountSlider'));
    const letterHitCountToggle = /** @type {HTMLInputElement} */ (document.getElementById('letterHitCountToggle'));

    colorPicker.value      = this.#gradient.color;
    colorValue.textContent = this.#gradient.color;
    speedSlider.value      = String(this.#gradient.speed);
    document.getElementById('speedValue').textContent = String(this.#gradient.speed);
    rotToggle.checked      = this.#gradient.rotating;
    moveSpeedSlider.value  = String(this.#evolution.moveSpeed);
    document.getElementById('moveSpeedValue').textContent = String(this.#evolution.moveSpeed);
    spawnRateSlider.value  = String(this.#evolution.spawnRate);
    document.getElementById('spawnRateValue').textContent = String(this.#evolution.spawnRate);
    virusKillSlider.value  = String(Math.round(this.#evolution.virusKillChance * 100));
    document.getElementById('virusKillValue').textContent = virusKillSlider.value + '%';
    bugChanceSlider.value  = String(Math.round(this.#evolution.bugSpawnChance  * 100));
    document.getElementById('bugChanceValue').textContent = bugChanceSlider.value + '%';
    bugCountSlider.value      = String(this.#evolution.bugMaxCount);
    document.getElementById('bugCountValue').textContent = bugCountSlider.value;
    thresholdMinInput.value = String(DEFAULTS.LOGO_BUMP_THRESHOLD_MIN);
    document.getElementById('thresholdMinValue').textContent = thresholdMinInput.value;
    thresholdMaxInput.value = String(DEFAULTS.LOGO_BUMP_THRESHOLD_MAX);
    document.getElementById('thresholdMaxValue').textContent = thresholdMaxInput.value;
    // leave the toggle alone; its state is already correct from the
    // controllers / saved settings. forcibly turning it off here prevented the
    // stored value from ever sticking.
    // debugHitCountToggle.checked = false; // logo hit‑count debug off by default on sync/reset
  }
}
