import { GROUND_Y } from './physics.js';

/**
 * Atlas is drawn, not simulated. He is hunched forward with the load riding on
 * his upper back, arms hanging down and out to the elbows, forearms rising at
 * his sides, and both palms turned inward at the top to meet his back.
 *
 * The one rule: the crown of his back and the flats of both palms sit at
 * exactly y = 0 and together span the platform's full 400 units, which is the
 * top surface of the static platform body. There is no slab — the back and the
 * hands *are* the surface.
 */

const SKIN = '#e8b88a';
const SKIN_SHADE = '#d9a273';
const HAIR = '#e4e0d8';
const INK = '#1f1b17';

/** @typedef {{ ground: string, groundShade: string }} AtlasStyle */
/** @typedef {{ points: Array<[number, number]>, width: number }} Limb */

/**
 * A deep squat under the weight. His stance is wider than the load he carries,
 * which is what stops the whole arrangement reading as a table.
 * @type {Limb[]}
 */
const LEGS = [
  { points: [[-70, 162], [-176, 282]], width: 46 },
  { points: [[-176, 282], [-154, 366]], width: 38 },
  { points: [[70, 162], [176, 282]], width: 46 },
  { points: [[176, 282], [154, 366]], width: 38 },
];

/** @type {Limb[]} */
const FEET = [
  { points: [[-158, 366], [-216, 366]], width: 28 },
  { points: [[158, 366], [216, 366]], width: 28 },
];

/**
 * Arms reaching up and back. Upper arm drops from under the shoulder out to a
 * low elbow, forearm climbs almost vertically at his side, then the palm turns
 * inward along the top — half its own width below y = 0, so its flat lands
 * exactly on the carrying surface and bridges from the hand to the back.
 * @type {Limb[]}
 */
const ARMS = [
  { points: [[-84, 96], [-140, 104], [-176, 128]], width: 40 },
  { points: [[-176, 128], [-188, 40]], width: 34 },
  { points: [[-187, 13], [-132, 13]], width: 26 },
  { points: [[84, 96], [140, 104], [176, 128]], width: 40 },
  { points: [[176, 128], [188, 40]], width: 34 },
  { points: [[187, 13], [132, 13]], width: 26 },
];

const ELBOW = { x: 176, y: 128 };
const WRIST = { x: 186, y: 42 };

/**
 * Atlas' body, as one silhouette: the flat of his back across the top, rolling
 * over the shoulders and down the flanks into his hips.
 *
 * Deliberately a single closed path. Drawing the back as its own shape on top
 * of a torso gave him an outlined dome — a bowl strapped to his shoulders —
 * which is not what a bent-over back looks like. His head hangs below and
 * covers the middle of the bottom edge, so no closed rim reads anywhere.
 * @param {CanvasRenderingContext2D} ctx
 */
function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-120, 0);
  ctx.lineTo(120, 0);
  ctx.bezierCurveTo(131, 4, 129, 28, 124, 54);
  ctx.bezierCurveTo(118, 84, 106, 112, 94, 134);
  ctx.bezierCurveTo(84, 152, 62, 164, 36, 168);
  ctx.bezierCurveTo(24, 170, 12, 171, 0, 171);
  ctx.bezierCurveTo(-12, 171, -24, 170, -36, 168);
  ctx.bezierCurveTo(-62, 164, -84, 152, -94, 134);
  ctx.bezierCurveTo(-106, 112, -118, 84, -124, 54);
  ctx.bezierCurveTo(-129, 28, -131, 4, -120, 0);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Limb} limb
 */
function limbPath(ctx, limb) {
  ctx.beginPath();
  const [first, ...rest] = limb.points;
  ctx.moveTo(first[0], first[1]);
  if (rest.length === 1) {
    ctx.lineTo(rest[0][0], rest[0][1]);
  } else {
    ctx.quadraticCurveTo(rest[0][0], rest[0][1], rest[1][0], rest[1][1]);
  }
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
  const ink = Math.max(3.4, 1.5 / scale);

  drawGround(ctx, style, ink);

  ctx.save();
  // He wobbles harder the more absurd the pile gets.
  const wobble = strain * 2.6;
  ctx.translate(Math.sin(time * 21) * wobble, Math.sin(time * 16.5 + 1.1) * wobble * 0.55);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Thick limbs are stroked twice: once wide in ink, once narrower in skin.
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? INK : SKIN;
    for (const limb of [...LEGS, ...FEET]) {
      ctx.lineWidth = limb.width + (pass === 0 ? ink * 2 : 0);
      limbPath(ctx, limb);
      ctx.stroke();
    }
  }

  ctx.fillStyle = SKIN;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  bodyPath(ctx);
  ctx.fill();
  ctx.stroke();

  // Head hangs below the back, covering the middle of its lower edge.
  drawHead(ctx, strain, ink);

  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? INK : SKIN;
    for (const limb of ARMS) {
      ctx.lineWidth = limb.width + (pass === 0 ? ink * 2 : 0);
      limbPath(ctx, limb);
      ctx.stroke();
    }
  }

  drawArmDetail(ctx, ink);
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} strain
 * @param {number} ink
 */
