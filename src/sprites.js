import { spriteUrl } from './catalog.js';

/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./types.js').Vec} Vec */

/**
 * Turns an image file into a physics-ready sprite by tracing its own alpha
 * channel. This is what makes the catalog scalable: to add an object you drop
 * in artwork and add a JSON row — nobody hand-authors collision shapes.
 */

/**
 * Resolution the art is rasterised at. Used both for tracing the outline and,
 * because redrawing an <img> of an SVG every frame is slow, as the bitmap the
 * renderer actually blits.
 */
const RASTER = 256;
/**
 * Alpha above this counts as solid. Deliberately low: antialiased hairlines in
 * line art have to stay attached to what they join, or the outline walks off.
 */
const ALPHA_THRESHOLD = 16;
/**
 * Raster pixels of dilation before tracing, so near-touching strokes (a bicycle
 * frame meeting its wheel) read as one connected blob.
 */
const DILATE = 2;
/**
 * Vertex budget for a traced outline. Too low and complex silhouettes — a
 * bicycle, a ladder — get flattened until they are effectively convex blobs
 * whose collision shape covers the holes they should have.
 */
const MAX_HULL_POINTS = 28;

/** @type {Map<string, Promise<Sprite>>} */
const cache = new Map();

/**
 * @param {ObjectDef} def
 * @returns {Promise<Sprite>}
 */
export function loadSprite(def) {
  const url = spriteUrl(def);
  let pending = cache.get(url);
  if (!pending) {
    pending = build(url);
    cache.set(url, pending);
  }
  return pending;
}

/**
 * @param {readonly ObjectDef[]} defs
 * @returns {Promise<void>}
 */
export async function preload(defs) {
  await Promise.all(defs.map((d) => loadSprite(d).catch(() => undefined)));
}

/**
 * @param {string} url
 * @returns {Promise<Sprite>}
 */
async function build(url) {
  const image = await loadImage(url);

  // Rasterise with the longest side at RASTER px.
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const rw = Math.max(1, Math.round(ratio >= 1 ? RASTER : RASTER * ratio));
  const rh = Math.max(1, Math.round(ratio >= 1 ? RASTER / ratio : RASTER));

  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = /** @type {CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { willReadFrequently: true })
  );
  ctx.drawImage(image, 0, 0, rw, rh);

  const { data } = ctx.getImageData(0, 0, rw, rh);
  const mask = new Uint8Array(rw * rh);
  let minX = rw, minY = rh, maxX = -1, maxY = -1;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      if (data[i * 4 + 3] > ALPHA_THRESHOLD) {
        mask[i] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fully transparent art: fall back to a unit square so the game still runs.
  if (maxX < 0) {
    return {
      canvas,
      silhouette: makeSilhouette(canvas),
      hull: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ],
      convexFallback: true,
      draw: { x: -0.5, y: -0.5, w: 1, h: 1 },
    };
  }

  // Normalise against the *visible* bounds so ObjectDef.size means the same
  // thing whether or not the artwork happens to carry padding.
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const k = 1 / Math.max(cropW, cropH);
  const cx = minX + cropW / 2;
  const cy = minY + cropH / 2;
  /** @param {Vec} p @returns {Vec} */
  const toLocal = (p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k });

  const outline = traceOutline(mask, rw, rh, { minX, minY, maxX, maxY });
  /** @type {Vec[]} */
  let hull;
  let convexFallback = outline.fellBack;

  if (outline.points.length >= 8 && !outline.fellBack) {
    hull = simplifyToBudget(outline.points, MAX_HULL_POINTS).map(toLocal);
  } else {
    hull = convexHull(
      outline.points.length ? outline.points : boxPoints(minX, minY, maxX, maxY),
    ).map(toLocal);
    convexFallback = true;
  }

  if (hull.length < 3 || !isFinitePoly(hull)) {
    hull = [
      { x: -cropW * k * 0.5, y: -cropH * k * 0.5 },
      { x: cropW * k * 0.5, y: -cropH * k * 0.5 },
      { x: cropW * k * 0.5, y: cropH * k * 0.5 },
      { x: -cropW * k * 0.5, y: cropH * k * 0.5 },
    ];
    convexFallback = true;
  }

  return {
    canvas,
    silhouette: makeSilhouette(canvas),
    hull,
    convexFallback,
    draw: { x: -cx * k, y: -cy * k, w: rw * k, h: rh * k },
  };
}

/**
 * Same pixels, flattened to one dark colour, for the landing shadow.
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement}
 */
function makeSilhouette(source) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

