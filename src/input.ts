import type { Vec } from './types';

interface Tracked {
  id: number;
  x: number;
  y: number;
  type: string;
}

/**
 * Drag with one finger, rotate with two. Mouse users get the wheel and Q/E.
 * The canvas needs `touch-action: none` for any of this to survive on mobile.
 */
export class InputController {
  dragging = false;
  /** Latest primary-pointer position in CSS pixels, relative to the canvas. */
  pointer: Vec = { x: 0, y: 0 };
  angle = 0;
  /** True while a touch is driving the drag, so the game can lift the object clear of the finger. */
  touchDrag = false;
  enabled = true;

  onRelease?: () => void;

  private pointers = new Map<number, Tracked>();
  private primaryId: number | null = null;
  private rotateId: number | null = null;
  private rotateBaseline = 0;
  private angleBaseline = 0;

  constructor(private element: HTMLElement) {
    element.addEventListener('pointerdown', this.handleDown);
    element.addEventListener('pointermove', this.handleMove);
    element.addEventListener('pointerup', this.handleUp);
    element.addEventListener('pointercancel', this.handleUp);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKey);
    // Two-finger gestures on the canvas should rotate, not zoom the page.
    element.addEventListener('gesturestart', preventDefault as EventListener);
    element.addEventListener('contextmenu', preventDefault as EventListener);
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.handleDown);
    this.element.removeEventListener('pointermove', this.handleMove);
    this.element.removeEventListener('pointerup', this.handleUp);
    this.element.removeEventListener('pointercancel', this.handleUp);
    this.element.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKey);
  }

  /** Used by the on-screen rotate button, for one-handed play. */
  rotateBy(delta: number): void {
    this.angle += delta;
  }

  reset(): void {
    this.angle = 0;
    this.dragging = false;
    this.touchDrag = false;
    this.primaryId = null;
    this.rotateId = null;
    this.pointers.clear();
  }

  private local(event: PointerEvent): Vec {
    const rect = this.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private handleDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const p = this.local(event);
    this.pointers.set(event.pointerId, { id: event.pointerId, x: p.x, y: p.y, type: event.pointerType });
    this.element.setPointerCapture?.(event.pointerId);

    if (this.primaryId === null) {
      this.primaryId = event.pointerId;
      this.pointer = p;
      this.dragging = true;
      this.touchDrag = event.pointerType === 'touch';
    } else if (this.rotateId === null && event.pointerId !== this.primaryId) {
      this.rotateId = event.pointerId;
      this.rotateBaseline = this.spanAngle();
      this.angleBaseline = this.angle;
    }
    event.preventDefault();
  };

  private handleMove = (event: PointerEvent): void => {
    const tracked = this.pointers.get(event.pointerId);
    if (!tracked) return;
    const p = this.local(event);
    tracked.x = p.x;
    tracked.y = p.y;

    if (event.pointerId === this.primaryId) this.pointer = p;
    if (this.rotateId !== null && this.primaryId !== null) {
      this.angle = this.angleBaseline + shortestDelta(this.rotateBaseline, this.spanAngle());
    }
    event.preventDefault();
  };

  private handleUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    this.element.releasePointerCapture?.(event.pointerId);

    if (event.pointerId === this.rotateId) {
      this.rotateId = null;
      return;
    }
    if (event.pointerId === this.primaryId) {
      this.primaryId = null;
      this.rotateId = null;
      if (this.dragging) {
        this.dragging = false;
        this.touchDrag = false;
        this.onRelease?.();
      }
      // A finger still down becomes the new primary, so the drag can continue.
      const remaining = this.pointers.values().next().value as Tracked | undefined;
      if (remaining && this.enabled) {
        this.primaryId = remaining.id;
        this.pointer = { x: remaining.x, y: remaining.y };
      }
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    this.angle += Math.sign(event.deltaY) * 0.09;
    event.preventDefault();
  };

  private handleKey = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    switch (event.key) {
      case 'q': case 'Q': case 'ArrowLeft':
        this.angle -= 0.06; break;
      case 'e': case 'E': case 'ArrowRight':
        this.angle += 0.06; break;
      case 'r': case 'R':
        this.angle = 0; break;
      default:
        return;
    }
    event.preventDefault();
  };

  /** Angle of the line between the two active pointers. */
  private spanAngle(): number {
    if (this.primaryId === null || this.rotateId === null) return this.rotateBaseline;
    const a = this.pointers.get(this.primaryId);
    const b = this.pointers.get(this.rotateId);
    if (!a || !b) return this.rotateBaseline;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

function shortestDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function preventDefault(event: Event): void {
  event.preventDefault();
}
