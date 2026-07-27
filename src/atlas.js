import { GROUND_Y, PLATFORM_HALF } from './physics.js';

/**
 * Atlas is drawn, not simulated. The one rule: the top edge of this artwork is
 * the straight line y = 0 from −PLATFORM_HALF to +PLATFORM_HALF, which is
 * exactly the top of the static platform body. Hands, forearms and arched back
 * make one continuous flat shelf.
 */

const SKIN = '#e8b88a';
const SKIN_SHADE = '#d9a273';
const HAIR = '#e4e0d8';
const INK = '#1f1b17';

/** @typedef {{ ground: string, groundShade: string }} AtlasStyle */
/** @typedef {{ points: Array<[number, number]>, width: number }} Limb */

/**
 * Thigh out to the knee, then shin back in — an angular, straining squat.
 * @type {Limb[]}
 */
const LEGS = [
  { points: [[-48, 138], [-114, 190]], width: 34 },
  { points: [[-114, 190], [-98, 238]], width: 28 },
  { points: [[48, 138], [114, 190]], width: 34 },
  { points: [[114, 190], [98, 238]], width: 28 },
];

/** @type {Limb[]} */
const FEET = [
  { points: [[-100, 238], [-142, 238]], width: 22 },
  { points: [[100, 238], [142, 238]], width: 22 },
];

/**
 * Hands + forearms + arched shoulders, as one silhouette with a dead-flat top.
 * @param {CanvasRenderingContext2D} ctx
 */
function shelfPath(ctx) {
  const w = PLATFORM_HALF;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 17);
  ctx.bezierCurveTo(w, 23, w - 9, 25, w - 24, 25);
  ctx.bezierCurveTo(160, 25, 149, 29, 136, 33);
  ctx.bezierCurveTo(121, 38, 110, 47, 94, 51);
  ctx.bezierCurveTo(70, 58, 40, 66, 0, 66);
  ctx.bezierCurveTo(-40, 66, -70, 58, -94, 51);
  ctx.bezierCurveTo(-110, 47, -121, 38, -136, 33);
  ctx.bezierCurveTo(-149, 29, -160, 25, -(w - 24), 25);
  ctx.bezierCurveTo(-w + 9, 25, -w, 23, -w, 17);
  ctx.closePath();
}

/**
 * Chest and belly, hanging below the shoulders.
 * @param {CanvasRenderingContext2D} ctx
 */
function torsoPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-64, 36);
  ctx.bezierCurveTo(-72, 74, -62, 112, -54, 132);
  ctx.bezierCurveTo(-47, 150, -28, 160, 0, 160);
  ctx.bezierCurveTo(28, 160, 47, 150, 54, 132);
  ctx.bezierCurveTo(62, 112, 72, 74, 64, 36);
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
  torsoPath(ctx);
  ctx.fill();
  ctx.stroke();

  // A couple of lines so the chest does not read as a blank slab.
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = ink * 0.85;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 46, 70);
    ctx.quadraticCurveTo(side * 40, 84, side * 27, 86);
    ctx.stroke();
  }

  drawHead(ctx, strain, ink);

  // The shelf goes on last so it sits cleanly over the neck and shoulders.
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  shelfPath(ctx);
  ctx.fill();
  ctx.stroke();

  drawShelfDetail(ctx, ink);
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
  ctx.translate(0, 106);
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;

  // Beard first, so the face sits on top of it.
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-23, 6);
  ctx.bezierCurveTo(-26, 24, -14, 34, 0, 34);
  ctx.bezierCurveTo(14, 34, 26, 24, 23, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes: serene arcs that squeeze shut as the load grows.
  ctx.lineWidth = ink * 1.1;
  const squeeze = Math.min(1, strain * 1.4);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (squeeze < 0.5) {
      ctx.arc(side * 11, -1, 6.5, Math.PI * 0.15, Math.PI * 0.85);
    } else {
      ctx.moveTo(side * 11 - 6.5, 2);
      ctx.lineTo(side * 11, -5);
      ctx.lineTo(side * 11 + 6.5, 2);
    }
    ctx.stroke();
  }

  // Brow lines when it really starts to hurt.
  if (strain > 0.55) {
    ctx.beginPath();
    ctx.moveTo(-18, -16); ctx.lineTo(-6, -12);
    ctx.moveTo(18, -16); ctx.lineTo(6, -12);
    ctx.stroke();
  }

  // Mouth: calm line, then a gritted grimace.
  if (strain < 0.35) {
    ctx.beginPath();
    ctx.moveTo(-7, 15);
    ctx.quadraticCurveTo(0, 18, 7, 15);
    ctx.stroke();
  } else {
    const w = 8 + strain * 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.rect(-w, 10, w * 2, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo((i * w) / 2, 10);
      ctx.lineTo((i * w) / 2, 18);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ink
 */
function drawShelfDetail(ctx, ink) {
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = ink * 0.85;
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    // Wrist and shoulder creases mark hand / forearm / back.
    ctx.beginPath();
    ctx.moveTo(side * 172, 3);
    ctx.quadraticCurveTo(side * 168, 15, side * 170, 24);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(side * 96, 3);
    ctx.quadraticCurveTo(side * 90, 28, side * 94, 51);
    ctx.stroke();

    // Knuckles.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = side * (180 + i * 8);
      ctx.moveTo(x, 3);
      ctx.lineTo(x, 10);
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
  ctx.lineWidth = ink * 0.9;

  // Sweat beads that bloom out from the temples and fall away.
  const beads = strain > 0.7 ? 3 : 2;
  for (let i = 0; i < beads; i++) {
    const phase = (time * 0.7 + i * 0.41) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (34 + phase * 22);
    const y = 86 + phase * 58;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.bezierCurveTo(x + 6.5, y - 1, x + 6.5, y + 8, x, y + 8);
    ctx.bezierCurveTo(x - 6.5, y + 8, x - 6.5, y - 1, x, y - 9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
