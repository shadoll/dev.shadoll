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
 *  - resetBtn clears localStorage, restores DEFAULTS, and wipes live entities.
 */

import { DEFAULTS } from './constants.js';

const STORAGE_KEY = 'devpage:settings';

export class SettingsController {
  /** @type {import('./gradient.js').GradientController} */
  #gradient;

  /** @type {import('./evolution.js').EvolutionController} */
  #evolution;

  /**
   * @param {import('./gradient.js').GradientController}   gradient
   * @param {import('./evolution.js').EvolutionController} evolution
   */
  constructor(gradient, evolution) {
    this.#gradient  = gradient;
    this.#evolution = evolution;
    this.#bindEvents();
    this.#syncControls();
  }

  // ── Public ──────────────────────────────────────────────────

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
    const resetBtn        = /** @type {HTMLButtonElement} */ (document.getElementById('resetBtn'));

    // ── Colour picker ──────────────────────────────────────
    colorPicker.addEventListener('input', (e) => {
      const hex = /** @type {HTMLInputElement} */ (e.target).value;
      colorValue.textContent = hex;
      this.#gradient.setColor(hex);
      this.#saveState();
    });

    // ── Gradient animation speed ───────────────────────────
    speedSlider.addEventListener('input', (e) => {
      this.#gradient.setSpeed(Number(/** @type {HTMLInputElement} */ (e.target).value));
      this.#saveState();
    });

    // ── Rotation toggle ────────────────────────────────────
    rotToggle.addEventListener('change', (e) => {
      this.#gradient.toggleRotation(/** @type {HTMLInputElement} */ (e.target).checked);
      this.#saveState();
    });

    // ── Icon movement speed ────────────────────────────────
    moveSpeedSlider.addEventListener('input', (e) => {
      this.#evolution.setMoveSpeed(Number(/** @type {HTMLInputElement} */ (e.target).value));
      this.#saveState();
    });

    // ── Spawn rate ─────────────────────────────────────────
    spawnRateSlider.addEventListener('input', (e) => {
      this.#evolution.setSpawnRate(Number(/** @type {HTMLInputElement} */ (e.target).value));
      this.#saveState();
    });

    // ── Virus lethality ────────────────────────────────────
    virusKillSlider.addEventListener('input', (e) => {
      this.#evolution.setVirusKillChance(Number(/** @type {HTMLInputElement} */ (e.target).value) / 100);
      this.#saveState();
    });

    // ── Bug spawn chance ───────────────────────────────────
    bugChanceSlider.addEventListener('input', (e) => {
      this.#evolution.setBugSpawnChance(Number(/** @type {HTMLInputElement} */ (e.target).value) / 100);
      this.#saveState();
    });

    // ── Bug max count ──────────────────────────────────────
    bugCountSlider.addEventListener('input', (e) => {
      this.#evolution.setBugMaxCount(Number(/** @type {HTMLInputElement} */ (e.target).value));
      this.#saveState();
    });

    // ── Reset to defaults ──────────────────────────────────
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      this.#gradient.setColor(DEFAULTS.GRADIENT_COLOR);
      this.#gradient.setSpeed(DEFAULTS.GRADIENT_SPEED);
      this.#gradient.toggleRotation(DEFAULTS.GRADIENT_ROTATION);
      this.#evolution.setMoveSpeed(DEFAULTS.MOVE_SPEED);
      this.#evolution.setSpawnRate(5);
      this.#evolution.setVirusKillChance(DEFAULTS.VIRUS_KILL_CHANCE);
      this.#evolution.setBugSpawnChance(DEFAULTS.BUG_SPAWN_CHANCE);
      this.#evolution.setBugMaxCount(DEFAULTS.BUG_MAX_COUNT);
      this.#evolution.clear();
      this.#syncControls();
    });
  }

  /** Persist current controller state to localStorage. */
  #saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gradientColor:    this.#gradient.color,
        gradientSpeed:    this.#gradient.speed,
        gradientRotation: this.#gradient.rotating,
        moveSpeed:        this.#evolution.moveSpeed,
        spawnRate:        this.#evolution.spawnRate,
        virusKillChance:  this.#evolution.virusKillChance,
        bugSpawnChance:   this.#evolution.bugSpawnChance,
        bugMaxCount:      this.#evolution.bugMaxCount,
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
    const bugCountSlider  = /** @type {HTMLInputElement} */ (document.getElementById('bugCountSlider'));

    colorPicker.value      = this.#gradient.color;
    colorValue.textContent = this.#gradient.color;
    speedSlider.value      = String(this.#gradient.speed);
    rotToggle.checked      = this.#gradient.rotating;
    moveSpeedSlider.value  = String(this.#evolution.moveSpeed);
    spawnRateSlider.value  = String(this.#evolution.spawnRate);
    virusKillSlider.value  = String(Math.round(this.#evolution.virusKillChance * 100));
    bugChanceSlider.value  = String(Math.round(this.#evolution.bugSpawnChance  * 100));
    bugCountSlider.value   = String(this.#evolution.bugMaxCount);
  }
}
