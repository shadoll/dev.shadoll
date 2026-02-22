/**
 * evolution.js
 * Orchestrates the icon evolution system:
 *
 *  1. Spawning — after a random interval (SPAWN_DELAY_MIN … SPAWN_DELAY_MAX),
 *     an icon appears at a random viewport position.  Cells only appear
 *     spontaneously when fewer than MIN_CELL_COUNT exist; otherwise new cells
 *     come from division.  Bugs still spawn on the timer when the rarity roll
 *     passes and the live bug cap isn't reached.
 *
 *  2. Physics loop — a single rAF loop drives all live entities each frame.
 *     After every position update, entity pairs are checked for collisions.
 *
 *  3. Cell division — each cell carries a countdown timer.  When it reaches
 *     zero the cell divides: an offspring entity is spawned nearby with a
 *     mutated copy of the parent's DNA.
 *
 *  4. Collision response — overlapping entities receive an elastic velocity
 *     impulse (equal-mass reflection), are pushed apart, and both call onHit()
 *     to shift their hue colour.  If a "bug" entity collides with a non-immune
 *     entity, the target is infected and transforms into "virus-filled" with
 *     DNA potentially derived from the host cell.  Viruses may be blocked by
 *     a cell's shield gene or have their kill chance reduced by resistance.
 *
 *  5. Speed control — setMoveSpeed(1–10) scales entity velocity in real time.
 *
 * The icon to spawn first is declared in icons.json under spawn.initial.
 * All icon metadata (type, colour) is also read from icons.json.
 */

