export interface Vec {
  x: number;
  y: number;
}

/** Where an object's picture comes from. See scripts/fetch-assets.mjs. */
export interface ObjectArt {
  /** OpenMoji hexcode, e.g. "1F6C1". */
  openmoji?: string;
  /** Basename of a file in assets/custom/, e.g. "anvil". */
  custom?: string;
}

/** One entry in src/data/objects.json. */
export interface ObjectDef {
  id: string;
  name: string;
  /** Comedic weight in kilograms. Drives the score display and (compressed) physics density. */
  weight: number;
  /** Longest visible dimension, in world units. The platform is 400 wide. */
  size: number;
  /** 1 = pocket junk, 6 = celestial bodies. Gates when the object starts appearing. */
  tier: number;
  art: ObjectArt;
  friction?: number;
  restitution?: number;
}

/** A sprite plus the collision outline traced from its own pixels. */
export interface Sprite {
  /** Pre-rasterised artwork. Blitting a canvas beats re-rendering an SVG each frame. */
  canvas: HTMLCanvasElement;
  /** Flat dark version of the same art, used for the landing shadow. */
  silhouette: HTMLCanvasElement;
  /**
   * Outline in local units, origin at the centre of the art's visible bounding
   * box, longest dimension normalised to 1. Multiply by ObjectDef.size for world units.
   */
  hull: Vec[];
  /** Whether the hull is concave detail or a plain convex fallback. */
  convexFallback: boolean;
  /** Draw rect for the image, in the same normalised local units. */
  draw: { x: number; y: number; w: number; h: number };
}
