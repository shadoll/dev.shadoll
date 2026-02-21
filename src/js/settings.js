/**
 * settings.js
 * Connects the settings UI controls to GradientController and EvolutionController.
 * Owns no state of its own — it only reads from the DOM and
 * forwards values to the relevant controller.
 */

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
  }

  // ── Private ────────────────────────────────────────────────

  #bindEvents() {
    const colorPicker      = /** @type {HTMLInputElement} */ (document.getElementById('colorPicker'));
    const colorValue       = /** @type {HTMLElement}      */ (document.getElementById('colorValue'));
    const speedSlider      = /** @type {HTMLInputElement} */ (document.getElementById('speedSlider'));
    const moveSpeedSlider  = /** @type {HTMLInputElement} */ (document.getElementById('moveSpeedSlider'));
    const rotToggle        = /** @type {HTMLInputElement} */ (document.getElementById('rotationToggle'));

    // ── Colour picker ──────────────────────────────────────
    // 'input' fires on every pointer move — real-time background preview
    colorPicker.addEventListener('input', (e) => {
      const hex = /** @type {HTMLInputElement} */ (e.target).value;
      colorValue.textContent = hex;
      this.#gradient.setColor(hex);
    });

    // ── Gradient animation speed ───────────────────────────
    speedSlider.addEventListener('input', (e) => {
      const speed = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#gradient.setSpeed(speed);
    });

    // ── Icon movement speed ────────────────────────────────
    moveSpeedSlider.addEventListener('input', (e) => {
      const speed = Number(/** @type {HTMLInputElement} */ (e.target).value);
      this.#evolution.setMoveSpeed(speed);
    });

    // ── Rotation toggle ────────────────────────────────────
    rotToggle.addEventListener('change', (e) => {
      const enabled = /** @type {HTMLInputElement} */ (e.target).checked;
      this.#gradient.toggleRotation(enabled);
    });
  }
}
