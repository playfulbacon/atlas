/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./types.js').Vec} Vec */

// Loaded as plain <script> tags in index.html, ahead of the module graph.
const Matter = /** @type {any} */ (window).Matter;
const decomp = /** @type {any} */ (window).decomp;
if (!Matter || !decomp) {
  throw new Error('vendor/matter.min.js and vendor/decomp.min.js must load before src/main.js');
}

const { Bodies, Body, Bounds, Collision, Common, Composite, Engine, Vertices } = Matter;

Common.setDecomp(decomp);

/* ---- World geometry. One world unit is roughly one centimetre of nonsense. ---- */

/**
 * A carrier is scaled so its top band spans this much, centred on x = 0. It is
 * not the whole of what you can place on — the skyline in src/carriers.js
 * usually reaches well past it — it is just the yardstick every carrier is
 * measured against, so a tortoise and a titan hold objects of the same size.
 */
export const PLATFORM_WIDTH = 400;
export const PLATFORM_HALF = PLATFORM_WIDTH / 2;
/** The top of the carrier. Everything stacks upward from here (−y is up). */
export const PLATFORM_TOP = 0;
export const PLATFORM_DEPTH = 30;
/**
 * Once a body's lowest point is this close to the grass it is not on the
 * carrier any more, whatever else is going on. This replaced a fixed height:
 * with a real skyline underneath, "below the shelf" is no longer a single
 * number — an object can sit a long way down in a carrier's hollows and still
 * be held.
 */
export const GROUND_MARGIN = 14;
/** ...or it has been flung this far sideways. */
export const TOPPLE_X = 2600;

/** How far past the ground a terrain slab extends. Solid, not a shell. */
const TERRAIN_SKIRT = 160;
/** Terrain slabs narrower than this are dropped; Matter dislikes slivers. */
const MIN_TERRAIN_SPAN = 1.5;

/**
 * Compound bodies beyond this many parts get replaced with their convex hull.
 * Generous on purpose: the hull of something like a bicycle is a solid slab
 * covering the wheels, which is far worse for stacking than a few extra parts.
 */
const MAX_PARTS = 26;

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

const TERRAIN_OPTIONS = {
  isStatic: true,
  friction: 0.9,
  frictionStatic: 1.2,
  restitution: 0,
  label: 'terrain',
};

/**
 * The flat shelf used when there is no carrier picture to read — the title
 * screen before one is chosen, or artwork that failed to load.
 * @returns {any[]}
 */
export function createPlatform() {
  return [
    Bodies.rectangle(0, PLATFORM_TOP + PLATFORM_DEPTH / 2, PLATFORM_WIDTH, PLATFORM_DEPTH, {
      ...TERRAIN_OPTIONS,
    }),
  ];
}

/**
 * Builds the carrier's collision surface from its skyline: one solid slab under
 * every segment, dropping far enough that nothing can be shoved out underneath.
 *
 * Slabs rather than one traced polygon, because each is convex by construction
 * — no decomposition, no chance of a concave hull quietly filling in a hollow
 * that the artwork says you should be able to drop something into.
 *
 * @param {import('./types.js').Vec[][]} surface Skyline runs, in world units.
 * @param {number} groundY
 * @returns {any[]}
 */
export function createTerrain(surface, groundY) {
  const floor = groundY + TERRAIN_SKIRT;
  /** @type {any[]} */
  const bodies = [];
  for (const run of surface) {
    for (let i = 0; i < run.length - 1; i++) {
      const a = run[i];
      const b = run[i + 1];
      if (a.y >= floor || b.y >= floor) continue;
      // A near-vertical segment would be a sliver Matter cannot solve against,
      // so widen it instead of dropping it — overlapping static slabs are free,
      // a gap in the surface is not.
      const right = Math.max(b.x, a.x + MIN_TERRAIN_SPAN);
      const quad = [
        { x: a.x, y: a.y },
        { x: right, y: b.y },
        { x: right, y: floor },
        { x: a.x, y: floor },
      ];
      // fromVertices re-centres on the polygon centroid, so hand it the very
      // centroid it is going to compute and the slab lands where it was drawn.
      const centre = Vertices.centre(quad);
      const body = Bodies.fromVertices(centre.x, centre.y, [quad], { ...TERRAIN_OPTIONS }, false);
      if (body && Number.isFinite(body.area) && body.area > 0) bodies.push(body);
    }
  }
  return bodies.length ? bodies : createPlatform();
}

/**
 * Only exists so a collapse lands somewhere instead of falling forever. It is
 * deliberately *not* offered as a placement surface — see Game.updateHeld — and
 * reaching it is how a run ends.
 * @param {number} groundY
 */
