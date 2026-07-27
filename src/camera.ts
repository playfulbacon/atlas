import type { Vec } from './types';

export interface Viewport {
  width: number;
  height: number;
  /** Screen-space pixels at the bottom reserved for the object tray. */
  bottomInset: number;
}

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

  private targetX = 0;
  private targetY = 0;
  private targetHalf = MIN_VIEW_HEIGHT / 2;

  view: Viewport = { width: 1, height: 1, bottomInset: 0 };

  get scale(): number {
    return this.view.height / (this.half * 2);
  }

  /**
   * @param contentTop      highest occupied world y (most negative)
   * @param contentBottom   lowest world y worth keeping on screen
   * @param headroom        empty world height that must exist above the stack
   */
  frame(contentTop: number, contentBottom: number, headroom: number): void {
    // Portrait screens are narrow; make sure the platform still fits sideways.
    const aspect = this.view.width / Math.max(1, this.view.height);
    const floor = Math.max(MIN_VIEW_HEIGHT, MIN_VIEW_WIDTH / Math.max(0.2, aspect));

    // Everything from here up must be visible…
    const wanted = contentBottom - (contentTop - headroom);
    // …and any slack goes *above* the stack, never below Atlas' feet.
    const content = Math.max(floor, wanted);

    // Reserve the tray strip so the stack is never hidden behind the UI.
    const trayFraction = Math.min(0.32, this.view.bottomInset / Math.max(1, this.view.height));
    const total = content / (1 - trayFraction);

    const top = contentBottom - content;
    this.targetHalf = total / 2;
    this.targetY = top + total / 2;
    this.targetX = 0;
  }

  update(dt: number): void {
    // Two speeds: leave room fast, reclaim it slowly.
    const zoomingOut = this.targetHalf > this.half;
    this.half = damp(this.half, this.targetHalf, zoomingOut ? 5.5 : 1.6, dt);
    this.y = damp(this.y, this.targetY, zoomingOut ? 5.5 : 2.4, dt);
    this.x = damp(this.x, this.targetX, 3, dt);
  }

  /** Drop straight to the target, for the start of a run. */
  snap(): void {
    this.half = this.targetHalf;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  worldToScreen(p: Vec): Vec {
    const s = this.scale;
    return {
      x: (p.x - this.x) * s + this.view.width / 2,
      y: (p.y - this.y) * s + this.view.height / 2,
    };
  }

  screenToWorld(p: Vec): Vec {
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

/** Frame-rate independent exponential approach. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}
