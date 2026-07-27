import { PLATFORM_WIDTH } from './physics.js';

/** @typedef {import('./types.js').CarrierDef} CarrierDef */
/** @typedef {import('./types.js').Carrier} Carrier */
/** @typedef {import('./types.js').Ledge} Ledge */
/** @typedef {import('./types.js').Vec} Vec */

/**
 * Turns any picture into a thing that can hold a pile up.
 *
 * Nothing about a carrier is hand-authored. The artwork is rasterised and read
 * column by column: for every column of pixels, the highest solid one is a
 * point on the carrier's *skyline*. Joined up and simplified, that skyline is
 * the surface objects actually land on — so a carrier is not one flat shelf but
 * every ledge, slope and hollow its own silhouette describes. Atlas' two raised
 * hands and the dip of his shoulders between them are three different places to
 * put something, and none of it is described anywhere but in the picture.
 *
 * Each stretch of skyline is only as thick as the ink beneath it — the top run
 * of solid pixels in those columns, no further. A raised arm is a thin band you
 * could rest a hat on, not a wall down to the floor, and the sky under it stays
 * sky. Nothing is ever placed from underneath, so what is below the *second*
 * surface in a column is not worth knowing.
 *
 * To add one: drop art in assets/carriers/ and add a row to
 * src/data/carriers.json. A `support` override is there for artwork whose top
 * band is read wrongly, but it only moves the origin — the skyline is always
 * measured.
 */

const CARRIERS_URL = new URL('./data/carriers.json', import.meta.url);
const ART_BASE = new URL('../assets/carriers/', import.meta.url);

/** Resolution used for measuring. Fine detail does not matter here. */
const RASTER = 512;
/** Alpha above this counts as solid. */
const ALPHA_THRESHOLD = 24;
/**
 * Artwork with no transparency at all is almost always a picture on a flat
 * background — a JPEG, a screenshot, anything not drawn for this. Rather than
 * reading it as one big rectangle, the background colour is taken from the
 * corners and keyed out. Squared RGB distance, so nothing has to take a root.
 */
const COLOUR_KEY_TOLERANCE = 44 * 44 * 3;
/** Corners that must agree before their colour is trusted as the background. */
const CORNERS_NEEDED = 3;
/**
 * How far down from the topmost pixel still counts as "the top". Wide enough to
 * catch both of Atlas' hands even if one is a few pixels higher than the other.
 * This band no longer decides what bears weight — the skyline does — but it is
 * still where the carrier is anchored and scaled from.
 */
const SUPPORT_BAND = 0.05;
/**
 * The anchor span has to be at least this much of the carrier's total width, or
 * the band is widened until it is. Without it a picture with a thin spike on top
 * — an antenna, a raised umbrella, a chimney — would be scaled as though that
 * spike were the whole platform, and come out enormous.
 */
const MIN_ANCHOR_SPAN = 0.3;
/**
 * Least depth, in world units, from the support line down to the ground. Squat
 * carriers get scaled up to meet it rather than being drawn tiny — the game
 * needs somewhere for a toppled object to fall past.
 */
const MIN_DEPTH = 320;
/**
 * How far the simplified skyline may stray from the pixels it came from, as a
 * fraction of the raster. Loose enough that a hand is one ledge rather than
 * forty, tight enough that the ledge is where the hand is drawn.
 */
const SKYLINE_TOLERANCE = 0.008;
/** Ceiling on skyline vertices. Each one becomes a static collision quad. */
const MAX_SKYLINE_POINTS = 56;
/** Skyline runs narrower than this fraction of the raster are specks, not ledges. */
const MIN_RUN = 0.02;

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
  const measured = measure(image);
  const anchor = def.support ? fromOverride(def, measured.raster) : measured.support;

  // Scale so the load-bearing span covers the platform — but never so small
  // that there is no room beneath for a fallen object to clear the ground.
  const span = Math.max(1, anchor.right - anchor.left);
  const depth = Math.max(1, measured.bottom - anchor.y);
  const scale = Math.max(PLATFORM_WIDTH / span, MIN_DEPTH / depth);

  // World origin: x on the middle of the anchor span, y on the anchor line.
  const centre = (anchor.left + anchor.right) / 2;
  /** @param {Vec} p @returns {Vec} */
  const toWorld = (p) => ({ x: (p.x - centre) * scale, y: (p.y - anchor.y) * scale });

  return {
    def,
    image,
    groundY: depth * scale,
    surface: measured.skyline.map((ledge) => ({
      a: toWorld(ledge.a),
      b: toWorld(ledge.b),
      base: (ledge.base - anchor.y) * scale,
    })),
    draw: {
      x: -centre * scale,
      y: -anchor.y * scale,
      w: measured.raster.w * scale,
      h: measured.raster.h * scale,
    },
    /** Where the highest point of the artwork sits, for effects. */
    headY: (measured.bottom - anchor.y) * scale * 0.16,
  };
}

