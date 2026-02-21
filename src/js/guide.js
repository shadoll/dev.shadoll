/**
 * guide.js
 * GuideController — manages the evolution guide panel.
 *
 * The panel lives in the DOM (HTML), always hidden.
 * On first open, guide.js fetches and injects SVG icons into
 * [data-guide-icon] slots so the panel shows actual game icons.
 *
 * While the panel is open, a 200 ms interval keeps entity population
 * counts and the system uptime display live.
 *
 * Behaviour:
 *  - Guide button (bottom-right): click to open/close.
 *  - Click outside the panel: closes it.
 *  - Escape key: closes it.
 *  - Clicking an entity row spawns that entity at a random position.
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
  /** @type {ReturnType<typeof setInterval>|null} */ #statsTimer = null;

  /**
   * Attach event listeners. Must be called after DOM is ready.
   *
   * @param {import('./evolution.js').EvolutionController} [evolution]
   *   Optional — if provided, clicking an entity row will spawn that entity
   *   and the panel will show live population counts + system uptime.
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
      if (this.#open && !this.#panel.contains(e.target)) this.close();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#open) this.close();
    });

    // Entity row clicks → spawn that entity
    if (this.#evolution) this.#bindEntityClicks();

    // Restart button → clear all entities + saved state
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
    if (this.#evolution) this.#startLiveUpdate();
  }

  close() {
    this.#open = false;
    this.#panel.classList.remove('guide-panel--visible');
    this.#panel.setAttribute('aria-hidden', 'true');
    this.#btn.setAttribute('aria-expanded', 'false');
    this.#stopLiveUpdate();
  }

  // ── Private ─────────────────────────────────────────────────

  /** Wire each .guide-entity row to spawn that entity on click. */
  #bindEntityClicks() {
    this.#panel.querySelectorAll('.guide-entity').forEach(item => {
      const slot = item.querySelector('[data-guide-icon]');
      if (!slot) return;
      const iconName = slot.dataset.guideIcon;
      item.addEventListener('click', () => this.#evolution.spawnNamed(iconName));
    });
  }

  /** Start a 200 ms interval that refreshes counts + uptime while the panel is open. */
  #startLiveUpdate() {
    this.#refreshStats();
    this.#statsTimer = setInterval(() => this.#refreshStats(), 200);
  }

  #stopLiveUpdate() {
    if (this.#statsTimer !== null) {
      clearInterval(this.#statsTimer);
      this.#statsTimer = null;
    }
  }

  /** Push current entity counts and system lifetime into the panel DOM. */
  #refreshStats() {
    if (!this.#evolution || !this.#panel) return;

    const counts   = this.#evolution.getCounts();
    const lifetime = this.#evolution.lifetime;

    // Update per-entity count badges
    this.#panel.querySelectorAll('[data-count-key]').forEach(item => {
      const el = item.querySelector('.guide-entity__count');
      if (el) el.textContent = String(counts[item.dataset.countKey] ?? 0);
    });

    // Update uptime display
    const uptimeEl = this.#panel.querySelector('.guide-panel__uptime');
    if (uptimeEl) uptimeEl.textContent = formatDuration(lifetime);
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