export function createGround(groundY) {
  return Bodies.rectangle(0, groundY + 400, 40000, 800, {
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
 *
 * The range is deliberately narrow (5x end to end). Wide mass ratios are the
 * main source of jitter in a tall stack: the solver cannot settle a feather
 * pinned under a locomotive, so the pile hums instead of sleeping.
 * @param {number} weightKg
 * @returns {number}
 */
function densityFor(weightKg) {
  const d = 0.0012 * Math.pow(Math.max(weightKg, 0.001), 0.16);
  return Math.min(0.0045, Math.max(0.0009, d));
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
    restitution: def.restitution ?? 0,
    density: densityFor(def.weight),
    label: def.id,
    slop: 0.05,
    // Settle and freeze quickly; a pile that never sleeps is a pile that jitters.
    sleepThreshold: 26,
  };

  let body = Bodies.fromVertices(x, y, [scaled], options, false);

  if (!usable(body, MAX_PARTS)) {
    body = Bodies.fromVertices(x, y, [Vertices.hull(scaled)], options, false);
  }
  if (!usable(body, Infinity)) {
    const bounds = boundsOf(scaled);
    body = Bodies.rectangle(x, y, bounds.w, bounds.h, options);
  }

  body.gameDef = def;
  body.gameSprite = sprite;

  // Matter re-centres a compound body on its parts' centre of mass, which is
  // NOT the polygon centroid: decomposition discards slivers below minimumArea
  // and shifts it. Predicting that offset put some artwork (a bucket, say) 26%
  // of its own height away from its collision shape. So measure it instead.
  //
  // The hull was traced from the artwork's visible pixels, so the collision
  // AABB and the artwork's visible box describe the same rectangle — line up
  // their centres at angle 0 and the picture can never drift from the physics.
  Body.setPosition(body, { x, y });
  const bounds = body.bounds;
  body.gameArtOffset = {
    x: (bounds.min.x + bounds.max.x) / 2 - x,
    y: (bounds.min.y + bounds.max.y) / 2 - y,
  };

  Body.setAngle(body, angle);
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
 * True if any convex piece of `body` intersects any convex piece of anything in
 * `obstacles`.
 *
 * Matter's own Query.collides cannot be used here. It walks the *obstacle's*
 * parts but hands the whole held body to the SAT test, and a compound body's
 * `vertices` is the convex hull of its parts — so a concave object (a bathtub,
 * a chair) was tested as its hull while the simulation used its real shape.
 * Objects came to rest on that hull, floating above true contact, then dropped
 * into the pile on the first step and shoved everything around. Walking both
 * sides makes the preview agree with the physics.
 *
 * @param {any} body @param {any[]} obstacles
 * @returns {boolean}
 */
export function overlaps(body, obstacles) {
  const aParts = body.parts;
  // parts[0] of a compound is the convex hull of the rest; skip it.
  const aStart = aParts.length > 1 ? 1 : 0;

  for (let i = 0; i < obstacles.length; i++) {
    const other = obstacles[i];
    if (!Bounds.overlaps(other.bounds, body.bounds)) continue;

    const bParts = other.parts;
    const bStart = bParts.length > 1 ? 1 : 0;
    for (let j = bStart; j < bParts.length; j++) {
      const pb = bParts[j];
      if (!Bounds.overlaps(pb.bounds, body.bounds)) continue;

      for (let k = aStart; k < aParts.length; k++) {
        const pa = aParts[k];
        if (!Bounds.overlaps(pa.bounds, pb.bounds)) continue;
        if (Collision.collides(pa, pb)) return true;
      }
    }
  }
  return false;
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
 * @returns {{ status: 'ok', restY: number, restBottom: number }
 *   | { status: 'blocked' } | { status: 'nofloor' }}
 */
export function projectDrop(body, obstacles, x, y, angle, maxDrop) {
  const originalAngle = body.angle;
  const originalPos = { x: body.position.x, y: body.position.y };
  try {
    setTransform(body, x, y, angle);

    // Holding the object *inside* the pile is allowed — you are aiming, not
    // placing. Rise to the first clear spot and drop from there, so the shadow
    // always shows a legal landing instead of the whole thing going red.
    let startY = y;
    if (overlaps(body, obstacles)) {
      const climb = 7;
      let cleared = false;
      for (let d = climb; d <= maxDrop; d += climb) {
        setTransform(body, x, y - d, angle);
        if (!overlaps(body, obstacles)) { startY = y - d; cleared = true; break; }
      }
      if (!cleared) return { status: 'blocked' };
    }
    y = startY;

    const b = body.bounds;
    // Only obstacles that overlap horizontally can be hit on a vertical drop.
    const candidates = obstacles.filter(
      (o) => o.bounds.max.x > b.min.x && o.bounds.min.x < b.max.x,
    );
    if (!candidates.length) return { status: 'nofloor' };

    // Nothing can be touched before the AABBs meet, and nothing can be touched
    // after we have fallen past every candidate — so only sweep in between.
    let from = Infinity;
    let to = -Infinity;
    let thinnest = Infinity;
    for (const o of candidates) {
      from = Math.min(from, o.bounds.min.y - b.max.y);
      to = Math.max(to, o.bounds.max.y - b.min.y);
      // Measure per convex *part*, not per body. A bicycle's bounding box is
      // 126 units tall but its rim is six thick — stepping by the box would
      // sweep straight through the wheel and land the object inside it.
      const parts = o.parts;
      for (let k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
        const pb = parts[k].bounds;
        thinnest = Math.min(thinnest, pb.max.y - pb.min.y);
      }
    }
    from = Math.max(0, from);
    to = Math.min(maxDrop, to);
    if (to < from) return { status: 'nofloor' };

    // The step must be smaller than the thinnest thing we could land on, or a
    // large object sweeps clean through a skateboard and settles inside it.
    // Bounded below so a decomposition sliver cannot make this crawl.
    const step = Math.min(12, Math.max(2.5, thinnest * 0.4));

    let hitAt = -1;
    for (let d = from; d <= to; d += step) {
      setTransform(body, x, y + d, angle);
      if (overlaps(body, candidates)) { hitAt = d; break; }
    }
    if (hitAt < 0) return { status: 'nofloor' };

    // Creep forward from the last known-clear position for a snug landing.
    const fine = step / 16;
    let rest = Math.max(0, hitAt - step);
    for (let d = rest + fine; d < hitAt; d += fine) {
      setTransform(body, x, y + d, angle);
      if (overlaps(body, candidates)) break;
      rest = d;
    }
    // Report where it would actually sit, not just its centre: the caller needs
    // the lowest point to tell a landing from a landing in the grass.
    setTransform(body, x, y + rest, angle);
    return { status: 'ok', restY: y + rest, restBottom: body.bounds.max.y };
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