/**
 * SVGs without explicit width/height can rasterise at a browser default size,
 * so give them one from the viewBox before handing them to an <img>.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(url) {
  let src = url;
  /** @type {string | undefined} */
  let objectUrl;

  if (url.endsWith('.svg')) {
    try {
      const text = await (await fetch(url)).text();
      const sized = ensureSvgSize(text);
      objectUrl = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
      src = objectUrl;
    } catch {
      /* fall through to loading the URL directly */
    }
  }

  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(undefined);
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = src;
    });
    if (img.decode) await img.decode().catch(() => undefined);
    return img;
  } finally {
    // Safari needs the blob alive until after decode, so revoke on the next tick.
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(/** @type {string} */ (objectUrl)), 0);
  }
}

/**
 * @param {string} svg
 * @returns {string}
 */
function ensureSvgSize(svg) {
  if (/<svg[^>]*\swidth\s*=/.test(svg)) return svg;
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/.exec(svg);
  let w = 256;
  let h = 256;
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const scale = 256 / Math.max(parts[2], parts[3]);
      w = Math.round(parts[2] * scale);
      h = Math.round(parts[3] * scale);
    }
  }
  return svg.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
}

/* ------------------------------------------------------------------ */
/* Contour tracing                                                     */
/* ------------------------------------------------------------------ */

/** @type {ReadonlyArray<readonly [number, number]>} */
const NEIGHBOURS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * Produces an outline that actually wraps the artwork.
 *
 * Tracing alone is not enough: line art rasterises into strokes that only just
 * touch, and a bare boundary walk can wander off down a hairline and close
 * early. So dilate first to weld the strokes together, trace the largest
 * connected blob, then *check the result covers the sprite* — a bicycle whose
 * outline spans 10% of its own width is a collision shape objects fall through,
 * and silently shipping that is worse than a coarse convex hull.
 *
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} box
 * @returns {{ points: Vec[], fellBack: boolean }}
 */
function traceOutline(mask, w, h, box) {
  const solid = dilate(mask, w, h, DILATE);
  const main = largestComponent(solid, w, h);

  const spanX = Math.max(1, box.maxX - box.minX);
  const spanY = Math.max(1, box.maxY - box.minY);

  // Only trust a trace of one dominant blob.
  if (main.count / Math.max(1, main.total) >= 0.8) {
    const traced = traceContour(main.mask, w, h);
    if (traced.length >= 8) {
      let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
      for (const p of traced) {
        tMinX = Math.min(tMinX, p.x); tMaxX = Math.max(tMaxX, p.x);
        tMinY = Math.min(tMinY, p.y); tMaxY = Math.max(tMaxY, p.y);
      }
      const coverX = (tMaxX - tMinX) / spanX;
      const coverY = (tMaxY - tMinY) / spanY;
      if (coverX >= 0.7 && coverY >= 0.7) return { points: traced, fellBack: false };
    }
  }

  // Fall back to a convex outline of the whole sprite. Coarse, but it is the
  // right size, which matters far more than being the right shape.
  return { points: silhouetteExtremes(mask, w, h), fellBack: true };
}

/**
 * Grow the mask by `radius` pixels, four-connected.
 * @param {Uint8Array} mask @param {number} w @param {number} h @param {number} radius
 * @returns {Uint8Array}
 */
function dilate(mask, w, h, radius) {
  let src = mask;
  for (let pass = 0; pass < radius; pass++) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) { out[i] = 1; continue; }
        if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) ||
            (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) out[i] = 1;
      }
    }
    src = out;
  }
  return src;
}

/**
 * Largest eight-connected blob, plus how much of the sprite it accounts for.
 * @param {Uint8Array} mask @param {number} w @param {number} h
 * @returns {{ mask: Uint8Array, count: number, total: number }}
 */
function largestComponent(mask, w, h) {
  const label = new Int32Array(mask.length).fill(-1);
  const stack = new Int32Array(mask.length);
  /** @type {number[]} */
  const counts = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = counts.length;
    let sp = 0;
    let count = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const i = stack[--sp];
      count++;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && label[j] < 0) { label[j] = id; stack[sp++] = j; }
        }
      }
    }
    counts.push(count);
  }

  let bestId = -1, bestCount = 0, total = 0;
  for (let i = 0; i < counts.length; i++) {
    total += counts[i];
    if (counts[i] > bestCount) { bestCount = counts[i]; bestId = i; }
  }

  const out = new Uint8Array(mask.length);
  if (bestId >= 0) for (let i = 0; i < mask.length; i++) if (label[i] === bestId) out[i] = 1;
  return { mask: out, count: bestCount, total };
}

/**
 * Leftmost and rightmost solid pixel of every row. The convex hull of a pixel
 * set is the convex hull of these, and there are only a few hundred of them.
 * @param {Uint8Array} mask @param {number} w @param {number} h
 * @returns {Vec[]}
 */
