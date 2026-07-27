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
  createTerrain,
  GROUND_MARGIN,
  PLATFORM_TOP,
  projectDrop,
  TOPPLE_X,
} from './physics.js';
import { loadCarrier } from './carriers.js';
import { Renderer } from './render.js';
import { loadSprite, preload } from './sprites.js';

/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./render.js').HeldView} HeldView */
/** @typedef {'title' | 'playing' | 'toppling' | 'over'} Phase */

/** @typedef {import('./types.js').Carrier} Carrier */
/** @typedef {import('./types.js').CarrierDef} CarrierDef */
/** @typedef {import('./types.js').Player} Player */

/** How many objects are on offer at any moment. */
export const SLOT_COUNT = 3;

/**
 * @typedef {object} Slot
 * @property {ObjectDef} def
 * @property {Sprite} sprite
 * @property {any} body
 */

/**
 * @typedef {object} Held
 * @property {number} slot Which of the three offers is in hand.
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
/** Only used before a carrier has been measured. */
const DEFAULT_GROUND_Y = 460;
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
  /** Static slabs under the carrier's skyline. Rebuilt whenever it changes. */
  /** @type {any[]} */
  terrain = [];
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
  /** Three objects on offer; the player picks one of them each turn. */
  /** @type {Array<Slot | null>} */
  slots = [null, null, null];
  /** @type {Player[]} */
  players = [];
  /** Whose turn it is. */
  turn = 0;
  /** @type {Carrier | null} */
  carrier = null;
  /** Ground depth of the current carrier. */
  groundY = DEFAULT_GROUND_Y;
  /** @type {any} */
  ground = null;
  /** Set when a drag began somewhere that is not an object, so it is ignored. */
  dragBlocked = false;
  /** Why the current aim is no good, ready for the toast on a bad release. */
  refusal = 'Nothing underneath it';
  /** @type {Held | null} */
  held = null;
  /** Screen point the drag began at, and the world point the object began at. */
  /** @type {{ screen: import('./types.js').Vec, world: import('./types.js').Vec } | null} */
  dragAnchor = null;
  time = 0;
  accumulator = 0;
  lastFrame = 0;
  collapseAt = 0;
  /** Who placed the object that finished it off. */
  lastPlacer = 0;
  dpr = 1;

  /** @param {{ canvas: HTMLCanvasElement, ui: import('./ui.js').UI }} deps */
  constructor(deps) {
    this.deps = deps;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (deps.canvas.getContext('2d'));
    this.renderer = new Renderer(this.ctx);
    this.input = new InputController(deps.canvas);
    this.input.onRelease = () => this.release();
    this.input.enabled = false;

    this.setCarrier(null);
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

  /**
   * Swaps in a carrier: its skyline becomes the collision surface and its feet
   * decide where the ground is. Passing null falls back to a plain flat shelf,
   * which is what stands behind the title card.
   * @param {Carrier | null} carrier
   */
  setCarrier(carrier) {
    this.carrier = carrier;
    this.groundY = carrier ? carrier.groundY : DEFAULT_GROUND_Y;

    for (const slab of this.terrain) Composite.remove(this.engine.world, slab);
    if (this.ground) Composite.remove(this.engine.world, this.ground);

    this.terrain = carrier ? createTerrain(carrier.surface) : createPlatform();
    this.ground = createGround(this.groundY);

    Composite.add(this.engine.world, this.terrain);
    Composite.add(this.engine.world, this.ground);
  }

  /**
   * @param {{ names: string[], carrier: CarrierDef }} setup
   */
  async begin(setup) {
    for (const body of this.placed) Composite.remove(this.engine.world, body);
    this.placed = [];
    this.score = 0;
    this.totalWeight = 0;
    this.recent = [];
    this.slots = [null, null, null];
    this.held = null;
    this.dragAnchor = null;
    this.dragBlocked = false;
    this.time = 0;
    this.turn = 0;
    this.players = setup.names.map((name) => ({ name, weight: 0, placed: 0 }));
    this.phase = 'playing';
    this.input.reset();
    this.input.enabled = true;

    try {
      this.setCarrier(await loadCarrier(setup.carrier));
    } catch {
      // A missing picture should not end the run; a flat shelf will do.
      this.setCarrier(null);
    }

    this.deps.ui.showGame();
    this.deps.ui.setPlayers(this.players, this.turn);
    this.deps.ui.setTotals(0, 0);
    // The slot row is only measurable once it is on screen.
    this.resize();

    this.frameCamera();
    this.camera.snap();
    await Promise.all([this.fillSlot(0), this.fillSlot(1), this.fillSlot(2)]);
  }

  /**
   * Puts a fresh object into one of the three offers.
   * @param {number} index
   * @param {number} [attempt]
   */
  async fillSlot(index, attempt = 0) {
    const taken = this.slots.filter(Boolean).map((s) => /** @type {Slot} */ (s).def.id);
    const def = pickNext(this.score, [...this.recent, ...taken]);
    this.recent.push(def.id);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();

    /** @type {Sprite} */
    let sprite;
    try {
      sprite = await loadSprite(def);
    } catch {
      // Bad artwork should never end a run; just try a different object.
      if (this.phase === 'playing' && attempt < 8) await this.fillSlot(index, attempt + 1);
      return;
    }
    if (this.phase !== 'playing') return;

    this.slots[index] = { def, sprite, body: createObjectBody(def, sprite, 0, -10_000) };
    this.deps.ui.setSlot(index, def);
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
      this.deps.ui.showGameOver({
        players: this.players,
        objects: this.score,
        weight: this.totalWeight,
        blame: this.players[this.lastPlacer]?.name ?? '',
        note: COLLAPSE_NOTES[Math.floor(Math.random() * COLLAPSE_NOTES.length)],
      });
    }

    this.frameCamera();
    this.camera.update(dt);
  }

  /**
   * The object is lifted out of its stage: on grab it appears exactly where it
   * was sitting, and from then on the pointer contributes only its *movement*,
   * one-to-one in screen pixels. So it never teleports, and it never hides
   * under your finger either.
   */
  updateHeld() {
    if (!this.input.dragging) {
      this.dragAnchor = null;
      this.dragBlocked = false;
      if (this.held) {
        this.held = null;
        this.deps.ui.setSelected(-1);
      }
      return;
    }

    // A drag only means something if it started on one of the three offers.
    if (!this.held) {
      if (this.dragBlocked) return;
      const slot = this.deps.ui.slotAt(this.input.grabPoint);
      const entry = slot >= 0 ? this.slots[slot] : null;
      if (!entry) { this.dragBlocked = true; return; }

      this.input.angle = 0;
      this.held = {
        slot, def: entry.def, sprite: entry.sprite, body: entry.body,
        x: 0, y: 0, angle: 0, restY: null, valid: false,
      };
      this.dragAnchor = {
        screen: { x: this.input.grabPoint.x, y: this.input.grabPoint.y },
        world: this.camera.screenToWorld(this.deps.ui.slotAnchor(slot)),
      };
      this.deps.ui.setSelected(slot);
    }

    const held = this.held;
    // Screen-space 1:1, so a centimetre of finger is a centimetre of object at
    // any zoom level.
    const scale = this.camera.scale;
    const anchor = /** @type {NonNullable<typeof this.dragAnchor>} */ (this.dragAnchor);
    const wantX = anchor.world.x + (this.input.pointer.x - anchor.screen.x) / scale;
    const wantY = anchor.world.y + (this.input.pointer.y - anchor.screen.y) / scale;

    const bounds = this.camera.bounds();
    const margin = held.def.size * 0.5;
    held.x = clamp(wantX, bounds.minX + margin, bounds.maxX - margin);
    // Reaching well below the top of the carrier is the whole point of a
    // skyline — a hollow between two ledges is somewhere you can aim.
    held.y = clamp(wantY, bounds.minY + margin, this.groundY - margin);
    held.angle = this.input.angle;

    const obstacles = [...this.terrain, ...this.placed];
    const maxDrop = this.camera.half * 2.4;
    const result = projectDrop(held.body, obstacles, held.x, held.y, held.angle, maxDrop);
    // A landing that would come to rest in the grass is refused rather than
    // taken and instantly lost — the shadow and the topple rule have to agree.
    if (result.status === 'ok' && result.restBottom <= this.floorLine()) {
      held.valid = true;
      held.restY = result.restY;
    } else {
      held.valid = false;
      held.restY = null;
      this.refusal = result.status === 'ok' ? 'That lands in the grass' : 'Nothing underneath it';
    }
  }

  /** Below this, a body is in the grass rather than on the carrier. */
  floorLine() {
    return this.groundY - GROUND_MARGIN;
  }

  release() {
    const held = this.held;
    if (!held || this.phase !== 'playing') return;

    if (!held.valid || held.restY === null) {
      this.sfx.reject();
      this.deps.ui.nudge(held.slot);
      this.deps.ui.toast(this.refusal);
      this.held = null;
      this.deps.ui.setSelected(-1);
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

    const player = this.players[this.turn];
    if (player) {
      player.weight += held.def.weight;
      player.placed += 1;
    }
    // Whoever touched it last gets the blame if the pile goes over.
    this.lastPlacer = this.turn;
    this.turn = this.players.length ? (this.turn + 1) % this.players.length : 0;

    this.deps.ui.setTotals(this.score, this.totalWeight);
    this.deps.ui.setPlayers(this.players, this.turn);
    this.sfx.place(this.strain());

    const slot = held.slot;
    this.slots[slot] = null;
    this.held = null;
    this.deps.ui.setSelected(-1);
    this.deps.ui.setSlot(slot, null);
    void this.fillSlot(slot);
  }

  /**
   * A run ends when something is on the floor rather than on the carrier.
   *
   * This used to be a fixed height, which only worked while every carrier was a
   * single flat shelf: anything below the shelf had obviously fallen. A skyline
   * has hollows — the dip between Atlas' hands is a genuine place to put
   * something — so depth alone proves nothing. What does prove it is touching
   * the grass, and the terrain is solid all the way down to it, so the only way
   * to reach the grass is to have missed the carrier entirely.
   *
   * Measured from the body's lowest point, not its centre: a fridge lying in
   * the grass has its centre a long way up.
   * @returns {boolean}
   */
  hasToppled() {
    const floor = this.floorLine();
    for (const body of this.placed) {
      if (body.bounds.max.y > floor) return true;
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
    this.deps.ui.setSelected(-1);
    this.sfx.crash();
  }

  /** Biggest thing on offer, so the camera keeps room for whichever is taken. */
  largestOffered() {
    let size = 120;
    for (const slot of this.slots) if (slot) size = Math.max(size, slot.def.size);
    return size;
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

    const nextSize = this.held?.def.size ?? this.largestOffered();
    const headroom = Math.max(nextSize * 2.4, 340);
    const bottom = this.phase === 'over' || this.phase === 'toppling'
      ? Math.max(this.groundY + 12, lowestOf(this.placed) + 40)
      : this.groundY + 12;

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

    this.renderer.draw(
      this.camera, this.placed, view, this.strain(), this.time, this.carrier, this.groundY,
    );
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
