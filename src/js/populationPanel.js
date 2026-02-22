/**
 * populationPanel.js
 * PopulationPanelController — live entity monitor with DNA variant history.
 *
 * Opened via the ⊕ button (top-right, below settings).
 *
 * Panel sections:
 *   species  — for each entity type, shows a header row with the live count,
 *              then one sub-row per observed DNA variant.  Variants that have
 *              gone extinct remain visible (dimmed) so you can read the
 *              evolutionary history: which gene combinations appeared, which
 *              survived, and which died out.
 *
 *              Variant sub-row format:
 *                ● SP1.2 SH0.8    2 / 3
 *                ↑ coloured dot   ↑ live / peak count
 *
 *              Gene shortcodes:  SP speed · RS resistance · SH shield
 *                                DI division rate · HS hunt speed · LT lethality
 *
 *   spawn    — one row per registered entity type with a [+] button.
 *              For cells and viruses: gene checkboxes pre-seed the spawned DNA.
 *
 * #seenVariants tracks every gene-name combination ever observed and persists
 * until the evolution is cleared (evolutionCleared event).
 */

import { loadIcon } from './iconLoader.js';
import { GENE_DEFS, DNA } from './dna.js';

// ── Gene display helpers ───────────────────────────────────────────────────

const GENE_SHORT = {
  speed:         'SP',
  resistance:    'RS',
  shield:        'SH',
  division_rate: 'DI',
  hunt_speed:    'HS',
  lethality:     'LT',
};

/** Build a variant signature: "entityKey::gene1|gene2|…" (genes sorted). */
function variantSig(entityKey, dna) {
  const names = [...dna.entries].map(([g]) => g).sort();
  return `${entityKey}::${names.join('|')}`;
}

/**
 * Compact gene string from an average-values object.
 * e.g. { speed: 1.24, shield: 0.82 } → "SP1.2 SH0.8"
 */
function genesStr(avgValues) {
  const entries = Object.entries(avgValues).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return 'base';
  return entries.map(([g, v]) => `${GENE_SHORT[g] ?? g}${v.toFixed(1)}`).join(' ');
}

/** DNA-derived colour for an entity type, from average gene values. */
function variantColor(entityKey, avgValues) {
  const BASES = {
    'cell':         { h: 133, s: 100, l: 83 },
    'virus-filled': { h: 350, s: 100, l: 65 },
  };
  const base = BASES[entityKey];
  if (!base || Object.keys(avgValues).length === 0) {
    return entityKey === 'virus-filled' ? '#ff4d6d' : '#a8ffb8';
  }
  return DNA.deserialise(avgValues).computeColor(base.h, base.s, base.l);
}

/** Format ms → "m:ss" or "h:mm:ss". */
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ── Entity types that carry evolving DNA ───────────────────────────────────
const DNA_CAPABLE = new Set(['good', 'viral']);

// ── Pool for gene checkboxes ───────────────────────────────────────────────
function poolForType(type) {
  return type === 'viral' ? 'virus' : 'cell';
}

// ─────────────────────────────────────────────────────────────────────────────

export class PopulationPanelController {
  /** @type {HTMLElement|null} */ #panel = null;
  /** @type {HTMLElement|null} */ #btn   = null;
  /** @type {boolean} */          #open  = false;
  /** @type {boolean} */          #built = false;
  /** @type {import('./evolution.js').EvolutionController|null} */ #evolution = null;
  /** @type {ReturnType<typeof setInterval>|null} */ #statsTimer = null;
  /** Cached list from getSpawnableEntities() — used for label/color lookup. */
  /** @type {Array<{ key: string, label: string, color: string, type: string }>} */ #spawnable = [];
  /** Entity keys that already have a header row in #popSpecies. */
  /** @type {Set<string>} */ #speciesKeys = new Set();

  /**
   * Observed variant history.
   * Key: variant signature.  Value: VariantRecord.
   *
   * @type {Map<string, {
   *   entityKey: string,
   *   geneNames: string[],
   *   liveCount: number,
   *   peakCount: number,
   *   color: string,
   *   label: string,
   *   avgValues: Record<string, number>,
   * }>}
   */
  #seenVariants = new Map();

  /**
   * Wire up the panel. Must be called after evolution.init() resolves so that
   * getSpawnableEntities() has icons data available.
   *
   * @param {import('./evolution.js').EvolutionController} evolution
   */
  init(evolution) {
    this.#evolution = evolution;
    this.#panel = document.getElementById('populationPanel');
    this.#btn   = document.getElementById('populationBtn');
    if (!this.#btn || !this.#panel) return;

    this.#btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#open ? this.close() : this.open();
    });

    document.addEventListener('click', (e) => {
      if (this.#open
        && !this.#panel.contains(/** @type {Node} */ (e.target))
        && !this.#btn.contains(/** @type {Node} */ (e.target))
      ) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#open) this.close();
    });

    // Reset variant history when evolution is restarted
    document.addEventListener('evolutionCleared', () => {
      this.#seenVariants.clear();
      this.#speciesKeys.clear();
      const speciesEl = this.#panel?.querySelector('#popSpecies');
      if (speciesEl) speciesEl.innerHTML = '';
    });

