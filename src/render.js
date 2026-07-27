import { drawCarrier } from './carrier.js';

/** @typedef {import('./camera.js').Camera} Camera */
/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */

/** How high you have to stack before the sky runs out. */
const SPACE_ALTITUDE = 7200;

/**
 * @typedef {object} SkyStop
 * @property {number} at
 * @property {string} top
 * @property {string} bottom
 * @property {string} ground
 * @property {string} groundShade
 */

/** @type {SkyStop[]} */
const SKY = [
  { at: 0.0, top: '#bfe2f5', bottom: '#eaf7fd', ground: '#c9d8a8', groundShade: '#b3c78e' },
  { at: 0.35, top: '#7fb2e0', bottom: '#cbe6f7', ground: '#b8cb9c', groundShade: '#a2ba85' },
  { at: 0.68, top: '#2f4f96', bottom: '#7aa8d8', ground: '#8fa27d', groundShade: '#7b8f6b' },
  { at: 1.0, top: '#080c1e', bottom: '#1b2a52', ground: '#4a5347', groundShade: '#3d453b' },
];

/**
 * @typedef {object} HeldView
 * @property {ObjectDef} def
 * @property {Sprite} sprite
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number | null} restY Where it will come to rest, if it can.
 * @property {boolean} valid
 */

export class Renderer {
  /** @type {Array<{ x: number, y: number, r: number, twinkle: number }>} */
  stars = [];
  /** @type {Array<{ x: number, y: number, scale: number, puffs: Array<[number, number, number]> }>} */
  clouds = [];

