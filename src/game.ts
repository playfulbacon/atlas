import Matter from 'matter-js';
import { Sfx } from './audio';
import { Camera } from './camera';
import { CATALOG, pickNext } from './catalog';
import { InputController } from './input';
import {
  Body,
  Composite,
  createEngine,
  createGround,
  createObjectBody,
  createPlatform,
  GROUND_Y,
  PLATFORM_TOP,
  projectDrop,
  TOPPLE_X,
  TOPPLE_Y,
  type PlacedBody,
} from './physics';
import { Renderer, type HeldView } from './render';
import { loadSprite, preload } from './sprites';
import type { ObjectDef, Sprite } from './types';

type Phase = 'title' | 'playing' | 'toppling' | 'over';

interface Held {
  def: ObjectDef;
  sprite: Sprite;
  /** Built up front so overlap tests use the exact shape that will be placed. */
  body: PlacedBody;
  x: number;
  y: number;
  angle: number;
  restY: number | null;
  valid: boolean;
}

const FIXED_STEP = 1000 / 60;
/** Objects remembered so the same fridge does not turn up twice in a row. */
const RECENT_MEMORY = 14;

const COLLAPSE_NOTES = [
  'Gravity remains undefeated.',
  'Atlas would like a word.',
  'It was going so well.',
  'Somebody had to hold it.',
  'The pile has voted.',
];

export interface GameDeps {
  canvas: HTMLCanvasElement;
  ui: import('./ui').UI;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private engine = createEngine();
  private platform = createPlatform();
  private placed: PlacedBody[] = [];
  private camera = new Camera();
  private renderer: Renderer;
  private input: InputController;
  private sfx = new Sfx();

  private phase: Phase = 'title';
  private score = 0;
  private totalWeight = 0;
  private recent: string[] = [];
  private held: Held | null = null;
  private time = 0;
  private accumulator = 0;
  private lastFrame = 0;
  private collapseAt = 0;
  private dpr = 1;

  constructor(private deps: GameDeps) {
    this.ctx = deps.canvas.getContext('2d')!;
    this.renderer = new Renderer(this.ctx);
    this.input = new InputController(deps.canvas);
    this.input.onRelease = () => this.release();
    this.input.enabled = false;

    Composite.add(this.engine.world, [this.platform, createGround()]);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());

    // Frame Atlas straight away so he is standing there behind the title card.
    this.frameCamera();
    this.camera.snap();

