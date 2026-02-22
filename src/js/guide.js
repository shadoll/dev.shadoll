/**
 * guide.js
 * GuideController — manages the evolution guide panel.
 *
 * The guide panel is a static reference showing interaction rules and
 * DNA mutation effects.  It also displays the system uptime and provides
 * the "restart evolution" button.
 *
 * Entity statistics and spawn controls live in the separate population panel
 * (PopulationPanelController / populationPanel.js).
 *
 * Behaviour:
 *  - Guide button (bottom-right): click to open/close.
 *  - Click outside the panel: closes it.
 *  - Escape key: closes it.
 */

import { loadIcon } from './iconLoader.js';

/** Format ms → "m:ss" or "h:mm:ss". */
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export class GuideController {
  /** @type {HTMLElement|null} */ #panel = null;
  /** @type {HTMLElement|null} */ #btn   = null;
  /** @type {boolean} */          #open  = false;
  /** @type {boolean} */          #iconsLoaded = false;
  /** @type {import('./evolution.js').EvolutionController|null} */ #evolution = null;
  /** @type {ReturnType<typeof setInterval>|null} */ #uptimeTimer = null;

  /**
   * Attach event listeners. Must be called after DOM is ready.
   *
   * @param {import('./evolution.js').EvolutionController} [evolution]
   *   Optional — if provided, the uptime display is kept live and the
   *   restart button clears all entities.
   */
  init(evolution = null) {
    this.#evolution = evolution;
    this.#btn   = document.getElementById('guideBtn');
    this.#panel = document.getElementById('guidePanel');
    if (!this.#btn || !this.#panel) return;

    this.#btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#open ? this.close() : this.open();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.#open && !this.#panel.contains(/** @type {Node} */ (e.target))) this.close();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#open) this.close();
    });

    // Restart button — clears all entities and saved state
    const resetBtn = document.getElementById('guideResetBtn');
    if (resetBtn && this.#evolution) {
      resetBtn.addEventListener('click', () => this.#evolution.clear());
    }
  }

  open() {
    this.#open = true;
    this.#panel.classList.add('guide-panel--visible');
    this.#panel.setAttribute('aria-hidden', 'false');
    this.#btn.setAttribute('aria-expanded', 'true');
    if (!this.#iconsLoaded) this.#populateIcons();
    if (this.#evolution) this.#startUptime();
  }

  close() {
    this.#open = false;
    this.#panel.classList.remove('guide-panel--visible');
    this.#panel.setAttribute('aria-hidden', 'true');
    this.#btn.setAttribute('aria-expanded', 'false');
    this.#stopUptime();
  }

  // ── Private ─────────────────────────────────────────────────

  #startUptime() {
    this.#refreshUptime();
    this.#uptimeTimer = setInterval(() => this.#refreshUptime(), 1000);
  }

  #stopUptime() {
    if (this.#uptimeTimer !== null) {
      clearInterval(this.#uptimeTimer);
      this.#uptimeTimer = null;
    }
  }

  #refreshUptime() {
    if (!this.#evolution || !this.#panel) return;
    const el = this.#panel.querySelector('.guide-panel__uptime');
    if (el) el.textContent = formatDuration(this.#evolution.lifetime);
  }

  /** Inject SVGs into every [data-guide-icon] slot in the panel. */
  async #populateIcons() {
    this.#iconsLoaded = true;
    const slots = this.#panel.querySelectorAll('[data-guide-icon]');
    await Promise.all(Array.from(slots).map(async (slot) => {
      try {
        slot.innerHTML = await loadIcon(slot.dataset.guideIcon);
      } catch {
        // Silent fail — slot stays empty
      }
    }));
  }
}
