/** @typedef {import('./types.js').Vec} Vec */
/** @typedef {{ width: number, height: number, topInset: number, bottomInset: number }} Viewport */

/** Never zoom in past this much visible world height — keeps early play calm. */
const MIN_VIEW_HEIGHT = 760;
/** Visible world width the camera insists on, so the platform always fits. */
const MIN_VIEW_WIDTH = 560;

/**
 * Frames the whole stack plus guaranteed empty space above it, and pulls back
 * as the pile grows. Zooming out is quicker than zooming in so the free space
 * promised to the player is never briefly missing.
 */
export class Camera {
  x = 0;
  y = 0;
  /** Half of the world height currently visible. */
  half = MIN_VIEW_HEIGHT / 2;

  targetX = 0;
  targetY = 0;
  targetHalf = MIN_VIEW_HEIGHT / 2;

  /** @type {Viewport} */
  view = { width: 1, height: 1, topInset: 0, bottomInset: 0 };

  get scale() {
    return this.view.height / (this.half * 2);
  }

  /**
   * @param {number} contentTop    highest occupied world y (most negative)
   * @param {number} contentBottom lowest world y worth keeping on screen
   * @param {number} headroom      empty world height that must exist above the stack
   */
  frame(contentTop, contentBottom, headroom) {
    // Portrait screens are narrow; make sure the platform still fits sideways.
    const aspect = this.view.width / Math.max(1, this.view.height);
    const floor = Math.max(MIN_VIEW_HEIGHT, MIN_VIEW_WIDTH / Math.max(0.2, aspect));

    // Everything from here up must be visible…
    const wanted = contentBottom - (contentTop - headroom);
    // …and any slack goes *above* the stack, never below Atlas' feet.
    const content = Math.max(floor, wanted);

    // Reserve the stage strip at the top and the score strip at the bottom, so
    // the pile is never behind the stage and Atlas' feet are never behind the
    // score. Everything between the two lands in the band that is left.
    const height = Math.max(1, this.view.height);
    const stageBand = Math.min(0.3, this.view.topInset / height);
    const scoreBand = Math.min(0.2, this.view.bottomInset / height);
    const total = content / Math.max(0.3, 1 - stageBand - scoreBand);

    this.targetHalf = total / 2;
    // Atlas sits just above the score strip, however tall the pile gets.
    this.targetY = contentBottom + scoreBand * total - total / 2;
    this.targetX = 0;
  }

  /** @param {number} dt */
  update(dt) {
    // Two speeds: leave room fast, reclaim it slowly.
    const zoomingOut = this.targetHalf > this.half;
    this.half = damp(this.half, this.targetHalf, zoomingOut ? 5.5 : 1.6, dt);
    this.y = damp(this.y, this.targetY, zoomingOut ? 5.5 : 2.4, dt);
    this.x = damp(this.x, this.targetX, 3, dt);
  }

  /** Drop straight to the target, for the start of a run. */
  snap() {
    this.half = this.targetHalf;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  /** @param {Vec} p @returns {Vec} */
  worldToScreen(p) {
    const s = this.scale;
    return {
      x: (p.x - this.x) * s + this.view.width / 2,
      y: (p.y - this.y) * s + this.view.height / 2,
    };
  }

  /** @param {Vec} p @returns {Vec} */
  screenToWorld(p) {
    const s = this.scale;
    return {
      x: (p.x - this.view.width / 2) / s + this.x,
      y: (p.y - this.view.height / 2) / s + this.y,
    };
  }

  /** World rect currently visible, for culling and for clamping drags. */
  bounds() {
    const halfW = (this.half * this.view.width) / this.view.height;
    return {
      minX: this.x - halfW,
      maxX: this.x + halfW,
      minY: this.y - this.half,
      maxY: this.y + this.half,
    };
  }
}

/**
 * Frame-rate independent exponential approach.
 * @param {number} current @param {number} target @param {number} rate @param {number} dt
 * @returns {number}
 */
function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}