  /** @param {CanvasRenderingContext2D} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.buildBackdrop();
  }

  buildBackdrop() {
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 9000,
        y: -Math.random() * 16000 - 500,
        r: 2 + Math.random() * 5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 70; i++) {
      /** @type {Array<[number, number, number]>} */
      const puffs = [];
      const n = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < n; p++) {
        puffs.push([
          (p - (n - 1) / 2) * 70 + (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 26,
          46 + Math.random() * 38,
        ]);
      }
      this.clouds.push({
        x: (Math.random() - 0.5) * 7000,
        y: -300 - Math.random() * 7000,
        scale: 0.6 + Math.random() * 0.95,
        puffs,
      });
    }
  }

  /**
   * @param {Camera} camera
   * @param {any[]} bodies
   * @param {HeldView | null} held
   * @param {number} strain
   * @param {number} time
   * @param {import('./types.js').Carrier | null} carrier
   * @param {number} groundY
   */
  draw(camera, bodies, held, strain, time, carrier, groundY) {
    const ctx = this.ctx;
    const { width, height } = camera.view;
    const altitude = clamp01(-(camera.y - camera.half) / SPACE_ALTITUDE);
    const sky = skyAt(altitude);

    // --- backdrop, in screen space ---
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, sky.top);
    gradient.addColorStop(1, sky.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // --- world space ---
    ctx.save();
    const scale = camera.scale;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, -camera.y);
    const view = camera.bounds();

    if (altitude > 0.4) this.drawStars(altitude, time, view);
    this.drawClouds(altitude, view);

    drawCarrier(ctx, { carrier, strain, time, scale, groundY, style: sky });

    for (const body of bodies) this.drawBody(body);

    if (held) this.drawHeld(held, scale, time);

    ctx.restore();
  }

  /**
   * @param {number} altitude
   * @param {number} time
   * @param {ReturnType<Camera['bounds']>} view
   */
  drawStars(altitude, time, view) {
    const ctx = this.ctx;
    const alpha = clamp01((altitude - 0.4) / 0.35);
    ctx.fillStyle = '#ffffff';
    for (const star of this.stars) {
      if (star.y < view.minY - 200 || star.y > view.maxY + 200) continue;
      if (star.x < view.minX - 200 || star.x > view.maxX + 200) continue;
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(time * 1.6 + star.twinkle));
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * @param {number} altitude
   * @param {ReturnType<Camera['bounds']>} view
   */
  drawClouds(altitude, view) {
    const ctx = this.ctx;
    const alpha = (1 - clamp01((altitude - 0.45) / 0.4)) * 0.7;
    if (alpha <= 0.01) return;
    ctx.fillStyle = '#ffffff';
    for (const cloud of this.clouds) {
      const reach = 200 * cloud.scale;
      if (cloud.y < view.minY - reach || cloud.y > view.maxY + reach) continue;
      if (cloud.x < view.minX - reach || cloud.x > view.maxX + reach) continue;
      ctx.globalAlpha = alpha * 0.72;
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      ctx.beginPath();
      for (const [px, py, pr] of cloud.puffs) {
        ctx.moveTo(px + pr, py);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** @param {any} body */
  drawBody(body) {
    const sprite = body.gameSprite;
    const def = body.gameDef;
    if (!sprite || !def) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    const offset = body.gameArtOffset ?? { x: 0, y: 0 };
    ctx.translate(offset.x, offset.y);
    blit(ctx, sprite.canvas, sprite, def.size);
    ctx.restore();
  }

  /**
   * @param {HeldView} held
   * @param {number} scale
   * @param {number} time
   */
  drawHeld(held, scale, time) {
    const ctx = this.ctx;
    const { sprite, def } = held;

    // Where it lands.
    if (held.restY !== null) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.translate(held.x, held.restY);
      ctx.rotate(held.angle);
      blit(ctx, sprite.silhouette, sprite, def.size);
      ctx.restore();

      // Dashed drop line, so the connection between hand and shadow is obvious.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#1f1b17';
      ctx.lineWidth = Math.max(1.5, 1.5 / scale);
      ctx.setLineDash([10 / scale, 10 / scale]);
      ctx.beginPath();
      ctx.moveTo(held.x, held.y);
      ctx.lineTo(held.x, held.restY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(held.x, held.y);
    ctx.rotate(held.angle);
    if (!held.valid) {
      // Refused placement: a soft red wash under the art plus a nervous jitter.
      ctx.translate(Math.sin(time * 40) * 3, 0);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.filter = 'blur(2px)';
      blit(ctx, tintCache(sprite, '#e0342c'), sprite, def.size);
      ctx.restore();
    }
    blit(ctx, sprite.canvas, sprite, def.size);
    ctx.restore();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} image
 * @param {Sprite} sprite
 * @param {number} size
 */
function blit(ctx, image, sprite, size) {
  const d = sprite.draw;
  ctx.drawImage(image, d.x * size, d.y * size, d.w * size, d.h * size);
}

/** @type {WeakMap<Sprite, Map<string, HTMLCanvasElement>>} */
const tints = new WeakMap();

/**
 * Silhouette in a colour, used for the "you cannot put it there" wash.
 * @param {Sprite} sprite
 * @param {string} colour
 * @returns {HTMLCanvasElement}
 */
function tintCache(sprite, colour) {
  let bucket = tints.get(sprite);
  if (!bucket) { bucket = new Map(); tints.set(sprite, bucket); }
  let canvas = bucket.get(colour);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = sprite.silhouette.width;
    canvas.height = sprite.silhouette.height;
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    c.drawImage(sprite.silhouette, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = colour;
    c.fillRect(0, 0, canvas.width, canvas.height);
    bucket.set(colour, canvas);
  }
  return canvas;
}

/**
 * @param {number} t
 * @returns {SkyStop}
 */
function skyAt(t) {
  let lo = SKY[0];
  let hi = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (t >= SKY[i].at && t <= SKY[i + 1].at) { lo = SKY[i]; hi = SKY[i + 1]; break; }
  }
  const span = hi.at - lo.at || 1;
  const k = clamp01((t - lo.at) / span);
  return {
    at: t,
    top: mixHex(lo.top, hi.top, k),
    bottom: mixHex(lo.bottom, hi.bottom, k),
    ground: mixHex(lo.ground, hi.ground, k),
    groundShade: mixHex(lo.groundShade, hi.groundShade, k),
  };
}

/**
 * @param {string} a @param {string} b @param {number} t
 * @returns {string}
 */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t)) + (((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t)) + (((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t)) + ((pb & 255) * t));
  return `rgb(${r},${g},${bl})`;
}

/** @param {number} v @returns {number} */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
