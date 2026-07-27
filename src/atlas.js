import { GROUND_Y } from './physics.js';

/**
 * Atlas is drawn, not simulated: a kneeling figure braced under the load, in
 * flat angular line-art — straight segments, mitred corners, one pale stone
 * fill, no rendered curves anywhere.
 *
 * The one rule: the flat of his back and the flats of both hands sit at exactly
 * y = 0 and together span the platform's full 400 units, which is the top
 * surface of the static platform body. Nothing else is drawn up there.
 */

const STONE = '#f0e9dd';
const STONE_SHADE = '#bcae94';
const INK = '#1f1b17';

/** @typedef {{ ground: string, groundShade: string }} AtlasStyle */
/** @typedef {Array<[number, number]>} Poly */
/** @typedef {{ spine: Poly, widths: number[] }} Limb */

/**
 * Back, ribs and hips as one closed polygon. Its top edge is the straight run
 * from −130 to 130 that the load rests on.
 * @type {Poly}
 */
const BODY = [
  [-116, 0], [116, 0],
  [122, 46], [100, 120], [82, 196], [68, 250], [52, 294], [0, 312],
  [-52, 294], [-68, 250], [-82, 196], [-100, 120], [-122, 46],
];

/** Flat of the hand, carrying the shelf out to the platform edge. @type {Poly} */
const HAND = [[110, 0], [216, 0], [212, 36], [114, 40]];

/**
 * Limbs are tapered polylines: joints plus a width at each, offset into a
 * closed polygon. Straight edges throughout, and no gap at the joints.
 *
 * Every limb here is a single straight segment. A polyline that folds back on
 * itself — an arm doubling up at the elbow — has no usable offset direction at
 * the fold, and the polygon pinches shut into a sliver. Overlapping segments
 * cost nothing and leave a crease at the joint, which suits the style anyway.
 */
/** @type {Limb} */ const UPPER_ARM = { spine: [[110, 36], [202, 174]], widths: [70, 58] };
/** @type {Limb} */ const FOREARM = { spine: [[204, 178], [214, 44]], widths: [58, 46] };

/** Near leg: knee up, foot planted flat. */
/** @type {Limb} */ const THIGH_PLANTED = { spine: [[60, 290], [186, 372]], widths: [70, 56] };
/** @type {Limb} */ const SHIN_PLANTED = { spine: [[186, 372], [196, 494]], widths: [56, 38] };
/** @type {Limb} */ const FOOT_PLANTED = { spine: [[184, 504], [258, 506]], widths: [36, 26] };

/** Far leg: knee down on the ground, shin folded back along it. */
/** Shin folds back behind him, so the knee alone rests on the ground. */
/** @type {Limb} */ const THIGH_KNEEL = { spine: [[-60, 290], [-136, 476]], widths: [70, 56] };
/** @type {Limb} */ const SHIN_KNEEL = { spine: [[-136, 488], [-58, 506]], widths: [50, 34] };

const HEAD = { x: 0, y: 76, rx: 54, ry: 48 };

/**
 * Offsets a polyline into a closed tapered polygon.
 * @param {Limb} limb
 * @param {number} [flip] -1 mirrors it to the other side.
 * @returns {Poly}
 */
function limbPolygon(limb, flip = 1) {
  /** @type {Poly} */
  const left = [];
  /** @type {Poly} */
  const right = [];
  const pts = limb.spine;

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1] ?? pts[i];
    const next = pts[i + 1] ?? pts[i];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = limb.widths[i] / 2;
    left.push([(pts[i][0] + nx * half) * flip, pts[i][1] + ny * half]);
    right.push([(pts[i][0] - nx * half) * flip, pts[i][1] - ny * half]);
  }
  return left.concat(right.reverse());
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Poly} poly
 * @param {number} [flip]
 */
