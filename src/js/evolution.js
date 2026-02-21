/**
 * evolution.js
 * Orchestrates the icon evolution system:
 *
 *  1. Spawning — after a random interval (SPAWN_DELAY_MIN … SPAWN_DELAY_MAX),
 *     an icon appears at a random viewport position.  Most spawns produce the
 *     "initial" icon (cell); with rareChance probability the rare
 *     "bug" icon spawns instead.
 *
 *  2. Physics loop — a single rAF loop drives all live entities each frame.
 *     After every position update, entity pairs are checked for collisions.
 *
 *  3. Collision response — overlapping entities receive an elastic velocity
 *     impulse (equal-mass reflection), are pushed apart, and both call onHit()
 *     to shift their hue colour.  If a "bug" entity collides with a non-immune
 *     entity, the target is infected and transforms into "virus-filled".
 *
 *  4. Speed control — setMoveSpeed(1–10) scales entity velocity in real time.
 *
 * The icon to spawn first is declared in icons.json under spawn.initial.
 * All icon metadata (type, colour) is also read from icons.json.
 */

import { Entity }        from './entity.js';
import { preloadIcons }  from './iconLoader.js';
import { DEFAULTS }      from './constants.js';

const ICONS_DATA_URL        = 'src/data/icons.json';
const EVOLUTION_STORAGE_KEY = 'devpage:evolution';

