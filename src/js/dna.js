/**
 * dna.js
 * Parametric gene system for cell/virus evolution.
 *
 * GENE_DEFS is the single registry: each entry is a gene the evolution
 * system can produce.  Adding a new entry is all that's needed to enter
 * it into the gene pool — no other code changes required.
 *
 * DNA instances wrap an immutable Map; mutation always returns a new DNA.
 */

/**
 * Gene registry.
 *
 * Each gene has:
 *   min, max    — numeric range (values clamped on deserialise)
 *   default     — value used when gene is absent (not yet mutated in)
 *   hueShift    — degrees of hue change at full gene value (relative to base)
 *   satShift    — saturation % change at full gene value
 *   applies     — 'cell' | 'virus'  which entity pool this gene belongs to
 */
export const GENE_DEFS = {

  // ── Cell genes ────────────────────────────────────────────────
  /** Makes the cell drift faster across the viewport. */
  speed:         { min: 0.7, max: 1.5, default: 1.0, hueShift:  40, satShift:   0, applies: 'cell'  },
  /** Lowers the effective virus-kill chance against this cell. */
  resistance:    { min: 0.0, max: 0.60, default: 0.0, hueShift: -25, satShift:  10, applies: 'cell'  },
  /** Blocks virus attacks approaching from the cell's front arc. */
  shield:        { min: 0.0, max: 1.0, default: 0.0, hueShift:  30, satShift:  12, applies: 'cell'  },
  /** Scales division speed; higher value → shorter interval between divisions. */
  division_rate: { min: 0.5, max: 2.5, default: 1.0, hueShift:  10, satShift:  -8, applies: 'cell'  },

  // ── Virus genes ───────────────────────────────────────────────
  /** Makes the virus drift faster across the viewport. */
  hunt_speed:    { min: 0.8, max: 2.0, default: 1.0, hueShift:  20, satShift:  10, applies: 'virus' },
  /** Adds a bonus kill chance on top of the base virus lethality setting. */
  lethality:     { min: 0.0, max: 0.35, default: 0.0, hueShift: -15, satShift:  15, applies: 'virus' },

};

export class DNA {
  /** @type {Map<string, number>} */
  #genes;

  /** @param {Map<string, number>} [genes] */
  constructor(genes = new Map()) {
    this.#genes = new Map(genes);
  }

  /**
   * Get the effective value of a gene.
   * Returns the gene's `default` if it is not yet active in this DNA.
   *
   * @param {string} gene
   * @returns {number}
   */
  get(gene) {
    return this.#genes.has(gene)
      ? this.#genes.get(gene)
      : (GENE_DEFS[gene]?.default ?? 0);
  }

