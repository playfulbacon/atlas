import { PLATFORM_WIDTH } from './physics.js';

/** @typedef {import('./types.js').CarrierDef} CarrierDef */
/** @typedef {import('./types.js').Carrier} Carrier */

/**
 * Turns any picture into a thing that can hold a pile up.
 *
 * Nothing about a carrier is hand-authored: the artwork is rasterised and its
 * own alpha tells us where the load sits. The rule is simply "whatever is
 * highest in the picture is what bears the weight, and it bears it from the
 * leftmost to the rightmost of those high points" — which lands on Atlas' two
 * raised hands, a tortoise's flat shell, or a table top without any of them
 * knowing about each other.
 *
 * To add one: drop art in assets/carriers/ and add a row to
 * src/data/carriers.json. A `support` override is there for artwork the rule
 * reads wrongly, but it should rarely be needed.
 */

const CARRIERS_URL = new URL('./data/carriers.json', import.meta.url);
const ART_BASE = new URL('../assets/carriers/', import.meta.url);

/** Resolution used for measuring. Fine detail does not matter here. */
const RASTER = 512;
/** Alpha above this counts as solid. */
const ALPHA_THRESHOLD = 24;
/**
 * How far down from the topmost pixel still counts as "the top". Wide enough to
 * catch both of Atlas' hands even if one is a few pixels higher than the other.
 */
const SUPPORT_BAND = 0.05;
/**
 * Least depth, in world units, from the support line down to the ground. Squat
 * carriers get scaled up to meet it rather than being drawn tiny — the game
 * needs somewhere for a toppled object to fall past.
 */
const MIN_DEPTH = 320;

/** @type {CarrierDef[]} */
export const CARRIERS = await fetch(CARRIERS_URL).then((r) => {
  if (!r.ok) throw new Error(`could not load carriers.json (HTTP ${r.status})`);
  return r.json();
});

/** @type {Map<string, Promise<Carrier>>} */
const cache = new Map();

/**
 * @param {CarrierDef} def
 * @returns {Promise<Carrier>}
 */
export function loadCarrier(def) {
  let pending = cache.get(def.id);
  if (!pending) {
    pending = build(def);
    cache.set(def.id, pending);
  }
  return pending;
}

/**
 * @param {CarrierDef} def
 * @returns {string}
 */
export function carrierArtUrl(def) {
  return new URL(def.art, ART_BASE).href;
}

/**
 * @param {CarrierDef} def
 * @returns {Promise<Carrier>}
 */
async function build(def) {
  const image = await loadImage(carrierArtUrl(def));
  const measured = def.support ? fromOverride(def, image) : measure(image);

  // Scale so the load-bearing span covers the platform — but never so small
  // that there is no room beneath for a fallen object to clear the topple line.
  const span = Math.max(1, measured.support.right - measured.support.left);
  const depth = Math.max(1, measured.bottom - measured.support.y);
  const scale = Math.max(PLATFORM_WIDTH / span, MIN_DEPTH / depth);

  const centre = (measured.support.left + measured.support.right) / 2;
  return {
    def,
    image,
    groundY: depth * scale,
    draw: {
      x: -centre * scale,
      y: -measured.support.y * scale,
      w: measured.raster.w * scale,
      h: measured.raster.h * scale,
    },
    /** Where the highest point of the artwork sits, for effects. */
    headY: (measured.bottom - measured.support.y) * scale * 0.16,
  };
}

/**
 * Reads the load-bearing surface straight out of the artwork's alpha channel.
 * @param {HTMLImageElement} image
 */
function measure(image) {
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const w = Math.max(1, Math.round(ratio >= 1 ? RASTER : RASTER * ratio));
  const h = Math.max(1, Math.round(ratio >= 1 ? RASTER / ratio : RASTER));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { willReadFrequently: true })
  );
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  /** @param {number} x @param {number} y */
  const solid = (x, y) => data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD;

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (top < 0) {
    // Blank artwork: treat the whole frame as the surface so the game runs.
    return { raster: { w, h }, support: { y: 0, left: 0, right: w }, bottom: h };
  }

  // Widest extent within the band just below the highest pixel.
  const band = Math.min(h - 1, top + Math.max(2, Math.round(h * SUPPORT_BAND)));
  let left = w;
  let right = -1;
  for (let y = top; y <= band; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < left) { left = 0; right = w; }

  return { raster: { w, h }, support: { y: top, left, right }, bottom: bottom + 1 };
}

/**
 * Manual metrics, expressed as fractions of the artwork so they survive any
 * rasterisation size.
 * @param {CarrierDef} def
 * @param {HTMLImageElement} image
 */
function fromOverride(def, image) {
  const s = /** @type {NonNullable<CarrierDef['support']>} */ (def.support);
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const w = Math.max(1, Math.round(ratio >= 1 ? RASTER : RASTER * ratio));
  const h = Math.max(1, Math.round(ratio >= 1 ? RASTER / ratio : RASTER));
  return {
    raster: { w, h },
    support: { y: s.y * h, left: s.left * w, right: s.right * w },
    bottom: (s.bottom ?? 1) * h,
  };
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
  if (img.decode) await img.decode().catch(() => undefined);
  return img;
}
