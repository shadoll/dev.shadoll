/**
 * iconLoader.js
 * Fetches SVG icon files on demand and caches them in memory.
 * Returns normalised SVG strings ready for innerHTML injection.
 *
 * Note: requires a local HTTP server — fetch() does not work on file:// URLs.
 */

const ICONS_PATH = 'src/icons';

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * Normalise an SVG string for safe inline use:
 *  - Strip the XML declaration (breaks innerHTML injection)
 *  - Remove fixed width / height attributes (sizing is handled by CSS)
 *  - Add a neutral aria-hidden so inline SVGs don't pollute the a11y tree
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeSvg(raw) {
  return raw
    .replace(/<\?xml[^>]*\?>\s*/i, '')        // remove XML declaration
    .replace(/<!--[\s\S]*?-->/g, '')            // remove XML comments
    .replace(/\s+width="[^"]*"/, '')            // remove fixed width
    .replace(/\s+height="[^"]*"/, '')           // remove fixed height
    .replace(/<svg/, '<svg aria-hidden="true"') // mark decorative
    .trim();
}

/**
 * Load and cache an SVG icon by name.
 * Subsequent calls for the same name are synchronous (cache hit).
 *
 * @param {string} name  Filename without extension, e.g. 'cell'
 * @returns {Promise<string>}  Normalised SVG markup
 */
export async function loadIcon(name) {
  if (cache.has(name)) return cache.get(name);

  const url = `${ICONS_PATH}/${name}.svg`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`[iconLoader] Could not load icon "${name}" from ${url} (${res.status})`);
  }

  const svg = normalizeSvg(await res.text());
  cache.set(name, svg);
  return svg;
}

/**
 * Warm the cache for a list of icon names (non-blocking).
 * Call this at startup to avoid fetch latency on first spawn.
 *
 * @param {string[]} names
 */
export function preloadIcons(names) {
  names.forEach(name => loadIcon(name).catch(() => {}));
}