export class EvolutionController {
  /** @type {Entity[]} */          #entities        = [];
  /** Cumulative counts of every icon ever created (since last clear or load). */
  /** @type {Record<string,number>} */ #totalCounts    = {};
  /** @type {HTMLElement|null} */  #container       = null;
  /** @type {number} */            #moveSpeed       = DEFAULTS.MOVE_SPEED;
  /** @type {number} */            #spawnRate       = 5;
  /** @type {number} */            #virusKillChance = DEFAULTS.VIRUS_KILL_CHANCE;
  /** @type {number} */            #bugSpawnChance  = DEFAULTS.BUG_SPAWN_CHANCE;
  /** @type {number} */            #bugMaxCount     = DEFAULTS.BUG_MAX_COUNT;
  /** @type {number} */            #startTime       = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */ #spawnTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */ #saveTimer = null;
  /** @type {number|null} */       #animFrame = null;
  /** @type {boolean} */           #running   = false;
  /** @type {object|null} */       #iconsData = null;
  /** @type {import('./logoController.js').LogoController|null} */ #logo = null;
  /** @type {object|null} */       #savedLogoState = null;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialise: load icon data, warm SVG cache, kick off spawning & loop.
   *
   * @param {HTMLElement} container  All entity DOM nodes are appended here.
   */
  async init(container) {
    this.#container = container;

    this.#iconsData = await this.#loadIconsData();

    // Warm the SVG cache for both the normal and rare icons so first spawns are instant
    const { initial, rare } = this.#iconsData.spawn;
    const toPreload = [initial];
    if (rare) toPreload.push(rare);
    // Also preload virus-filled and bacteria so transforms are instant
    if (this.#iconsData.icons['virus-filled']) toPreload.push('virus-filled');
    if (this.#iconsData.icons['bacteria'])     toPreload.push('bacteria');
    preloadIcons(toPreload);

    this.#startTime = Date.now();

    // Restore any previously saved entity state before the spawner kicks off
    await this.#restoreState();

    this.#scheduleNextSpawn();
    this.#startLoop();

    // Persist entity state to localStorage every 2 s
    this.#saveTimer = setInterval(() => this.#saveState(), 2000);
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

  /** Current move speed setting (1–50). Used by SettingsController to sync UI on boot. */
  get moveSpeed() { return this.#moveSpeed; }

  /** Spawn frequency (1 = rare / slow, 10 = frequent / fast). */
  setSpawnRate(rate) { this.#spawnRate = rate; }
  get spawnRate()    { return this.#spawnRate; }

  /** Probability (0–1) that a virus contact kills its target. */
  setVirusKillChance(v) { this.#virusKillChance = v; }
  get virusKillChance() { return this.#virusKillChance; }

  /** Probability (0–1) that a rare-bug icon spawns instead of the normal icon. */
  setBugSpawnChance(v) { this.#bugSpawnChance = v; }
  get bugSpawnChance() { return this.#bugSpawnChance; }

  /** Max number of bug entities allowed alive at the same time (0 = no bugs). */
  setBugMaxCount(n) { this.#bugMaxCount = n; }
  get bugMaxCount()  { return this.#bugMaxCount; }

  /** Milliseconds elapsed since init() was called. */
  get lifetime() { return this.#startTime ? Date.now() - this.#startTime : 0; }

  /** Count of live entities grouped by entityKey. */
  getCounts() {
    /** @type {Record<string,number>} */
    const counts = {};
    for (const e of this.#entities) {
      counts[e.entityKey] = (counts[e.entityKey] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Manually spawn a specific icon by name at a random viewport position.
   * Used by the guide panel when the user clicks an entity row.
   *
   * @param {string} iconName  Key from icons.json (e.g. 'cell', 'bug')
   */
  async spawnNamed(iconName) {
    if (!this.#container || !this.#iconsData) return;
    const iconMeta = this.#iconsData.icons[iconName];
    if (!iconMeta) return;
    const typeMeta = this.#iconsData.types[iconMeta.type];
    // track total count
    this.#incrementTotal(iconName);

    const margin = DEFAULTS.ICON_SIZE * 2;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const x      = margin + Math.random() * (vw - margin * 2);
    const y      = margin + Math.random() * (vh - margin * 2);
    const angle  = Math.random() * Math.PI * 2;

    const entity = new Entity({
      name: iconName, type: iconMeta.type, color: typeMeta.color,
      x, y,
      vx: Math.cos(angle) * DEFAULTS.BASE_SPEED,
      vy: Math.sin(angle) * DEFAULTS.BASE_SPEED,
    });

    await entity.mount(this.#container);
    if (entity.alive) this.#entities.push(entity);
  }

  /** Remove all entities from the screen without stopping the physics loop. */
  clear() {
    this.#entities.forEach(e => e.destroy());
    this.#entities = [];
    this.#startTime = Date.now(); // reset lifetime counter
    // also clear total counts
    this.#totalCounts = {};

    // also tell the logo word to forget its bump counts; the visual labels
    // should go back to `0` immediately
    this.#logo?.resetCounters();
    this.#logo?.resetThresholds();

    // Wipe saved state so a page reload starts fresh
    try { localStorage.removeItem(EVOLUTION_STORAGE_KEY); } catch { /* ignore */ }

    // notify anyone listening (settings controller) that evolution was cleared
    document.dispatchEvent(new Event('evolutionCleared'));
  }

  /** Stop all timers and the rAF loop; remove all entities from the DOM. */
  stop() {
    this.#running = false;
    if (this.#spawnTimer !== null) clearTimeout(this.#spawnTimer);
    if (this.#animFrame  !== null) cancelAnimationFrame(this.#animFrame);
    if (this.#saveTimer  !== null) clearInterval(this.#saveTimer);
    this.#entities.forEach(e => e.destroy());
    this.#entities = [];
  }

  /**
   * Wire in a LogoController so the rAF loop drives it.
   * Must be called after logo.init() completes.
   *
   * @param {import('./logoController.js').LogoController} logo
   */
  setLogoController(logo) { this.#logo = logo; }

  /**
   * Saved logo state read from localStorage — passed to LogoController.init().
   * Available after init() resolves; null on first ever load.
   */
  get savedLogoState() { return this.#savedLogoState; }

  /** Read-only access to current entity count (useful for debugging). */
  get entityCount() { return this.#entities.length; }

  /** Cumulative totals for each icon (spawned/mutated) since last clear or load. */
  get totalCounts() { return { ...this.#totalCounts }; }

  // ── Spawning ────────────────────────────────────────────────

  /**
   * Private helper: increment the all‑time count for an icon.
   *
   * @param {string} name
   */
  #incrementTotal(name) {
    if (!name) return;
    this.#totalCounts[name] = (this.#totalCounts[name] || 0) + 1;
  }

  /**
   * Schedule the next spawn after a random delay within the configured range.
   * Self-resets after each spawn so the process continues indefinitely.
   */
  #scheduleNextSpawn() {
    // Exponential scale: rate 5 → default delays; higher rate → shorter delays.
    const factor = Math.pow(this.#spawnRate / 5, 1.5);
    const min    = Math.max(300,  Math.round(DEFAULTS.SPAWN_DELAY_MIN / factor));
    const max    = Math.max(1500, Math.round(DEFAULTS.SPAWN_DELAY_MAX / factor));
    const delay  = min + Math.random() * (max - min);

    this.#spawnTimer = setTimeout(async () => {
      await this.#spawnEntity();
      this.#scheduleNextSpawn();
    }, delay);
  }

  /** Create and mount one icon entity at a random viewport position. */
  async #spawnEntity() {
    if (!this.#container || !this.#iconsData) return;

    // Decide whether this spawn is a bug or the normal icon.
    // A bug only spawns if the rarity roll passes AND the live bug cap isn't reached.
    const { initial, rare } = this.#iconsData.spawn;
    let name = initial;
    if (rare && Math.random() < this.#bugSpawnChance) {
      const liveBugs = this.#entities.filter(e => e.entityKey === 'bug').length;
      if (liveBugs < this.#bugMaxCount) name = rare;
    }

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
      // record spawn for totals
      this.#incrementTotal(name);
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

      // Advance logo word + ejected letter physics
      this.#logo?.update(multiplier);

      // Check and resolve entity-to-entity collisions after all positions updated
      this.#checkCollisions();

      // Check entity-vs-logo-letter collisions
      this.#logo?.checkCollisionsWithEntities(this.#entities);

      // Prune entities that died this frame (virus killed by mutation, slow-death complete)
      if (this.#entities.some(e => !e.alive)) {
        this.#entities = this.#entities.filter(e => e.alive);
      }

      this.#animFrame = requestAnimationFrame(tick);
    };

    this.#animFrame = requestAnimationFrame(tick);
  }

  // ── Collision detection ─────────────────────────────────────

  /**
   * O(n²) broad + narrow-phase collision check for all entity pairs.
   *
   * On overlap:
   *  1. Elastic velocity impulse along the collision normal (equal-mass reflection).
   *  2. Positional correction — push both entities apart so they no longer overlap.
   *  3. Both entities call onHit() to shift their hue colour.
   *  4. If one entity is the rare "bug", the other is infected and transforms
   *     into "virus-filled" (unless it's already a bug or virus).
   */
  #checkCollisions() {
    const entities = this.#entities;
    const diameter = DEFAULTS.COLLISION_DIAMETER;

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        if (!a.alive || !b.alive || a.dying || b.dying) continue;

        const dx   = b.x - a.x;
        const dy   = b.y - a.y;
        const dist = Math.hypot(dx, dy);

        if (dist >= diameter || dist === 0) continue; // no collision

        // ── Collision normal (unit vector from a → b) ──────────
        const nx = dx / dist;
        const ny = dy / dist;

        // ── Elastic impulse along normal ───────────────────────
        // Bug collisions: only the bug's velocity reflects — the entity it hits
        // keeps its direction (bug is the "ghost" infector, not a physics partner).
        // Normal collisions: equal-mass exchange.
        const aIsBug = a.entityKey === 'bug';
        const bIsBug = b.entityKey === 'bug';
        const dot = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (dot > 0) {
          if (aIsBug || bIsBug) {
            if (aIsBug) { a.vx -= dot * nx; a.vy -= dot * ny; }
            else        { b.vx += dot * nx; b.vy += dot * ny; }
          } else {
            a.vx -= dot * nx;   a.vy -= dot * ny;
            b.vx += dot * nx;   b.vy += dot * ny;
          }
        }

        // ── Positional correction — push apart equally ─────────
        const half = (diameter - dist) / 2;
        a.x -= half * nx;   a.y -= half * ny;
        b.x += half * nx;   b.y += half * ny;

        // ── Visual feedback — hue shift for non-bug collisions only ───
        // Bug passes through entities silently (no hue flash on target).
        if (!aIsBug && !bIsBug) {
          a.onHit();
          b.onHit();
        } else if (aIsBug) {
          a.onHit();
        } else {
          b.onHit();
        }

        // ── Bug infection ──────────────────────────────────────
        // The rare "bug" transforms any non-immune entity into "virus-filled".
        if (!this.#iconsData) continue;
        const virusMeta  = this.#iconsData.icons['virus-filled'];
        const virusColor = virusMeta
          ? (this.#iconsData.types[virusMeta.type]?.color ?? '#ff4d6d')
          : '#ff4d6d';

        // bug + normal entity → infects with virus
        // bug + virus-filled → backwards-transforms virus back to cell (cure)
        const cellMeta  = this.#iconsData.icons['cell'];
        const cellColor = cellMeta
          ? (this.#iconsData.types[cellMeta.type]?.color ?? '#a8ffb8')
          : '#a8ffb8';
        const bugImmune = new Set(['bug', 'bacteria']);

        if (a.entityKey === 'bug') {
          if (b.entityKey === 'virus-filled') {
            b.infectWith('cell', cellColor, { force: true });
          } else if (!bugImmune.has(b.entityKey)) {
            b.infectWith('virus-filled', virusColor);
          }
        } else if (b.entityKey === 'bug') {
          if (a.entityKey === 'virus-filled') {
            a.infectWith('cell', cellColor, { force: true });
          } else if (!bugImmune.has(a.entityKey)) {
            a.infectWith('virus-filled', virusColor);
          }
        }

        // ── Virus kill / mutation ──────────────────────────────
        // virus-filled hitting a non-immune entity: the target may die or mutate.
        // On a failed kill roll the contact will convert the target into bacteria
        // (10% shown in the guide) if that icon exists.  Bacteria are immune to
        // subsequent virus or bug interactions.
        const virusImmune = new Set(['bug', 'virus-filled', 'bacteria']);
        const aIsVirus = a.entityKey === 'virus-filled';
        const bIsVirus = b.entityKey === 'virus-filled';

        if (aIsVirus && !virusImmune.has(b.entityKey)) {
          this.#resolveVirusContact(a, b);
        } else if (bIsVirus && !virusImmune.has(a.entityKey)) {
          this.#resolveVirusContact(b, a);
        }
      }
    }
  }

  // ── Virus contact resolution ─────────────────────────────────

  /**
   * Handle a collision between a virus-filled entity and a vulnerable target.
   *
   * 50%–100% of the time (controlled by virusKillChance) the target is killed.
   * On the remaining rolls the virus fails to kill and the contact triggers a
   * rare mutation: the target becomes a "bacteria" entity if that icon is
   * defined.  Bacteria are immune to further virus attacks and bugs.
   *
   * @param {import('./entity.js').Entity} _virus  the virus-filled entity (unused)
   * @param {import('./entity.js').Entity} target  the entity being contacted
   */
  #resolveVirusContact(_virus, target) {
    if (Math.random() < this.#virusKillChance) {
      target.die();
    } else {
      // mutation path – only if bacteria is registered
      if (this.#iconsData && this.#iconsData.icons['bacteria']) {
        const bacMeta = this.#iconsData.icons['bacteria'];
        const bacColor = this.#iconsData.types[bacMeta.type]?.color || '#80ffee';
        target.infectWith('bacteria', bacColor, { force: true });
      }
    }
  }

  // ── State persistence ────────────────────────────────────────

  /** Serialise all live (non-dying) entities + startTime to localStorage. */
  #saveState() {
    try {
      const snapshot = {
        startTime: this.#startTime,
        entities:  this.#entities
          .filter(e => e.alive && !e.dying)
          .map(e => ({
            name:     e.entityKey,
            x:        e.x,
            y:        e.y,
            vx:       e.vx,
            vy:       e.vy,
            rotation: e.rotation,
            hueShift: e.hueShift,
          })),
        logo: this.#logo?.serialise() ?? null,
        totalCounts: this.#totalCounts,
      };
      localStorage.setItem(EVOLUTION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch { /* quota exceeded — ignore */ }
  }

  /**
   * Recreate entities from a previously saved localStorage snapshot.
   * Called once during init(), before the spawner starts.
   */
  async #restoreState() {
    try {
      const raw = localStorage.getItem(EVOLUTION_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;

      // Restore elapsed time so lifetime continues across reloads
      if (typeof saved.startTime === 'number') {
        this.#startTime = saved.startTime;
      }

      // Stash logo state so main.js can pass it to LogoController.init()
      if (saved.logo && typeof saved.logo === 'object') {
        this.#savedLogoState = saved.logo;
      }

      // determine whether we'll need to rebuild totals from the entity list
      let buildTotalsFromEntities = false;
      if (
        saved.totalCounts &&
        typeof saved.totalCounts === 'object' &&
        Object.keys(saved.totalCounts).length > 0
      ) {
        // existing totals present
        this.#totalCounts = { ...saved.totalCounts };
      } else {
        // no meaningful totals stored; rebuild from entity list below
        buildTotalsFromEntities = true;
      }

      const entities = saved.entities;
      if (!Array.isArray(entities) || entities.length === 0) return;

      await Promise.all(entities.map(async (s) => {
        if (!this.#iconsData || !this.#container) return;
        const iconMeta = this.#iconsData.icons[s.name];
        if (!iconMeta) return;
        const typeMeta = this.#iconsData.types[iconMeta.type];
        if (!typeMeta) return;

        const entity = new Entity({
          name:     s.name,
          type:     iconMeta.type,
          color:    typeMeta.color,
          x:        s.x,
          y:        s.y,
          vx:       s.vx,
          vy:       s.vy,
          rotation: s.rotation,
        });

        await entity.mount(this.#container);

        if (entity.alive) {
          // Restore accumulated hue-rotate from collisions
          if (s.hueShift && entity.bodyEl) {
            entity.hueShift = s.hueShift;
            entity.bodyEl.style.filter =
              `hue-rotate(${s.hueShift}deg) drop-shadow(0 1px 6px rgba(0,0,0,0.35))`;
          }
          this.#entities.push(entity);
          // if the snapshot didn't already include totals, count this entity now
          if (buildTotalsFromEntities) {
            this.#incrementTotal(s.name);
          }
        }
      }));

      // make sure totals are at least as large as the current restored population
      const restored = this.getCounts();
      for (const [key, num] of Object.entries(restored)) {
        this.#totalCounts[key] = Math.max(this.#totalCounts[key] || 0, num);
      }
    } catch { /* corrupt save — start fresh */ }
  }

  // ── Data loading ────────────────────────────────────────────

  /** Fetch and return the icons.json configuration. */
  async #loadIconsData() {
    const res = await fetch(ICONS_DATA_URL);
    if (!res.ok) throw new Error(`[EvolutionController] Failed to load ${ICONS_DATA_URL}`);
    return res.json();
  }
}
