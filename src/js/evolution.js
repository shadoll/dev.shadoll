/**
 * evolution.js
 * Orchestrates the icon evolution system:
 *
 *  1. Spawning — after a random interval (SPAWN_DELAY_MIN … SPAWN_DELAY_MAX),
 *     a dna-bold-duotone icon appears at a random viewport position.
 *     After each spawn the timer resets for the next one.
 *
 *  2. Physics loop — a single rAF loop drives all live entities each frame.
 *
 *  3. Speed control — setMoveSpeed(1–10) scales entity velocity in real time.
 *
 * The icon to spawn first is declared in icons.json under spawn.initial.
 * All icon metadata (type, colour) is also read from icons.json.
 */

import { Entity }        from './entity.js';
import { preloadIcons }  from './iconLoader.js';
import { DEFAULTS }      from './constants.js';

const ICONS_DATA_URL = 'src/data/icons.json';

export class EvolutionController {
  /** @type {Entity[]} */          #entities  = [];
  /** @type {HTMLElement|null} */  #container = null;
  /** @type {number} */            #moveSpeed = DEFAULTS.MOVE_SPEED;
  /** @type {ReturnType<typeof setTimeout>|null} */ #spawnTimer = null;
  /** @type {number|null} */       #animFrame = null;
  /** @type {boolean} */           #running   = false;
  /** @type {object|null} */       #iconsData = null;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialise: load icon data, warm SVG cache, kick off spawning & loop.
   *
   * @param {HTMLElement} container  All entity DOM nodes are appended here.
   */
  async init(container) {
    this.#container = container;

    this.#iconsData = await this.#loadIconsData();

    // Warm the SVG cache for the initial icon so first spawn is instant
    const initialName = this.#iconsData.spawn.initial;
    preloadIcons([initialName]);

    this.#scheduleNextSpawn();
    this.#startLoop();
  }

  /**
   * Update the movement speed multiplier used by all entities.
   * Maps slider value (1–10) to a physics multiplier around 1.0 at speed 5.
   *
   * @param {number} speed  integer 1–10
   */
  setMoveSpeed(speed) {
    this.#moveSpeed = speed;
  }

  /** Stop all timers and the rAF loop; remove all entities from the DOM. */
  stop() {
    this.#running = false;
    if (this.#spawnTimer !== null) clearTimeout(this.#spawnTimer);
    if (this.#animFrame  !== null) cancelAnimationFrame(this.#animFrame);
    this.#entities.forEach(e => e.destroy());
    this.#entities = [];
  }

  /** Read-only access to current entity count (useful for debugging). */
  get entityCount() { return this.#entities.length; }

  // ── Spawning ────────────────────────────────────────────────

  /**
   * Schedule the next spawn after a random delay within the configured range.
   * Self-resets after each spawn so the process continues indefinitely.
   */
  #scheduleNextSpawn() {
    const min   = DEFAULTS.SPAWN_DELAY_MIN;
    const max   = DEFAULTS.SPAWN_DELAY_MAX;
    const delay = min + Math.random() * (max - min);

    this.#spawnTimer = setTimeout(async () => {
      await this.#spawnEntity();
      this.#scheduleNextSpawn();
    }, delay);
  }

  /** Create and mount one icon entity at a random viewport position. */
  async #spawnEntity() {
    if (!this.#container || !this.#iconsData) return;

    const name     = this.#iconsData.spawn.initial;
    const iconMeta = this.#iconsData.icons[name];
    const typeMeta = this.#iconsData.types[iconMeta.type];

    // Random spawn position — keep a margin so the icon starts fully on-screen
    const margin = DEFAULTS.ICON_SIZE * 2;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const x      = margin + Math.random() * (vw - margin * 2);
    const y      = margin + Math.random() * (vh - margin * 2);

    // Random initial direction, normalised to BASE_SPEED
    const angle = Math.random() * Math.PI * 2;
    const vx    = Math.cos(angle) * DEFAULTS.BASE_SPEED;
    const vy    = Math.sin(angle) * DEFAULTS.BASE_SPEED;

    const entity = new Entity({
      name, type: iconMeta.type, color: typeMeta.color,
      x, y, vx, vy,
    });

    await entity.mount(this.#container);

    if (entity.alive) {
      this.#entities.push(entity);
    }
  }

  // ── Physics loop ────────────────────────────────────────────

  #startLoop() {
    this.#running = true;

    const tick = () => {
      if (!this.#running) return;

      // speedMultiplier: normalised so that slider=5 → multiplier=1.0
      const multiplier = this.#moveSpeed / DEFAULTS.MOVE_SPEED;

      for (const entity of this.#entities) {
        entity.update(multiplier);
      }

      this.#animFrame = requestAnimationFrame(tick);
    };

    this.#animFrame = requestAnimationFrame(tick);
  }

  // ── Data loading ────────────────────────────────────────────

  /** Fetch and return the icons.json configuration. */
  async #loadIconsData() {
    const res = await fetch(ICONS_DATA_URL);
    if (!res.ok) throw new Error(`[EvolutionController] Failed to load ${ICONS_DATA_URL}`);
    return res.json();
  }
}