    // The first couple of tiers should be ready the instant Play is tapped.
    void preload(CATALOG.filter((o) => o.tier <= 2));
  }

  setSound(on: boolean): void {
    this.sfx.enabled = on;
  }

  rotateStep(): void {
    this.input.rotateBy(Math.PI / 12);
  }

  async begin(): Promise<void> {
    // Clear the world back to just Atlas' platform.
    for (const body of this.placed) Composite.remove(this.engine.world, body);
    this.placed = [];
    this.score = 0;
    this.totalWeight = 0;
    this.recent = [];
    this.held = null;
    this.time = 0;
    this.phase = 'playing';
    this.input.reset();
    this.input.enabled = true;

    this.deps.ui.showGame();
    this.deps.ui.setScore(0);
    this.deps.ui.setWeight(0);
    // The tray is only measurable once it is on screen.
    this.resize();

    this.frameCamera();
    this.camera.snap();
    await this.spawnNext();
  }

  private async spawnNext(attempt = 0): Promise<void> {
    const def = pickNext(this.score, this.recent);
    this.recent.push(def.id);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();

    let sprite: Sprite;
    try {
      sprite = await loadSprite(def);
    } catch {
      // Bad artwork should never end a run; just try a different object.
      if (this.phase === 'playing' && attempt < 8) await this.spawnNext(attempt + 1);
      return;
    }
    if (this.phase !== 'playing') return;

    this.input.angle = 0;
    this.held = {
      def,
      sprite,
      body: createObjectBody(def, sprite, 0, -10_000),
      x: 0,
      y: -10_000,
      angle: 0,
      restY: null,
      valid: false,
    };
    this.deps.ui.setNext(def);
  }

  /* ---------------------------------------------------------------- */

  private resize(): void {
    const { canvas } = this.deps;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);
    this.camera.view = {
      width,
      height,
      bottomInset: this.deps.ui.trayHeight(),
    };
  }

  loop = (now: number): void => {
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    this.time += dt;

    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    if (this.phase === 'playing') this.updateHeld();

    // Fixed-step physics with a bounded catch-up.
    this.accumulator += dt * 1000;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < 4) {
      Matter.Engine.update(this.engine, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (this.accumulator > FIXED_STEP * 4) this.accumulator = 0;

    if (this.phase === 'playing' && this.hasToppled()) this.collapse();
    if (this.phase === 'toppling' && this.time - this.collapseAt > 1.6) {
      this.phase = 'over';
      this.deps.ui.showGameOver(
        this.score,
        this.totalWeight,
        COLLAPSE_NOTES[Math.floor(Math.random() * COLLAPSE_NOTES.length)],
      );
    }

    this.frameCamera();
    this.camera.update(dt);
  }

  /** Follow the pointer, then work out where the object would land. */
  private updateHeld(): void {
    const held = this.held;
    if (!held) return;
    this.deps.ui.setDragging(this.input.dragging);
    if (!this.input.dragging) {
      held.restY = null;
      held.valid = false;
      return;
    }

    const onScreenSize = held.def.size * this.camera.scale;
    // On touch, hold the object clear of the finger covering it.
    const lift = this.input.touchDrag ? Math.max(56, onScreenSize * 0.65) : 0;
    const world = this.camera.screenToWorld({
      x: this.input.pointer.x,
      y: this.input.pointer.y - lift,
    });

    const bounds = this.camera.bounds();
    const margin = held.def.size * 0.5;
    held.x = clamp(world.x, bounds.minX + margin, bounds.maxX - margin);
    held.y = clamp(world.y, bounds.minY + margin, PLATFORM_TOP - margin - 6);
    held.angle = this.input.angle;

    const obstacles = [this.platform, ...this.placed];
    const maxDrop = this.camera.half * 2.4;
    const result = projectDrop(held.body, obstacles, held.x, held.y, held.angle, maxDrop);
    held.valid = result.status === 'ok';
    held.restY = result.status === 'ok' ? result.restY : null;
  }

  private release(): void {
    const held = this.held;
    if (!held || this.phase !== 'playing') return;
    this.deps.ui.setDragging(false);

    if (!held.valid || held.restY === null) {
      this.sfx.reject();
      this.deps.ui.nudge();
      this.deps.ui.toast(
        held.restY === null && !held.valid ? 'Needs something underneath it' : 'No room there',
      );
      held.restY = null;
      return;
    }

    // Snap to the previewed resting spot — the shadow was a promise, not a guess.
    const body = held.body;
    Body.setAngle(body, held.angle);
    Body.setPosition(body, { x: held.x, y: held.restY });
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    Composite.add(this.engine.world, body);
    this.placed.push(body);

    this.score += 1;
    this.totalWeight += held.def.weight;
    this.deps.ui.setScore(this.score);
    this.deps.ui.setWeight(this.totalWeight);
    this.sfx.place(this.strain());

    this.held = null;
    this.deps.ui.setNext(null);
    void this.spawnNext();
  }

  private hasToppled(): boolean {
    for (const body of this.placed) {
      if (body.position.y > TOPPLE_Y) return true;
      if (Math.abs(body.position.x) > TOPPLE_X) return true;
    }
    return false;
  }

  private collapse(): void {
    this.phase = 'toppling';
    this.collapseAt = this.time;
    this.input.enabled = false;
    this.input.reset();
    this.held = null;
    this.deps.ui.setDragging(false);
    this.sfx.crash();
  }

  /** Camera keeps the pile framed with guaranteed empty room above it. */
  private frameCamera(): void {
    let top = PLATFORM_TOP;
    for (const body of this.placed) top = Math.min(top, body.bounds.min.y);

    const nextSize = this.held?.def.size ?? 120;
    const headroom = Math.max(nextSize * 2.4, 340);
    const bottom = this.phase === 'over' || this.phase === 'toppling'
      ? Math.max(GROUND_Y + 40, lowestOf(this.placed) + 60)
      : GROUND_Y + 40;

    this.camera.frame(top, bottom, headroom);
  }

  /** 0 → fresh, 1 → visibly regretting everything. */
  private strain(): number {
    const byCount = this.score / 26;
    const byMass = Math.log10(this.totalWeight + 1) / 9;
    return clamp(Math.max(byCount, byMass) * 0.85 + 0.05, 0, 1);
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const held = this.held;
    const view: HeldView | null =
      held && this.input.dragging
        ? {
            def: held.def,
            sprite: held.sprite,
            x: held.x,
            y: held.y,
            angle: held.angle,
            restY: held.restY,
            valid: held.valid,
          }
        : null;

    this.renderer.draw(this.camera, this.placed, view, this.strain(), this.time);
    ctx.restore();
  }
}

function lowestOf(bodies: PlacedBody[]): number {
  let low = 0;
  for (const body of bodies) low = Math.max(low, body.bounds.max.y);
  return low;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