  /** @param {string} gene */
  has(gene) { return this.#genes.has(gene); }

  /** Number of active (mutated-in) genes. */
  get size() { return this.#genes.size; }

  /** Iterate active gene entries as [name, value] pairs. */
  get entries() { return this.#genes.entries(); }

  /**
   * Produce offspring DNA with three mutation operations applied in order:
   *
   *   1. Drift    — each active gene independently drifts ±15 % of its range
   *                 with probability `mutationRate`.
   *   2. Emerge   — with probability `mutationRate × 0.4`, one random gene
   *                 from the appropriate pool that isn't yet active emerges
   *                 at a low starting value (min + 10 % of range).
   *   3. Silence  — with probability `mutationRate × 0.15`, one random
   *                 active gene is lost entirely.
   *
   * @param {number}           mutationRate  base probability (0–1)
   * @param {'cell'|'virus'}   pool          gene pool for emergence
   * @returns {DNA}
   */
  reproduce(mutationRate = 0.10, pool = 'cell') {
    const newGenes = new Map(this.#genes);

    // 1. Drift existing genes
    for (const [gene, value] of newGenes) {
      if (Math.random() < mutationRate) {
        const def = GENE_DEFS[gene];
        if (!def) continue;
        const drift = (def.max - def.min) * 0.15 * (Math.random() * 2 - 1);
        newGenes.set(gene, Math.max(def.min, Math.min(def.max, value + drift)));
      }
    }

    // 2. Emerge a new gene from the pool
    if (Math.random() < mutationRate * 0.4) {
      const candidates = Object.entries(GENE_DEFS)
        .filter(([key, def]) => def.applies === pool && !newGenes.has(key))
        .map(([key]) => key);
      if (candidates.length > 0) {
        const key = candidates[Math.floor(Math.random() * candidates.length)];
        const def = GENE_DEFS[key];
        newGenes.set(key, def.min + (def.max - def.min) * 0.1);
      }
    }

    // 3. Silence a random active gene
    if (newGenes.size > 0 && Math.random() < mutationRate * 0.15) {
      const keys = [...newGenes.keys()];
      newGenes.delete(keys[Math.floor(Math.random() * keys.length)]);
    }

    return new DNA(newGenes);
  }

  /**
   * Derive an HSL colour from active genes, relative to a base colour.
   * Each gene contributes hueShift and satShift scaled by its normalised value.
   *
   * @param {number} baseH  base hue (0–360)
   * @param {number} baseS  base saturation (0–100)
   * @param {number} baseL  base lightness (0–100)
   * @returns {string}  CSS `hsl(…)` string
   */
  computeColor(baseH, baseS, baseL) {
    let h = baseH;
    let s = baseS;
    for (const [gene, value] of this.#genes) {
      const def = GENE_DEFS[gene];
      if (!def) continue;
      const range = def.max - def.min;
      const norm  = range > 0 ? (value - def.min) / range : 0;
      h += norm * def.hueShift;
      s += norm * def.satShift;
    }
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s));
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${baseL}%)`;
  }

  /**
   * Serialise to a plain object for localStorage.
   * @returns {Record<string, number>}
   */
  serialise() {
    return Object.fromEntries(this.#genes);
  }

  /**
   * Reconstruct a DNA from a previously serialised object.
   * Unknown keys and out-of-range values are silently ignored.
   *
   * @param {Record<string, number>} obj
   * @returns {DNA}
   */
  static deserialise(obj) {
    if (!obj || typeof obj !== 'object') return DNA.empty();
    const genes = new Map();
    for (const [key, value] of Object.entries(obj)) {
      const def = GENE_DEFS[key];
      if (!def || typeof value !== 'number') continue;
      genes.set(key, Math.max(def.min, Math.min(def.max, value)));
    }
    return new DNA(genes);
  }

  /** A pristine DNA with no active genes (default phenotype). */
  static empty() {
    return new DNA();
  }

  /**
   * Build a DNA with a specific set of genes pre-activated at their initial
   * emergence value (min + 15 % of range).  Unknown or pool-mismatched gene
   * names are silently skipped.
   *
   * @param {string[]} geneNames  names to activate
   * @returns {DNA}
   */
  static withGenes(geneNames) {
    const genes = new Map();
    for (const name of geneNames) {
      const def = GENE_DEFS[name];
      if (!def) continue;
      genes.set(name, def.min + (def.max - def.min) * 0.15);
    }
    return new DNA(genes);
  }

  /**
   * Create virus DNA, optionally derived from the infecting cell's DNA.
   * Implements an arms-race mechanic: if the cell had significant resistance,
   * the resulting virus gains compensating lethality.
   *
   * @param {DNA|null} [cellDNA]
   * @returns {DNA}
   */
  static forVirus(cellDNA = null) {
    const genes = new Map();
    if (cellDNA) {
      const resistance = cellDNA.get('resistance');
      if (resistance > 0.15) {
        const def = GENE_DEFS['lethality'];
        genes.set('lethality', Math.min(def.max, resistance * 0.55));
      }
    }
    return new DNA(genes);
  }
}