/**
 * Reads the carrier straight out of the artwork's alpha channel: one skyline
 * point per column of pixels, plus the top band the whole thing is anchored on.
 * @param {HTMLImageElement} image
 */
function measure(image) {
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const w = Math.max(1, Math.round(ratio >= 1 ? RASTER : RASTER * ratio));
  const h = Math.max(1, Math.round(ratio >= 1 ? RASTER / ratio : RASTER));
  const raster = { w, h };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { willReadFrequently: true })
  );
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const solid = solidTest(data, w, h);

  // The whole measurement, in one pass: the highest solid pixel in every
  // column. -1 means the column is empty, and empty columns are what separate
  // one run of surface from the next.
  const tops = new Int32Array(w).fill(-1);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid((y * w + x) * 4)) continue;
      if (tops[x] < 0) tops[x] = y;
      if (top < 0) top = y;
      bottom = y;
    }
  }

  // …and how far the ink goes on from there, so a surface is as thick as the
  // thing that draws it and no thicker.
  const bases = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    if (tops[x] < 0) continue;
    let y = tops[x];
    while (y + 1 < h && solid(((y + 1) * w + x) * 4)) y++;
    bases[x] = y + 1;
  }

  if (top < 0) {
    // Blank artwork: give it one flat shelf so the game still runs.
    return {
      raster,
      support: { y: 0, left: 0, right: w },
      bottom: h,
      skyline: [{ a: { x: 0, y: 0 }, b: { x: w, y: 0 }, base: h }],
    };
  }

  // Widest extent within the band just below the highest pixel. This is only
  // the anchor now — where the origin sits and how the art is scaled — and it
  // widens until it has hold of a fair share of the carrier's width.
  let solidLeft = w;
  let solidRight = -1;
  for (let x = 0; x < w; x++) {
    if (tops[x] < 0) continue;
    if (x < solidLeft) solidLeft = x;
    if (x > solidRight) solidRight = x;
  }
  const wanted = (solidRight - solidLeft) * MIN_ANCHOR_SPAN;

  let left = solidLeft;
  let right = solidRight;
  // The origin sits on the lowest surface the band had to reach for, not on the
  // highest pixel in the picture. On a flat-topped carrier those are the same
  // thing; on a figure with an arm in the air they are 250 units apart, and it
  // is the shoulders that hold the pile up, not the fingertips.
  let anchorY = top;
  let depth = Math.max(2, Math.round(h * SUPPORT_BAND));
  for (let attempt = 0; attempt < 6; attempt++) {
    const band = Math.min(h - 1, top + depth);
    left = w;
    right = -1;
    anchorY = top;
    for (let x = 0; x < w; x++) {
      if (tops[x] < 0 || tops[x] > band) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (tops[x] > anchorY) anchorY = tops[x];
    }
    if (right - left >= wanted) break;
    depth *= 2.2;
  }
  if (right <= left) { left = 0; right = w; anchorY = top; }

  return {
    raster,
    support: { y: anchorY, left, right },
    bottom: bottom + 1,
    skyline: skylineFrom(tops, bases, raster),
  };
}

/**
 * Decides what counts as part of the carrier and what is empty air.
 *
 * Normally that is the alpha channel. But a picture with no transparency
 * anywhere has a background rather than none, and reading it literally would
 * make every carrier a rectangle — so its corners are consulted, and if they
 * agree on a colour, that colour is the background. If they disagree the
 * picture is a photograph of something edge to edge, and a rectangle is then
 * the honest answer.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} w @param {number} h
 * @returns {(i: number) => boolean} takes a byte offset into `data`
 */
