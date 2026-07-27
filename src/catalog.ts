import rawObjects from './data/objects.json';
import type { ObjectDef } from './types';

export const CATALOG = rawObjects as ObjectDef[];

export const MAX_TIER = CATALOG.reduce((m, o) => Math.max(m, o.tier), 1);

const BY_TIER = new Map<number, ObjectDef[]>();
for (const def of CATALOG) {
  const bucket = BY_TIER.get(def.tier);
  if (bucket) bucket.push(def);
  else BY_TIER.set(def.tier, [def]);
}

/** How many placements before the next tier unlocks. */
const OBJECTS_PER_TIER = 7;

/** Tier the game is currently "on" for a given score. */
export function tierForScore(score: number): number {
  return Math.min(MAX_TIER, 1 + Math.floor(score / OBJECTS_PER_TIER));
}

/**
 * Mostly draws from the current tier, but keeps sprinkling smaller things in so
 * you always have something to wedge into a gap.
 */
export function pickNext(score: number, recentIds: readonly string[]): ObjectDef {
  const top = tierForScore(score);
  const roll = Math.random();
  let tier = top;
  if (roll > 0.66 && top > 1) tier = top - 1;
  if (roll > 0.9 && top > 2) tier = top - 2;

  const pool = BY_TIER.get(tier) ?? BY_TIER.get(1)!;
  const fresh = pool.filter((o) => !recentIds.includes(o.id));
  const choices = fresh.length ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

export function spriteUrl(def: ObjectDef): string {
  return `${import.meta.env.BASE_URL}assets/objects/${def.id}.svg`;
}
