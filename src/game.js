import { Sfx } from './audio.js';
import { Camera } from './camera.js';
import { CATALOG, pickNext } from './catalog.js';
import { InputController } from './input.js';
import {
  Body,
  Composite,
  Matter,
  createEngine,
  createGround,
  createObjectBody,
  createPlatform,
  GROUND_Y,
  PLATFORM_TOP,
  projectDrop,
  TOPPLE_X,
  TOPPLE_Y,
} from './physics.js';
import { Renderer } from './render.js';
import { loadSprite, preload } from './sprites.js';

/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./render.js').HeldView} HeldView */
/** @typedef {'title' | 'playing' | 'toppling' | 'over'} Phase */

/**
 * @typedef {object} Held
 * @property {ObjectDef} def
 * @property {Sprite} sprite
 * @property {any} body Built up front so overlap tests use the exact shape that will be placed.
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number | null} restY
 * @property {boolean} valid
 */

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

export class Game {
  engine = createEngine();
  platform = createPlatform();
  /** @type {any[]} */
  placed = [];
  camera = new Camera();
  sfx = new Sfx();

  /** @type {Phase} */
  phase = 'title';
  score = 0;
  totalWeight = 0;
  /** @type {string[]} */
  recent = [];
  /** @type {Held | null} */
  held = null;
  /** Screen point the drag began at, and the world point the object began at. */
  /** @type {{ screen: import('./types.js').Vec, world: import('./types.js').Vec } | null} */
  dragAnchor = null;
  time = 0;
  accumulator = 0;
  lastFrame = 0;
  collapseAt = 0;
  dpr = 1;

  /** @param {{ canvas: HTMLCanvasElement, ui: import('./ui.js').UI }} deps */
  constructor(deps) {
    this.deps = deps;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (deps.canvas.getContext('2d'));
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

  /** @param {boolean} on */
  setSound(on) {
    this.sfx.enabled = on;
  }

  rotateStep() {
    this.input.rotateBy(Math.PI / 12);
  }

  async begin() {
    // Clear the world back to just Atlas' platform.
    for (const body of this.placed) Composite.remove(this.engine.world, body);
    this.placed = [];
    this.score = 0;
    this.totalWeight = 0;
    this.recent = [];
    this.held = null;
    this.dragAnchor = null;
    this.time = 0;
    this.phase = 'playing';
    this.input.reset();
    this.input.enabled = true;

    this.deps.ui.showGame();
    this.deps.ui.setScore(0);
    this.deps.ui.setWeight(0);
    // The stage is only measurable once it is on screen.
    this.resize();

    this.frameCamera();
    this.camera.snap();
    await this.spawnNext();
  }

  /** @param {number} [attempt] */
  async spawnNext(attempt = 0) {
    const def = pickNext(this.score, this.recent);
    this.recent.push(def.id);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();

    /** @type {Sprite} */
    let sprite;
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

  resize() {
    const { canvas } = this.deps;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);
    this.camera.view = {
      width,
      height,
      topInset: this.deps.ui.stageHeight(),
      bottomInset: this.deps.ui.hudHeight(),
    };
  }

  /** @param {number} now */
  loop = (now) => {
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    this.time += dt;

    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  };

  /** @param {number} dt */
  update(dt) {
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

  /**
   * The object is steered, not carried. Grabbing it sends it straight to the
   * top of the pile; after that the pointer contributes only its *movement*, so
   * you never have to drag your hand all the way up the screen — and the object
   * is never hidden under your finger.
   */
  updateHeld() {
    const held = this.held;
    if (!held) return;
    this.deps.ui.setDragging(this.input.dragging);
    if (!this.input.dragging) {
      this.dragAnchor = null;
      held.restY = null;
      held.valid = false;
      return;
    }

    if (!this.dragAnchor) {
      this.dragAnchor = {
        screen: { x: this.input.grabPoint.x, y: this.input.grabPoint.y },
        world: this.entryPosition(held.def.size),
      };
    }

    // Screen-space 1:1, so a centimetre of finger is a centimetre of object at
    // any zoom level.
    const scale = this.camera.scale;
    const anchor = this.dragAnchor;
    const wantX = anchor.world.x + (this.input.pointer.x - anchor.screen.x) / scale;
    const wantY = anchor.world.y + (this.input.pointer.y - anchor.screen.y) / scale;

    const bounds = this.camera.bounds();
    const margin = held.def.size * 0.5;
    held.x = clamp(wantX, bounds.minX + margin, bounds.maxX - margin);
    held.y = clamp(wantY, bounds.minY + margin, PLATFORM_TOP - margin - 6);
    held.angle = this.input.angle;

    const obstacles = [this.platform, ...this.placed];
    const maxDrop = this.camera.half * 2.4;
    const result = projectDrop(held.body, obstacles, held.x, held.y, held.angle, maxDrop);
    held.valid = result.status === 'ok';
    held.restY = result.status === 'ok' ? result.restY : null;
  }

  release() {
    const held = this.held;
    if (!held || this.phase !== 'playing') return;
    this.deps.ui.setDragging(false);

    if (!held.valid || held.restY === null) {
      this.sfx.reject();
      this.deps.ui.nudge();
      this.deps.ui.toast('Nothing underneath it');
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
    this.dragAnchor = null;
    this.deps.ui.setNext(null);
    void this.spawnNext();
  }

  /** @returns {boolean} */
  hasToppled() {
    for (const body of this.placed) {
      if (body.position.y > TOPPLE_Y) return true;
      if (Math.abs(body.position.x) > TOPPLE_X) return true;
    }
    return false;
  }

  collapse() {
    this.phase = 'toppling';
    this.collapseAt = this.time;
    this.input.enabled = false;
    this.input.reset();
    this.held = null;
    this.dragAnchor = null;
    this.deps.ui.setDragging(false);
    this.sfx.crash();
  }

  /**
   * Where an object appears when you first grab it: centred, just clear of the
   * highest thing on the pile.
   * @param {number} size
   * @returns {import('./types.js').Vec}
   */
  entryPosition(size) {
    return { x: 0, y: this.stackTop() - size * 0.5 - 26 };
  }

  /** @returns {number} highest occupied world y (most negative) */
  stackTop() {
    let top = PLATFORM_TOP;
    for (const body of this.placed) top = Math.min(top, body.bounds.min.y);
    return top;
  }

  /** Camera keeps the pile framed with guaranteed empty room above it. */
  frameCamera() {
    const top = this.stackTop();

    const nextSize = this.held?.def.size ?? 120;
    const headroom = Math.max(nextSize * 2.4, 340);
    const bottom = this.phase === 'over' || this.phase === 'toppling'
      ? Math.max(GROUND_Y + 12, lowestOf(this.placed) + 40)
      : GROUND_Y + 12;

    this.camera.frame(top, bottom, headroom);
  }

  /**
   * 0 → fresh, 1 → visibly regretting everything.
   * @returns {number}
   */
  strain() {
    const byCount = this.score / 26;
    const byMass = Math.log10(this.totalWeight + 1) / 9;
    return clamp(Math.max(byCount, byMass) * 0.85 + 0.05, 0, 1);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const held = this.held;
    /** @type {HeldView | null} */
    const view =
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

/**
 * @param {any[]} bodies
 * @returns {number}
 */
function lowestOf(bodies) {
  let low = 0;
  for (const body of bodies) low = Math.max(low, body.bounds.max.y);
  return low;
}

/**
 * @param {number} v @param {number} lo @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