function silhouetteExtremes(mask, w, h) {
  /** @type {Vec[]} */
  const points = [];
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { if (lo < 0) lo = x; hi = x; }
    }
    if (lo >= 0) {
      points.push({ x: lo, y });
      if (hi !== lo) points.push({ x: hi, y });
    }
  }
  return points;
}

/**
 * Moore-neighbour boundary tracing. Walks the outside edge of the largest
 * connected blob and returns it as a pixel-resolution polygon.
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @returns {Vec[]}
 */
function traceContour(mask, w, h) {
  /** @param {number} x @param {number} y */
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return [];

  /** @type {Vec[]} */
  const contour = [];
  let cx = sx;
  let cy = sy;
  let backtrack = 4; // we arrived from the west
  const maxSteps = w * h * 4;

  // Jacob's stopping criterion: the walk is only finished when it re-enters the
  // start pixel *and* leaves it the same way it did the first time. Stopping on
  // any revisit instead closes the loop early wherever the boundary doubles
  // back through the start — which is exactly what a thin handlebar or a violin
  // scroll does, and it was reducing whole objects to a sliver.
  let firstNextX = -1;
  let firstNextY = -1;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });

    let nextX = -1;
    let nextY = -1;
    let nextDir = -1;
    for (let i = 1; i <= 8; i++) {
      const dir = (backtrack + i) % 8;
      const px = cx + NEIGHBOURS[dir][0];
      const py = cy + NEIGHBOURS[dir][1];
      if (solid(px, py)) { nextX = px; nextY = py; nextDir = dir; break; }
    }
    if (nextDir < 0) break; // isolated pixel

    if (firstNextX < 0) {
      firstNextX = nextX;
      firstNextY = nextY;
    } else if (cx === sx && cy === sy && nextX === firstNextX && nextY === firstNextY) {
      contour.pop(); // the start is already the first entry
      break;
    }

    backtrack = (nextDir + 4) % 8;
    cx = nextX;
    cy = nextY;
  }

  return contour;
}

/**
 * Ramp up Douglas–Peucker tolerance until the outline fits the vertex budget,
 * keeping the most detailed *simple* polygon seen along the way.
 *
 * Douglas–Peucker on a closed loop can fold the outline into itself, and
 * poly-decomp needs a simple polygon. Falling straight back to a convex hull
 * when that happens was throwing away the shape entirely — a bicycle became a
 * five-sided slab. Retreating to the last simple result keeps the concavity.
 *
 * @param {Vec[]} points
 * @param {number} budget
 * @returns {Vec[]}
 */
function simplifyToBudget(points, budget) {
  /** @type {Vec[] | null} */
  let bestSimple = null;
  let epsilon = RASTER / 160;

  for (let i = 0; i < 30; i++) {
    const simplified = rdp(points, epsilon);
    if (simplified.length >= 3 && isSimplePolygon(simplified)) {
      bestSimple = simplified;
      if (simplified.length <= budget) return simplified;
    }
    if (simplified.length < 3) break;
    epsilon *= 1.25;
  }

  // Over budget but honest beats on budget and convex.
  return bestSimple && bestSimple.length >= 3 ? bestSimple : convexHull(points);
}

/**
 * @param {Vec[]} points
 * @param {number} epsilon
 * @returns {Vec[]}
 */
function rdp(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  /** @type {Array<[number, number]>} */
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = /** @type {[number, number]} */ (stack.pop());
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (index > 0 && maxDist > epsilon) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  /** @type {Vec[]} */
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  // The trace ends where it began; drop the duplicate closing vertex.
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) out.pop();
  }
  return out;
}

/**
 * @param {Vec} p @param {Vec} a @param {Vec} b
 * @returns {number}
 */
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * @param {Vec[]} points
 * @returns {Vec[]}
 */
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y));
  /** @param {Vec} o @param {Vec} a @param {Vec} b */
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  /** @type {Vec[]} */
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  /** @type {Vec[]} */
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Brute-force self-intersection test. Fine at fewer than ~30 vertices.
 * @param {Vec[]} poly
 * @returns {boolean}
 */
function isSimplePolygon(poly) {
  const n = poly.length;
  if (n < 4) return true;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * @param {Vec} p1 @param {Vec} p2 @param {Vec} p3 @param {Vec} p4
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, p3, p4) {
  /** @param {Vec} a @param {Vec} b @param {Vec} c */
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY
 * @returns {Vec[]}
 */
function boxPoints(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * @param {Vec[]} poly
 * @returns {boolean}
 */
function isFinitePoly(poly) {
  return poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}
