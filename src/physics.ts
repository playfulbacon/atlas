import Matter from 'matter-js';
import decomp from 'poly-decomp';
import type { ObjectDef, Sprite, Vec } from './types';

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

export interface PlacedBody extends Matter.Body {
  gameDef?: ObjectDef;
  gameSprite?: Sprite;
  /** Local-space offset from the physics centroid to the artwork's centre. */
  gameArtOffset?: Vec;
}

export function createEngine(): Matter.Engine {
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

export function createPlatform(): Matter.Body {
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
export function createGround(): Matter.Body {
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
 */
function densityFor(weightKg: number): number {
  const d = 0.0009 * Math.pow(Math.max(weightKg, 0.001), 0.22);
  return Math.min(0.010, Math.max(0.0006, d));
}

/**
 * Builds a body from the sprite's traced outline. Falls back to the convex hull
 * if decomposition produces an unreasonable number of parts.
 */
export function createObjectBody(def: ObjectDef, sprite: Sprite, x: number, y: number, angle = 0): PlacedBody {
  const scaled = sprite.hull.map((p) => ({ x: p.x * def.size, y: p.y * def.size }));
  const options: Matter.IBodyDefinition = {
    friction: def.friction ?? 0.62,
    frictionStatic: 0.95,
    restitution: def.restitution ?? 0.02,
    density: densityFor(def.weight),
    label: def.id,
    slop: 0.02,
  };

  let body = Bodies.fromVertices(x, y, [scaled], options, false) as PlacedBody | undefined;

  if (!usable(body, MAX_PARTS)) {
    // Vertices.hull only reads x/y, so plain points are fine here.
    const hull = Vertices.hull(scaled as unknown as Matter.Vertex[]) as unknown as Matter.Vector[];
    body = Bodies.fromVertices(x, y, [hull], options, false) as PlacedBody | undefined;
  }
  if (!usable(body, Infinity)) {
    const bounds = boundsOf(scaled);
    body = Bodies.rectangle(x, y, bounds.w, bounds.h, options) as PlacedBody;
  }

  // fromVertices re-centres on the shape's centroid; remember where the artwork
  // sits relative to that so the picture and the collision shape stay married.
  const centroid = Vertices.centre(scaled as Matter.Vector[]);
  body.gameDef = def;
  body.gameSprite = sprite;
  body.gameArtOffset = { x: -centroid.x, y: -centroid.y };

  Body.setAngle(body, angle);
  Body.setPosition(body, { x, y });
  return body;
}

/** A body is usable if it exists, has real area, and did not explode into parts. */
function usable(body: PlacedBody | undefined, maxParts: number): body is PlacedBody {
  if (!body || !Number.isFinite(body.area) || body.area <= 0) return false;
  const partCount = body.parts.length > 1 ? body.parts.length - 1 : 1;
  return partCount <= maxParts;
}

function boundsOf(points: Vec[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

export function setTransform(body: Matter.Body, x: number, y: number, angle: number): void {
  if (body.angle !== angle) Body.setAngle(body, angle);
  Body.setPosition(body, { x, y });
}

export function overlaps(body: Matter.Body, obstacles: Matter.Body[]): boolean {
  return Query.collides(body, obstacles).length > 0;
}

export type DropResult =
  | { status: 'ok'; restY: number }
  | { status: 'overlap' }
  | { status: 'nofloor' };

/**
 * Sweeps the shape straight down from (x, y) to find where it would come to
 * rest — that is what the landing shadow shows. Coarse pass then a fine pass,
 * so it stays cheap enough to run every frame while dragging.
 */
export function projectDrop(
  body: Matter.Body,
  obstacles: Matter.Body[],
  x: number,
  y: number,
  angle: number,
  maxDrop: number,
): DropResult {
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

export function addBody(engine: Matter.Engine, body: Matter.Body): void {
  Composite.add(engine.world, body);
}

export { Body, Composite, Engine, Matter };
