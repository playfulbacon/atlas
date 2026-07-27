/** @typedef {import('./types.js').Carrier} Carrier */
/** @typedef {{ ground: string, groundShade: string }} CarrierStyle */

/**
 * Draws whichever carrier the players picked. It knows nothing about what the
 * picture is — src/carriers.js has already measured where its load-bearing
 * surface is and scaled it into world units.
 */

const INK = '#17181a';

/**
 * `?terrain` in the URL draws the skyline the physics is actually using over
 * the artwork it was read from. There is no other way to tell a picture that
 * reads badly from one that reads fine, so it ships rather than living in a
 * scratch file.
 */
const SHOW_TERRAIN =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('terrain');

/**
 * @typedef {object} CarrierOptions
 * @property {Carrier | null} carrier
 * @property {number} strain 0 = fresh, 1 = holding up a solar system.
 * @property {number} time   Seconds since the run began, for the tremble.
 * @property {number} scale  Camera scale, so the ground line keeps a sane thickness.
 * @property {number} groundY
 * @property {CarrierStyle} style
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CarrierOptions} opts
 */
export function drawCarrier(ctx, opts) {
  const { carrier, strain, time, scale, groundY, style } = opts;

  drawGround(ctx, style, groundY, Math.max(4, 1.8 / scale));
  if (!carrier) return;

  ctx.save();
  // It wobbles harder the more absurd the pile gets.
  const wobble = strain * 2.8;
  ctx.translate(Math.sin(time * 21) * wobble, Math.sin(time * 16.5 + 1.1) * wobble * 0.55);

  const d = carrier.draw;
  ctx.drawImage(carrier.image, d.x, d.y, d.w, d.h);
  if (strain > 0.3) drawEffort(ctx, carrier, strain, time, scale);

  ctx.restore();

  // Outside the tremble, because the collision surface does not tremble.
  if (SHOW_TERRAIN) drawSkyline(ctx, carrier, groundY, scale);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Carrier} carrier
 * @param {number} groundY
 * @param {number} scale
 */
function drawSkyline(ctx, carrier, groundY, scale) {
  ctx.save();
  for (const run of carrier.surface) {
    if (run.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (const p of run) ctx.lineTo(p.x, p.y);
    ctx.lineTo(run[run.length - 1].x, groundY);
    ctx.lineTo(run[0].x, groundY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(224, 52, 44, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#e0342c';
    ctx.lineWidth = Math.max(2, 2 / scale);
    ctx.stroke();

    ctx.fillStyle = '#e0342c';
    for (const p of run) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, 3 / scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CarrierStyle} style
 * @param {number} groundY
 * @param {number} ink
 */
function drawGround(ctx, style, groundY, ink) {
  const reach = 24000;
  ctx.fillStyle = style.ground;
  ctx.fillRect(-reach, groundY, reach * 2, reach);
  ctx.fillStyle = style.groundShade;
  ctx.fillRect(-reach, groundY, reach * 2, 8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.beginPath();
  ctx.moveTo(-reach, groundY);
  ctx.lineTo(reach, groundY);
  ctx.stroke();
}

/**
 * Sweat. The artwork carries no expression, so this and the tremble are what
 * show how hard the thing is working.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Carrier} carrier
 * @param {number} strain
 * @param {number} time
 * @param {number} scale
 */
function drawEffort(ctx, carrier, strain, time, scale) {
  ctx.strokeStyle = '#4f93cc';
  ctx.fillStyle = '#a9dcf7';
  ctx.lineWidth = Math.max(2.5, 1.2 / scale);
  ctx.lineJoin = 'round';

  const beads = strain > 0.7 ? 3 : 2;
  for (let i = 0; i < beads; i++) {
    const phase = (time * 0.7 + i * 0.41) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (52 + phase * 30);
    const y = carrier.headY + phase * 96;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 8, y + 2);
    ctx.lineTo(x, y + 10);
    ctx.lineTo(x - 8, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
