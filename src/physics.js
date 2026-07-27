/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./types.js').Vec} Vec */

// Loaded as plain <script> tags in index.html, ahead of the module graph.
const Matter = /** @type {any} */ (window).Matter;
const decomp = /** @type {any} */ (window).decomp;
if (!Matter || !decomp) {
  throw new Error('vendor/matter.min.js and vendor/decomp.min.js must load before src/main.js');
}

const { Bodies, Body, Common, Composite, Engine, Query, Vertices } = Matter;

Common.setDecomp(decomp);

/* ---- World geometry. One world unit is roughly one centimetre of nonsense. ---- */

/** Atlas' back and hands form a flat platform of this width, centred on x = 0. */
export const PLATFORM_WIDTH = 400;
export const PLATFORM_HALF = PLATFORM_WIDTH / 2;
/** Top surface of the platform. Everything stacks upward from here (−y is up). */
export const PLATFORM_TOP = 0;
export const PLATFORM_DEPTH = 30;
/** Where Atlas is standing. Debris lands here; nothing may be *placed* here. */
export const GROUND_Y = 250;
/**
 * Below the platform, above anything resting on the ground: a body whose centre
 * passes this line has unambiguously fallen off Atlas.
 */
export const TOPPLE_Y = 120;
/** ...or this far sideways. */
export const TOPPLE_X = 2600;

/** Compound bodies beyond this many parts get replaced with their convex hull. */
const MAX_PARTS = 12;

export function createEngine() {
  const engine = Engine.create({
    enableSleeping: true,
    gravity: { x: 0, y: 1, scale: 0.001 },
  });
  // Stacks of mixed-mass junk need the extra solver passes to stay honest.
  engine.positionIterations = 12;
  engine.velocityIterations = 8;
  engine.constraintIterations = 4;
  return engine;
}

export function createPlatform() {
  return Bodies.rectangle(0, PLATFORM_TOP + PLATFORM_DEPTH / 2, PLATFORM_WIDTH, PLATFORM_DEPTH, {
    isStatic: true,
    friction: 0.9,
    frictionStatic: 1.2,
    restitution: 0,
    label: 'platform',
  });
}

/**
 * Only exists so a collapse lands somewhere instead of falling forever. It is
 * deliberately *not* offered as a placement surface — see Game.updateHeld.
 */
export function createGround() {
  return Bodies.rectangle(0, GROUND_Y + 400, 40000, 800, {
    isStatic: true,
    friction: 0.9,
    restitution: 0,
    label: 'ground',
  });
}

/**
 * Comedic weights span 30 orders of magnitude; simulated ones cannot. Compress
 * hard so an anvil still feels heavier than a rubber duck without the solver
 * treating the stack below it as a liquid.
 * @param {number} weightKg
 * @returns {number}
 */
function densityFor(weightKg) {
  const d = 0.0009 * Math.pow(Math.max(weightKg, 0.001), 0.22);
  return Math.min(0.010, Math.max(0.0006, d));
}

/**
 * Builds a body from the sprite's traced outline. Falls back to the convex hull
 * if decomposition produces an unreasonable number of parts.
 * @param {ObjectDef} def
 * @param {Sprite} sprite
 * @param {number} x
 * @param {number} y
 * @param {number} [angle]
 */
export function createObjectBody(def, sprite, x, y, angle = 0) {
  const scaled = sprite.hull.map((p) => ({ x: p.x * def.size, y: p.y * def.size }));
  const options = {
    friction: def.friction ?? 0.62,
    frictionStatic: 0.95,
    restitution: def.restitution ?? 0.02,
    density: densityFor(def.weight),
    label: def.id,
    slop: 0.02,
  };

  let body = Bodies.fromVertices(x, y, [scaled], options, false);

  if (!usable(body, MAX_PARTS)) {
    body = Bodies.fromVertices(x, y, [Vertices.hull(scaled)], options, false);
  }
  if (!usable(body, Infinity)) {
    const bounds = boundsOf(scaled);
    body = Bodies.rectangle(x, y, bounds.w, bounds.h, options);
  }

  // fromVertices re-centres on the shape's centroid; remember where the artwork
  // sits relative to that so the picture and the collision shape stay married.
  const centroid = Vertices.centre(scaled);
  body.gameDef = def;
  body.gameSprite = sprite;
  body.gameArtOffset = { x: -centroid.x, y: -centroid.y };

  Body.setAngle(body, angle);
  Body.setPosition(body, { x, y });
  return body;
}

/**
 * A body is usable if it exists, has real area, and did not explode into parts.
 * @param {any} body
 * @param {number} maxParts
 * @returns {boolean}
 */
function usable(body, maxParts) {
  if (!body || !Number.isFinite(body.area) || body.area <= 0) return false;
  const partCount = body.parts.length > 1 ? body.parts.length - 1 : 1;
  return partCount <= maxParts;
}

/**
 * @param {Vec[]} points
 */
function boundsOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/**
 * @param {any} body @param {number} x @param {number} y @param {number} angle
 */
export function setTransform(body, x, y, angle) {
  if (body.angle !== angle) Body.setAngle(body, angle);
  Body.setPosition(body, { x, y });
}

/**
 * @param {any} body @param {any[]} obstacles
 * @returns {boolean}
 */
export function overlaps(body, obstacles) {
  return Query.collides(body, obstacles).length > 0;
}

/**
 * Sweeps the shape straight down from (x, y) to find where it would come to
 * rest — that is what the landing shadow shows. Coarse pass then a fine pass,
 * so it stays cheap enough to run every frame while dragging.
 *
 * @param {any} body
 * @param {any[]} obstacles
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 * @param {number} maxDrop
 * @returns {{ status: 'ok', restY: number } | { status: 'overlap' } | { status: 'nofloor' }}
 */
export function projectDrop(body, obstacles, x, y, angle, maxDrop) {
  const originalAngle = body.angle;
  const originalPos = { x: body.position.x, y: body.position.y };
  try {
    setTransform(body, x, y, angle);
    if (overlaps(body, obstacles)) return { status: 'overlap' };

    const span = Math.max(body.bounds.max.y - body.bounds.min.y, 8);
    const coarse = Math.max(6, span * 0.16);

    let hitAt = -1;
    for (let d = coarse; d <= maxDrop; d += coarse) {
      setTransform(body, x, y + d, angle);
      if (overlaps(body, obstacles)) { hitAt = d; break; }
    }
    if (hitAt < 0) return { status: 'nofloor' };

    const fine = coarse / 8;
    let rest = hitAt - coarse;
    for (let d = rest + fine; d < hitAt; d += fine) {
      setTransform(body, x, y + d, angle);
      if (overlaps(body, obstacles)) break;
      rest = d;
    }
    return { status: 'ok', restY: y + rest };
  } finally {
    setTransform(body, originalPos.x, originalPos.y, originalAngle);
  }
}

/**
 * @param {any} engine @param {any} body
 */
export function addBody(engine, body) {
  Composite.add(engine.world, body);
}

export { Body, Composite, Engine, Matter };