function drawPoly(ctx, poly, flip = 1) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0] * flip, poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * flip, poly[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * @typedef {object} AtlasOptions
 * @property {number} strain 0 = fresh and confident, 1 = holding up a solar system.
 * @property {number} time   Seconds since the run began, for the tremble.
 * @property {number} scale  Camera scale, so outlines keep a sane on-screen thickness.
 * @property {AtlasStyle} style
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {AtlasOptions} opts
 */
export function drawAtlas(ctx, opts) {
  const { strain, time, scale, style } = opts;
  const ink = Math.max(4.5, 2 / scale);

  drawGround(ctx, style, ink);

  ctx.save();
  // He wobbles harder the more absurd the pile gets.
  const wobble = strain * 2.6;
  ctx.translate(Math.sin(time * 21) * wobble, Math.sin(time * 16.5 + 1.1) * wobble * 0.55);

  // Mitred joins, flat caps: every corner on this figure is a corner.
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.miterLimit = 3;
  ctx.fillStyle = STONE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;

  // Kneeling leg behind, then the body over it, then the near leg, head, arms.
  drawPoly(ctx, limbPolygon(THIGH_KNEEL));
  drawPoly(ctx, limbPolygon(SHIN_KNEEL));

  drawPoly(ctx, limbPolygon(THIGH_PLANTED));
  drawPoly(ctx, limbPolygon(SHIN_PLANTED));
  drawPoly(ctx, limbPolygon(FOOT_PLANTED));

  drawPoly(ctx, BODY);
  drawHead(ctx, strain, ink);

  for (const flip of [-1, 1]) {
    ctx.fillStyle = STONE;
    ctx.strokeStyle = INK;
    ctx.lineWidth = ink;
    drawPoly(ctx, limbPolygon(UPPER_ARM, flip));
    drawPoly(ctx, limbPolygon(FOREARM, flip));
    drawPoly(ctx, HAND, flip);
  }

  drawFacets(ctx, ink);
  if (strain > 0.3) drawEffort(ctx, strain, time, ink);

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {AtlasStyle} style
 * @param {number} ink
 */
function drawGround(ctx, style, ink) {
  const reach = 24000;
  ctx.fillStyle = style.ground;
  ctx.fillRect(-reach, GROUND_Y, reach * 2, reach);
  ctx.fillStyle = style.groundShade;
  ctx.fillRect(-reach, GROUND_Y, reach * 2, 9);
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.beginPath();
  ctx.moveTo(-reach, GROUND_Y);
  ctx.lineTo(reach, GROUND_Y);
  ctx.stroke();
}

/**
 * Bowed head, faceted like the rest of him.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} strain
 * @param {number} ink
 */
function drawHead(ctx, strain, ink) {
  const { x, y, rx, ry } = HEAD;
  /** @type {Poly} */
  const shape = [
    [0, -ry], [rx * 0.68, -ry * 0.72], [rx, -ry * 0.1], [rx * 0.72, ry * 0.72],
    [0, ry], [-rx * 0.72, ry * 0.72], [-rx, -ry * 0.1], [-rx * 0.68, -ry * 0.72],
  ].map((p) => /** @type {[number, number]} */ ([p[0] + x, p[1] + y]));

  ctx.fillStyle = STONE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  drawPoly(ctx, shape);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = ink * 0.9;
  ctx.lineCap = 'round';

  // Eyes: level when calm, screwed shut under load. Strokes, never curves.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (strain < 0.35) {
      ctx.moveTo(side * 20 - 10, -5);
      ctx.lineTo(side * 20 + 10, -5);
    } else {
      ctx.moveTo(side * 20 - 10, 1);
      ctx.lineTo(side * 20, -8);
      ctx.lineTo(side * 20 + 10, 1);
    }
    ctx.stroke();
  }

  if (strain > 0.55) {
    ctx.beginPath();
    ctx.moveTo(-33, -20); ctx.lineTo(-12, -12);
    ctx.moveTo(33, -20); ctx.lineTo(12, -12);
    ctx.stroke();
  }

  // Mouth: a set line, then bared teeth.
  ctx.lineCap = 'butt';
  if (strain < 0.35) {
    ctx.beginPath();
    ctx.moveTo(-10, 18);
    ctx.lineTo(10, 18);
    ctx.stroke();
  } else {
    const w = 12 + strain * 5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.rect(-w, 12, w * 2, 13);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo((i * w) / 2, 12);
      ctx.lineTo((i * w) / 2, 25);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The few interior lines that make him read as a carved figure rather than a
 * flat cut-out. All straight, all sparse.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ink
 */
function drawFacets(ctx, ink) {
  ctx.strokeStyle = STONE_SHADE;
  ctx.lineWidth = ink * 0.8;
  ctx.lineCap = 'butt';

  ctx.beginPath();
  // Shoulder blades and flanks.
  ctx.moveTo(-98, 22); ctx.lineTo(-62, 132); ctx.lineTo(-40, 248);
  ctx.moveTo(98, 22); ctx.lineTo(62, 132); ctx.lineTo(40, 248);
  ctx.moveTo(-78, 202); ctx.lineTo(0, 232); ctx.lineTo(78, 202);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    // Deltoid and forearm planes.
    ctx.moveTo(side * 132, 58); ctx.lineTo(side * 184, 132);
    ctx.moveTo(side * 200, 140); ctx.lineTo(side * 208, 66);
    ctx.stroke();

    // Knuckles across the flat of the hand.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(side * (134 + i * 20), 5);
      ctx.lineTo(side * (133 + i * 20), 19);
    }
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} strain
 * @param {number} time
 * @param {number} ink
 */
function drawEffort(ctx, strain, time, ink) {
  ctx.strokeStyle = '#5f9fd4';
  ctx.fillStyle = '#a9dcf7';
  ctx.lineWidth = ink * 0.8;
  ctx.lineJoin = 'round';

  const beads = strain > 0.7 ? 3 : 2;
  for (let i = 0; i < beads; i++) {
    const phase = (time * 0.7 + i * 0.41) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (66 + phase * 40);
    const y = 44 + phase * 120;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.95;
    // Angular droplet, to match everything else.
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 8, y + 2);
    ctx.lineTo(x, y + 10);
    ctx.lineTo(x - 8, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'miter';
}