    this.#buildUI();
  }

  open() {
    this.#open = true;
    this.#panel.classList.add('pop-panel--visible');
    this.#panel.setAttribute('aria-hidden', 'false');
    this.#btn.setAttribute('aria-expanded', 'true');
    this.#startLiveUpdate();
  }

  close() {
    this.#open = false;
    this.#panel.classList.remove('pop-panel--visible');
    this.#panel.setAttribute('aria-hidden', 'true');
    this.#btn.setAttribute('aria-expanded', 'false');
    this.#stopLiveUpdate();
  }

  // ── Private ─────────────────────────────────────────────────

  #startLiveUpdate() {
    this.#refreshStats();
    this.#statsTimer = setInterval(() => this.#refreshStats(), 300);
  }

  #stopLiveUpdate() {
    if (this.#statsTimer !== null) {
      clearInterval(this.#statsTimer);
      this.#statsTimer = null;
    }
  }

  // ── Build static DOM structure (called once) ──────────────────

  #buildUI() {
    if (this.#built || !this.#panel || !this.#evolution) return;
    this.#built = true;

    this.#spawnable = this.#evolution.getSpawnableEntities();
    const spawnEl   = this.#panel.querySelector('#popSpawn');
    if (!spawnEl) return;

    for (const e of this.#spawnable) {
      // ── Spawn row ─────────────────────────────────────────────
      const spawnRow = document.createElement('div');
      spawnRow.className = 'pop-spawn-row';

      const spawnIcon = document.createElement('span');
      spawnIcon.className = 'pop-spawn-icon';
      spawnIcon.style.setProperty('--c', e.color);
      spawnIcon.dataset.popIcon = e.key;

      const spawnName = document.createElement('span');
      spawnName.className = 'pop-spawn-name';
      spawnName.textContent = e.label.toLowerCase();

      const spacer = document.createElement('span');
      spacer.className = 'pop-spawn-spacer';

      const spawnBtn = document.createElement('button');
      spawnBtn.className = 'pop-spawn-btn';
      spawnBtn.textContent = '+';
      spawnBtn.title = `Spawn ${e.label.toLowerCase()}`;
      spawnBtn.addEventListener('click', () => {
        const geneRow = spawnEl.querySelector(`[data-spawn-genes="${e.key}"]`);
        const checked = geneRow
          ? [...geneRow.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value)
          : [];
        this.#evolution.spawnNamedWithDna(e.key, checked);
      });

      spawnRow.appendChild(spawnIcon);
      spawnRow.appendChild(spawnName);
      spawnRow.appendChild(spacer);
      spawnRow.appendChild(spawnBtn);
      spawnEl.appendChild(spawnRow);

      // Gene checkboxes for DNA-capable types
      if (DNA_CAPABLE.has(e.type)) {
        const pool      = poolForType(e.type);
        const poolGenes = Object.entries(GENE_DEFS).filter(([, d]) => d.applies === pool);

        if (poolGenes.length > 0) {
          const geneRow = document.createElement('div');
          geneRow.className = 'pop-spawn-genes';
          geneRow.dataset.spawnGenes = e.key;

          for (const [geneName, def] of poolGenes) {
            const label = document.createElement('label');
            label.className = 'pop-gene-check';
            label.title = def.label ?? geneName;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = geneName;

            const span = document.createElement('span');
            span.textContent = (GENE_SHORT[geneName] ?? geneName);

            label.appendChild(cb);
            label.appendChild(span);
            geneRow.appendChild(label);
          }

          spawnEl.appendChild(geneRow);
        }
      }
    }

    // Inject SVGs into all icon slots (fire-and-forget async)
    this.#populateIcons();
  }

  // ── Stats refresh ─────────────────────────────────────────────

  #refreshStats() {
    if (!this.#evolution || !this.#panel) return;

    const details = this.#evolution.getEntityDetails();

    // ── 1. Group live entities by variant signature ────────────
    /** @type {Map<string, { entityKey: string, geneNames: string[], dnas: DNA[] }>} */
    const currentGroups = new Map();

    for (const { key, dna } of details) {
      const sig = variantSig(key, dna);
      if (!currentGroups.has(sig)) {
        const geneNames = [...dna.entries].map(([g]) => g).sort();
        currentGroups.set(sig, { entityKey: key, geneNames, dnas: [] });
      }
      currentGroups.get(sig).dnas.push(dna);
    }

    // ── 2. Reset live counts for all seen variants ─────────────
    for (const record of this.#seenVariants.values()) {
      record.liveCount = 0;
    }

    // ── 3. Update / register variants from current live entities ─
    for (const [sig, group] of currentGroups) {
      const { entityKey, geneNames, dnas } = group;
      const liveCount = dnas.length;

      // Average gene values across all live members of this variant
      const sums = {};
      for (const dna of dnas) {
        for (const [gene, val] of dna.entries) {
          sums[gene] = (sums[gene] ?? 0) + val;
        }
      }
      const avgValues = {};
      for (const [gene, sum] of Object.entries(sums)) {
        avgValues[gene] = sum / liveCount;
      }

      const color = variantColor(entityKey, avgValues);
      const label = genesStr(avgValues);

      if (this.#seenVariants.has(sig)) {
        const r = this.#seenVariants.get(sig);
        r.liveCount  = liveCount;
        r.peakCount  = Math.max(r.peakCount, liveCount);
        r.color      = color;
        r.label      = label;
        r.avgValues  = avgValues;
      } else {
        this.#seenVariants.set(sig, {
          entityKey, geneNames, liveCount,
          peakCount: liveCount, color, label, avgValues,
        });
      }
    }

    // ── 4. Update totals + uptime ──────────────────────────────
    const totalEl = this.#panel.querySelector('.pop-panel__total');
    if (totalEl) totalEl.textContent = String(details.length);

    const uptimeEl = this.#panel.querySelector('.pop-panel__uptime');
    if (uptimeEl) uptimeEl.textContent = fmt(this.#evolution.lifetime);

    // ── 5. Rebuild species rows (creates headers on first sight) ─
    this.#rebuildSpecies();
  }

  /**
   * Rebuild the species section from #seenVariants.
   * Creates a species header row the first time an entity type is observed,
   * so entity types that have never appeared are never shown.
   */
  #rebuildSpecies() {
    if (!this.#panel) return;
    const speciesEl = this.#panel.querySelector('#popSpecies');
    if (!speciesEl) return;

    // Group seen variants by entity key
    /** @type {Map<string, Array>} */
    const byKey = new Map();
    for (const v of this.#seenVariants.values()) {
      if (!byKey.has(v.entityKey)) byKey.set(v.entityKey, []);
      byKey.get(v.entityKey).push(v);
    }

    // Add a header row the first time an entity type is seen (in spawnable order)
    for (const e of this.#spawnable) {
      if (!byKey.has(e.key) || this.#speciesKeys.has(e.key)) continue;
      this.#speciesKeys.add(e.key);

      const header = document.createElement('div');
      header.className = 'pop-species-header';
      header.dataset.speciesKey = e.key;

      const iconEl = document.createElement('span');
      iconEl.className = 'pop-species-header__icon';
      iconEl.style.setProperty('--c', e.color);
      loadIcon(e.key).then(svg => { iconEl.innerHTML = svg; }).catch(() => {});

      const nameEl = document.createElement('span');
      nameEl.className = 'pop-species-header__name';
      nameEl.textContent = e.label.toLowerCase();

      const countEl = document.createElement('span');
      countEl.className = 'pop-species-header__count';
      countEl.dataset.popCount = e.key;

      header.appendChild(iconEl);
      header.appendChild(nameEl);
      header.appendChild(countEl);
      speciesEl.appendChild(header);

      const variantsEl = document.createElement('div');
      variantsEl.className = 'pop-variants';
      variantsEl.dataset.speciesVariants = e.key;
      speciesEl.appendChild(variantsEl);
    }

    // Update header counts + variant sub-rows for all visible species
    for (const [entityKey, variants] of byKey) {
      const liveTotal = variants.reduce((s, v) => s + v.liveCount, 0);

      const countEl = speciesEl.querySelector(`[data-pop-count="${entityKey}"]`);
      if (countEl) countEl.textContent = String(liveTotal);

      const container = speciesEl.querySelector(`[data-species-variants="${entityKey}"]`);
      if (!container) continue;

      const sorted = [...variants].sort((a, b) => b.liveCount - a.liveCount || b.peakCount - a.peakCount);
      container.innerHTML = '';

      for (const v of sorted) {
        const row = document.createElement('div');
        row.className = `pop-variant-row${v.liveCount === 0 ? ' pop-variant-row--extinct' : ''}`;

        const dot = document.createElement('span');
        dot.className = 'pop-variant-dot';
        dot.style.background = v.color;
        dot.style.boxShadow  = `0 0 5px ${v.color}80`;

        const genes = document.createElement('span');
        genes.className = 'pop-variant-genes';
        genes.textContent = v.label;

        const count = document.createElement('span');
        count.className = 'pop-variant-count';
        if (v.liveCount > 0) {
          count.textContent = v.peakCount > v.liveCount
            ? `${v.liveCount} / ${v.peakCount}`
            : `×${v.liveCount}`;
        } else {
          count.textContent = `0 / ${v.peakCount}`;
        }

        row.appendChild(dot);
        row.appendChild(genes);
        row.appendChild(count);
        container.appendChild(row);
      }
    }
  }

  // ── Icon injection ─────────────────────────────────────────────

  async #populateIcons() {
    if (!this.#panel) return;
    const slots = this.#panel.querySelectorAll('[data-pop-icon]');
    await Promise.all(Array.from(slots).map(async (slot) => {
      try {
        slot.innerHTML = await loadIcon(slot.dataset.popIcon);
      } catch { /* silent fail */ }
    }));
  }
}