function drawHead(ctx, strain, ink) {
  ctx.save();
  ctx.translate(0, 176);
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;

  // Beard first, so the face sits on top of it.
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-43, 36);
  ctx.bezierCurveTo(-50, 68, -24, 86, 0, 86);
  ctx.bezierCurveTo(24, 86, 50, 68, 43, 36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes: serene arcs that squeeze shut as the load grows.
  ctx.lineWidth = ink * 1.1;
  const squeeze = Math.min(1, strain * 1.4);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (squeeze < 0.5) {
      ctx.arc(side * 22, -3, 13, Math.PI * 0.15, Math.PI * 0.85);
    } else {
      ctx.moveTo(side * 22 - 13, 4);
      ctx.lineTo(side * 22, -10);
      ctx.lineTo(side * 22 + 13, 4);
    }
    ctx.stroke();
  }

  // Brow lines when it really starts to hurt.
  if (strain > 0.55) {
    ctx.beginPath();
    ctx.moveTo(-36, -18); ctx.lineTo(-12, -8);
    ctx.moveTo(36, -18); ctx.lineTo(12, -8);
    ctx.stroke();
  }

  // Mouth: calm line, then a gritted grimace.
  if (strain < 0.35) {
    ctx.beginPath();
    ctx.moveTo(-14, 24);
    ctx.quadraticCurveTo(0, 31, 14, 24);
    ctx.stroke();
  } else {
    const w = 15 + strain * 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.rect(-w, 14, w * 2, 16);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo((i * w) / 2, 14);
      ctx.lineTo((i * w) / 2, 30);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ink
 */
function drawArmDetail(ctx, ink) {
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    ctx.strokeStyle = SKIN_SHADE;
    ctx.lineWidth = ink * 0.85;

    // Elbow, across the outside of the bend.
    ctx.beginPath();
    ctx.moveTo(side * (ELBOW.x - 18), ELBOW.y - 4);
    ctx.quadraticCurveTo(side * (ELBOW.x + 2), ELBOW.y + 6, side * (ELBOW.x + 16), ELBOW.y - 6);
    ctx.stroke();

    // Wrist, where the forearm turns into the flat of the palm.
    ctx.beginPath();
    ctx.moveTo(side * (WRIST.x - 16), WRIST.y - 4);
    ctx.quadraticCurveTo(side * WRIST.x, WRIST.y + 5, side * (WRIST.x + 14), WRIST.y - 6);
    ctx.stroke();

    // Forearm line, following the climb.
    ctx.beginPath();
    ctx.moveTo(side * (ELBOW.x + 4), ELBOW.y - 14);
    ctx.quadraticCurveTo(side * (ELBOW.x + 12), 90, side * (WRIST.x + 1), WRIST.y + 12);
    ctx.stroke();

    // Fingers along the palm, pointing in toward his spine.
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = side * (140 + i * 13);
      ctx.moveTo(x, 3);
      ctx.lineTo(x, 12);
    }
    ctx.stroke();

    // Thumb, hooked under the near edge of the palm.
    ctx.strokeStyle = INK;
    ctx.lineWidth = ink;
    ctx.beginPath();
    ctx.moveTo(side * 136, 22);
    ctx.quadraticCurveTo(side * 126, 30, side * 118, 24);
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
  ctx.lineWidth = ink * 0.9;

  // Sweat beads that bloom out from the temples and fall away.
  const beads = strain > 0.7 ? 3 : 2;
  for (let i = 0; i < beads; i++) {
    const phase = (time * 0.7 + i * 0.41) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (66 + phase * 34);
    const y = 150 + phase * 96;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.bezierCurveTo(x + 9, y - 1, x + 9, y + 11, x, y + 11);
    ctx.bezierCurveTo(x - 9, y + 11, x - 9, y - 1, x, y - 13);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