function solidTest(data, w, h) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= ALPHA_THRESHOLD) {
      return (at) => data[at + 3] > ALPHA_THRESHOLD;
    }
  }

  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  for (const candidate of corners) {
    let agree = 0;
    for (const other of corners) if (near(data, candidate, other)) agree++;
    if (agree >= CORNERS_NEEDED) {
      const r = data[candidate];
      const g = data[candidate + 1];
      const b = data[candidate + 2];
      return (at) => {
        const dr = data[at] - r;
        const dg = data[at + 1] - g;
        const db = data[at + 2] - b;
        return dr * dr + dg * dg + db * db > COLOUR_KEY_TOLERANCE;
      };
    }
  }
  return () => true;
}

/**
 * @param {Uint8ClampedArray} data @param {number} a @param {number} b
 * @returns {boolean}
 */
function near(data, a, b) {
  const dr = data[a] - data[b];
  const dg = data[a + 1] - data[b + 1];
  const db = data[a + 2] - data[b + 2];
  return dr * dr + dg * dg + db * db <= COLOUR_KEY_TOLERANCE;
}

/**
 * Turns the per-column heights into as few ledges as will still describe the
 * same silhouette. Empty columns break the scan into separate runs, so a carrier
 * made of two disconnected pieces gets two surfaces rather than one that bridges
 * the gap between them.
 *
 * Each ledge takes the *deepest* ink under the columns it spans, so simplifying
 * the top of a surface can only ever make it thicker — never open a hole in it.
 *
 * @param {Int32Array} tops
 * @param {Int32Array} bases
 * @param {{ w: number, h: number }} raster
 * @returns {Ledge[]}
 */
function skylineFrom(tops, bases, raster) {
  /** @type {Array<{ points: Vec[], bases: number[] }>} */
  const runs = [];
  const minRun = Math.max(3, Math.round(raster.w * MIN_RUN));

  for (let x = 0; x < raster.w; x++) {
    if (tops[x] < 0) continue;
    const start = x;
    /** @type {Vec[]} */
    const points = [];
    /** @type {number[]} */
    const depths = [];
    while (x < raster.w && tops[x] >= 0) {
      points.push({ x: x + 0.5, y: tops[x] });
      depths.push(bases[x]);
      x++;
    }
    if (x - start >= minRun) runs.push({ points, bases: depths });
  }
  if (!runs.length) return [];

  // Simplify, loosening the tolerance until the whole skyline fits the budget.
  // Each ledge becomes a static collision slab, so this is a real cost.
  let tolerance = raster.w * SKYLINE_TOLERANCE;
  let kept = runs.map((run) => simplify(run.points, tolerance));
  for (let attempt = 0; attempt < 8 && count(kept) > MAX_SKYLINE_POINTS; attempt++) {
    tolerance *= 1.6;
    kept = runs.map((run) => simplify(run.points, tolerance));
  }

  /** @type {Ledge[]} */
  const ledges = [];
  runs.forEach((run, r) => {
    const indices = kept[r];
    for (let i = 0; i < indices.length - 1; i++) {
      const from = indices[i];
      const to = indices[i + 1];
      let base = 0;
      for (let c = from; c <= to; c++) base = Math.max(base, run.bases[c]);
      ledges.push({ a: run.points[from], b: run.points[to], base });
    }
  });
  return ledges;
}

/**
 * @param {number[][]} runs
 * @returns {number}
 */
function count(runs) {
  let n = 0;
  for (const run of runs) n += run.length;
  return n;
}

/**
 * Douglas–Peucker, iterative so a 512-point run cannot blow the stack. Returns
 * the indices it kept, because the caller has a second array to sample.
 * @param {Vec[]} points
 * @param {number} tolerance
 * @returns {number[]}
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  /** @type {Array<[number, number]>} */
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = /** @type {[number, number]} */ (stack.pop());
    if (to - from < 2) continue;
    const a = points[from];
    const b = points[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;

    let worst = -1;
    let worstAt = -1;
    for (let i = from + 1; i < to; i++) {
      const d = Math.abs(dy * (points[i].x - a.x) - dx * (points[i].y - a.y)) / len;
      if (d > worst) { worst = d; worstAt = i; }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([from, worstAt], [worstAt, to]);
    }
  }

  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
  return out;
}

/**
 * Manual anchor, expressed as fractions of the artwork so it survives any
 * rasterisation size. It moves where the carrier is centred and how big it is
 * drawn; what bears weight is still read from the pixels.
 * @param {CarrierDef} def
 * @param {{ w: number, h: number }} raster
 */
function fromOverride(def, raster) {
  const s = /** @type {NonNullable<CarrierDef['support']>} */ (def.support);
  return { y: s.y * raster.h, left: s.left * raster.w, right: s.right * raster.w };
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