import { Entity }        from './entity.js';
import { DNA }           from './dna.js';
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

  /**
   * Lightweight snapshot of every live (non-dying) entity's identity and DNA.
   * Used by PopulationPanelController to compute species + mutation stats.
   *
   * @returns {Array<{ key: string, dna: import('./dna.js').DNA }>}
   */
  getEntityDetails() {
    return this.#entities
      .filter(e => e.alive && !e.dying)
      .map(e => ({ key: e.entityKey, dna: e.dna }));
  }

  /**
   * Return a summary of every registered entity type (from icons.json).
   * Available after init() resolves.
   *
   * @returns {Array<{ key: string, label: string, type: string, color: string }>}
   */
  getSpawnableEntities() {
    if (!this.#iconsData) return [];
    return Object.entries(this.#iconsData.icons).map(([key, meta]) => ({
      key,
      label: meta.label ?? key,
      type:  meta.type,
      color: this.#iconsData.types[meta.type]?.color ?? '#ffffff',
    }));
  }

  /**
   * Spawn an entity by name, pre-seeding its DNA with the named genes.
   * For entity types that don't support DNA (bugs, bacteria) the genes
   * parameter is ignored and the entity spawns with empty DNA.
   *
   * @param {string}   iconName   key in icons.json
   * @param {string[]} geneNames  gene names to pre-activate (from GENE_DEFS)
   */
  async spawnNamedWithDna(iconName, geneNames = []) {
    if (!this.#container || !this.#iconsData) return;
    const iconMeta = this.#iconsData.icons[iconName];
    if (!iconMeta) return;
    const typeMeta = this.#iconsData.types[iconMeta.type];
    if (!typeMeta) return;

    const dna   = DNA.withGenes(geneNames);
    let   color = typeMeta.color;

    // Apply DNA-derived colour for entity types that support it
    if (dna.size > 0) {
      const base = { cell: { h: 133, s: 100, l: 83 }, 'virus-filled': { h: 350, s: 100, l: 65 } }[iconName];
      if (base) color = dna.computeColor(base.h, base.s, base.l);
    }

    const margin = DEFAULTS.ICON_SIZE * 2;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const angle  = Math.random() * Math.PI * 2;

    const entity = new Entity({
      name:  iconName,
      type:  iconMeta.type,
      color,
      dna,
      x:  margin + Math.random() * (vw - margin * 2),
      y:  margin + Math.random() * (vh - margin * 2),
      vx: Math.cos(angle) * DEFAULTS.BASE_SPEED,
      vy: Math.sin(angle) * DEFAULTS.BASE_SPEED,
    });

    this.#incrementTotal(iconName);
    await entity.mount(this.#container);
    if (entity.alive) this.#entities.push(entity);
  }

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

  /**
   * Create and mount one icon entity at a random viewport position.
   *
   * Bugs: spawn when the rarity roll passes and the live bug count is below max.
   * Cells: only spawn spontaneously when fewer than MIN_CELL_COUNT exist;
   *        above that threshold, new cells come exclusively from division.
   */
  async #spawnEntity() {
    if (!this.#container || !this.#iconsData) return;

    const { initial, rare } = this.#iconsData.spawn;
    let name = null;

    // Roll for bug spawn first
    if (rare && Math.random() < this.#bugSpawnChance) {
      const liveBugs = this.#entities.filter(e => e.entityKey === 'bug').length;
      if (liveBugs < this.#bugMaxCount) name = rare;
    }

    // Spontaneous cell spawn only when population is critically low
    if (!name) {
      const liveCells = this.#entities.filter(e => e.entityKey === 'cell').length;
      if (liveCells < DEFAULTS.MIN_CELL_COUNT) name = initial;
    }

    // Nothing to spawn this cycle
    if (!name) return;

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
      this.#incrementTotal(name);
    }
  }

  /**
   * Mount and register a child entity produced by cell division.
   * Fire-and-forget async — called from the synchronous tick loop.
   *
   * @param {{ name: string, type: string, color: string, dna: DNA,
   *            x: number, y: number, vx: number, vy: number }} config
   */
  async #spawnOffspring(config) {
    if (!this.#container) return;
    const entity = new Entity(config);
    await entity.mount(this.#container);
    if (entity.alive) {
      this.#entities.push(entity);
      this.#incrementTotal(config.name);
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

      // ── Cell division ──────────────────────────────────────
      // Collect cells that have completed their division timer this frame.
      // Reset the timer immediately (before async spawn) so the cell doesn't
      // trigger again before its offspring finishes mounting.
      if (this.#entities.length < DEFAULTS.MAX_POPULATION) {
        for (const entity of this.#entities) {
          if (entity.wantsToDivide) {
            entity.resetDivision();
            this.#spawnOffspring(entity.divide());
          }
        }
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
   *     into "virus-filled" with DNA derived from the host cell.
   *  5. If one entity is "virus-filled", it may kill or mutate the target,
   *     subject to the target's shield and resistance genes.
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
        // When infecting a cell, the resulting virus receives DNA derived from
        // the host (see DNA.forVirus) implementing the arms-race mechanic.
        // Touching a virus cures it back to a cell.
        if (!this.#iconsData) continue;
        const virusMeta  = this.#iconsData.icons['virus-filled'];
        const virusColor = virusMeta
          ? (this.#iconsData.types[virusMeta.type]?.color ?? '#ff4d6d')
          : '#ff4d6d';

        const cellMeta  = this.#iconsData.icons['cell'];
        const cellColor = cellMeta
          ? (this.#iconsData.types[cellMeta.type]?.color ?? '#a8ffb8')
          : '#a8ffb8';
        const bugImmune = new Set(['bug', 'bacteria']);

        if (a.entityKey === 'bug') {
          if (b.entityKey === 'virus-filled') {
            b.infectWith('cell', cellColor, { force: true });
          } else if (!bugImmune.has(b.entityKey)) {
            b.infectWith('virus-filled', virusColor, { dna: DNA.forVirus(b.dna) });
          }
        } else if (b.entityKey === 'bug') {
          if (a.entityKey === 'virus-filled') {
            a.infectWith('cell', cellColor, { force: true });
          } else if (!bugImmune.has(a.entityKey)) {
            a.infectWith('virus-filled', virusColor, { dna: DNA.forVirus(a.dna) });
          }
        }

        // ── Virus kill / mutation ──────────────────────────────
        // virus-filled hitting a non-immune entity: the target may die or mutate.
        // The collision normal (nx, ny) points from a → b; we use it to compute
        // the approach angle so the target's shield gene can be evaluated.
        const virusImmune = new Set(['bug', 'virus-filled', 'bacteria']);
        const aIsVirus = a.entityKey === 'virus-filled';
        const bIsVirus = b.entityKey === 'virus-filled';

        if (aIsVirus && !virusImmune.has(b.entityKey)) {
          // Virus (a) approaches target (b): virus is on the -normal side of b.
          // approachAngle = direction from which virus arrives, seen from b.
          const approachAngle = Math.atan2(-ny, -nx);
          this.#resolveVirusContact(a, b, approachAngle);
        } else if (bIsVirus && !virusImmune.has(a.entityKey)) {
          // Virus (b) approaches target (a): virus is on the +normal side of a.
          const approachAngle = Math.atan2(ny, nx);
          this.#resolveVirusContact(b, a, approachAngle);
        }
      }
    }
  }

  // ── Virus contact resolution ─────────────────────────────────

  /**
   * Handle a collision between a virus-filled entity and a vulnerable target.
   *
   * The target's DNA is consulted before applying damage:
   *
   *   Shield gene — blocks the attack if the virus is approaching from within
   *                 the cell's front arc (direction of motion ± shieldHalfWidth).
   *                 A full-strength shield blocks a ±90° cone.
   *
   *   Resistance gene — reduces the effective kill chance:
   *                 effectiveKill = max(0, baseKill − resistance)
   *
   * If the kill roll fails the cell survives unharmed (bacteria path disabled).
   *
   * @param {Entity} virus          the virus-filled entity
   * @param {Entity} target         the entity being contacted
   * @param {number} approachAngle  angle (radians) the virus arrives from,
   *                                as seen from the target's frame
   */
  #resolveVirusContact(virus, target, approachAngle) {
    // ── Shield check ───────────────────────────────────────
    const shieldStrength = target.dna.get('shield');
    if (shieldStrength > 0) {
      const spd = Math.hypot(target.vx, target.vy);
      if (spd > 0.01) {
        // Shield faces forward (direction of motion)
        const frontAngle = Math.atan2(target.vy, target.vx);
        const halfWidth  = shieldStrength * (Math.PI / 2);

        let diff = approachAngle - frontAngle;
        // Normalise to -π … π
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) < halfWidth) {
          // Attack blocked by shield — entity survives unaffected
          return;
        }
      }
    }

    // ── Resistance check ───────────────────────────────────
    const resistance  = target.dna.get('resistance');
    const killChance  = Math.max(0, this.#virusKillChance - resistance);

    // Also apply virus lethality bonus (arms-race gene)
    const lethalBonus = virus.dna.get('lethality');
    const effectiveKill = Math.min(1, killChance + lethalBonus);

    if (Math.random() < effectiveKill) {
      target.die();
    }
    // Bacteria mutation path disabled — better logic needed.
    // When the kill roll fails the cell simply survives unharmed.
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
            dna:      e.dna ? e.dna.serialise() : {},
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

        const dna = DNA.deserialise(s.dna ?? {});

        const entity = new Entity({
          name:     s.name,
          type:     iconMeta.type,
          color:    typeMeta.color,
          x:        s.x,
          y:        s.y,
          vx:       s.vx,
          vy:       s.vy,
          rotation: s.rotation,
          dna,
        });

        await entity.mount(this.#container);

        if (entity.alive) {
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
