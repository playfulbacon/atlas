import { drawAtlas } from './atlas';
import type { Camera } from './camera';
import type { PlacedBody } from './physics';
import type { ObjectDef, Sprite } from './types';

/** How high you have to stack before the sky runs out. */
const SPACE_ALTITUDE = 7200;

interface SkyStop {
  at: number;
  top: string;
  bottom: string;
  ground: string;
  groundShade: string;
}

const SKY: SkyStop[] = [
  { at: 0.0, top: '#bfe2f5', bottom: '#eaf7fd', ground: '#c9d8a8', groundShade: '#b3c78e' },
  { at: 0.35, top: '#7fb2e0', bottom: '#cbe6f7', ground: '#b8cb9c', groundShade: '#a2ba85' },
  { at: 0.68, top: '#2f4f96', bottom: '#7aa8d8', ground: '#8fa27d', groundShade: '#7b8f6b' },
  { at: 1.0, top: '#080c1e', bottom: '#1b2a52', ground: '#4a5347', groundShade: '#3d453b' },
];

interface Star {
  x: number;
  y: number;
  r: number;
  twinkle: number;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  puffs: Array<[number, number, number]>;
}

export interface HeldView {
  def: ObjectDef;
  sprite: Sprite;
  x: number;
  y: number;
  angle: number;
  /** Where it will come to rest, if it can. */
  restY: number | null;
  valid: boolean;
}

export class Renderer {
  private stars: Star[] = [];
  private clouds: Cloud[] = [];

  constructor(private ctx: CanvasRenderingContext2D) {
    this.buildBackdrop();
  }

  private buildBackdrop(): void {
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 9000,
        y: -Math.random() * 16000 - 500,
        r: 2 + Math.random() * 5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 70; i++) {
      const puffs: Array<[number, number, number]> = [];
      const n = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < n; p++) {
        puffs.push([(p - (n - 1) / 2) * 70 + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 26, 46 + Math.random() * 38]);
      }
      this.clouds.push({
        x: (Math.random() - 0.5) * 7000,
        y: -300 - Math.random() * 7000,
        scale: 0.6 + Math.random() * 0.95,
        puffs,
      });
    }
  }

  draw(
    camera: Camera,
    bodies: PlacedBody[],
    held: HeldView | null,
    strain: number,
    time: number,
  ): void {
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

    drawAtlas(ctx, { strain, time, scale, style: sky });

    for (const body of bodies) this.drawBody(body);

    if (held) this.drawHeld(held, scale, time);

    ctx.restore();
  }

  private drawStars(altitude: number, time: number, view: ReturnType<Camera['bounds']>): void {
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

  private drawClouds(altitude: number, view: ReturnType<Camera['bounds']>): void {
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

  private drawBody(body: PlacedBody): void {
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

  private drawHeld(held: HeldView, scale: number, time: number): void {
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
      ctx.globalCompositeOperation = 'source-over';
      blitTinted(ctx, sprite, def.size, '#e0342c');
      ctx.restore();
    }
    blit(ctx, sprite.canvas, sprite, def.size);
    ctx.restore();
  }
}

function blit(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sprite: Sprite,
  size: number,
): void {
  const d = sprite.draw;
  ctx.drawImage(image, d.x * size, d.y * size, d.w * size, d.h * size);
}

/** Silhouette in a colour, used for the "you cannot put it there" wash. */
function blitTinted(ctx: CanvasRenderingContext2D, sprite: Sprite, size: number, colour: string): void {
  blit(ctx, tintCache(sprite, colour), sprite, size);
}

const tints = new WeakMap<Sprite, Map<string, HTMLCanvasElement>>();

function tintCache(sprite: Sprite, colour: string): HTMLCanvasElement {
  let bucket = tints.get(sprite);
  if (!bucket) { bucket = new Map(); tints.set(sprite, bucket); }
  let canvas = bucket.get(colour);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = sprite.silhouette.width;
    canvas.height = sprite.silhouette.height;
    const c = canvas.getContext('2d')!;
    c.drawImage(sprite.silhouette, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = colour;
    c.fillRect(0, 0, canvas.width, canvas.height);
    bucket.set(colour, canvas);
  }
  return canvas;
}

function skyAt(t: number): SkyStop {
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

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t)) + (((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t)) + (((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t)) + ((pb & 255) * t));
  return `rgb(${r},${g},${bl})`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
