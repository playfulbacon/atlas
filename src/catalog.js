/** @typedef {import('./types.js').ObjectDef} ObjectDef */

// Resolved against this module's own URL, so the game works at any path —
// a user page, a project subpath, or a file:// directory — with no config.
const CATALOG_URL = new URL('./data/objects.json', import.meta.url);
const ART_BASE = new URL('../assets/objects/', import.meta.url);

/**
 * Top-level await: every importer waits for the catalog, so nothing downstream
 * has to deal with a half-loaded game.
 * @type {ObjectDef[]}
 */
export const CATALOG = await fetch(CATALOG_URL).then((r) => {
  if (!r.ok) throw new Error(`could not load objects.json (HTTP ${r.status})`);
  return r.json();
});

export const MAX_TIER = CATALOG.reduce((m, o) => Math.max(m, o.tier), 1);

/** @type {Map<number, ObjectDef[]>} */
const BY_TIER = new Map();
for (const def of CATALOG) {
  const bucket = BY_TIER.get(def.tier);
  if (bucket) bucket.push(def);
  else BY_TIER.set(def.tier, [def]);
}

/** How many placements before the next tier unlocks. */
const OBJECTS_PER_TIER = 7;

/**
 * Tier the game is currently "on" for a given score.
 * @param {number} score
 * @returns {number}
 */
export function tierForScore(score) {
  return Math.min(MAX_TIER, 1 + Math.floor(score / OBJECTS_PER_TIER));
}

/**
 * Mostly draws from the current tier, but keeps sprinkling smaller things in so
 * you always have something to wedge into a gap.
 * @param {number} score
 * @param {readonly string[]} recentIds
 * @returns {ObjectDef}
 */
export function pickNext(score, recentIds) {
  const top = tierForScore(score);
  const roll = Math.random();
  let tier = top;
  if (roll > 0.66 && top > 1) tier = top - 1;
  if (roll > 0.9 && top > 2) tier = top - 2;

  const pool = BY_TIER.get(tier) ?? BY_TIER.get(1);
  if (!pool) throw new Error('catalog has no tier 1 objects');
  const fresh = pool.filter((o) => !recentIds.includes(o.id));
  const choices = fresh.length ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

/**
 * @param {ObjectDef} def
 * @returns {string}
 */
export function spriteUrl(def) {
  return new URL(`${def.id}.svg`, ART_BASE).href;
}
