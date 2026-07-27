#!/usr/bin/env node
/**
 * Generates assets/atlas.svg — the kneeling figure the game draws as Atlas.
 *
 * The figure is defined here as joints and widths rather than as raw path data,
 * so the pose stays editable: move a joint, re-run, done.
 *
 *   npm run atlas-art
 *
 * THE ONE HARD CONSTRAINT: the tops of both hands, both forearms and his upper
 * back all sit on the line y = SUPPORT_Y and together span SUPPORT_LEFT to
 * SUPPORT_RIGHT with no break. That line is the top of the game's static
 * platform, so any gap in it is a place where objects hover unsupported.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VIEW = { w: 720, h: 660 };
const SUPPORT_Y = 46;
const SUPPORT_LEFT = 90;
const SUPPORT_RIGHT = 630;
const CENTRE = 360;
const BOTTOM = 612;

const INK = '#17181a';
const PAPER = '#ffffff';
const STROKE = 10;

/** Mirrors an x about the centre line. */
const mx = (x) => 2 * CENTRE - x;

/**
 * Offsets a straight spine into a tapered quad. Straight segments only —
 * a polyline that folds back on itself has no usable offset at the fold.
 */
function limb([ax, ay], [bx, by], wa, wb) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    [ax + (nx * wa) / 2, ay + (ny * wa) / 2],
    [bx + (nx * wb) / 2, by + (ny * wb) / 2],
    [bx - (nx * wb) / 2, by - (ny * wb) / 2],
    [ax - (nx * wa) / 2, ay - (ny * wa) / 2],
  ];
}

/** Mirrors a polygon to the other side of the figure. */
const mirror = (poly) => poly.map(([x, y]) => [mx(x), y]);

/* ---------------------------------------------------------------- pose ---- */

/**
 * Bent forward: the flat of his back is the middle of the support line, and the
 * torso falls away from it to narrow hips.
 */
const TORSO = [
  [212, SUPPORT_Y], [508, SUPPORT_Y],
  [512, 122], [480, 204], [452, 264], [412, 296],
  [308, 296],
  [268, 264], [240, 204], [208, 122],
];

/** Pelvis, behind the head, where the legs hang from. */
const HIPS = [
  [300, 244], [420, 244], [448, 320], [440, 396],
  [404, 428], [316, 428], [280, 396], [272, 320],
];

/**
 * Head bowed under the load, with a band of upper back still visible above it.
 * That band is what stops it reading as a face stuck on a chest.
 */
/**
 * Bowed so far forward that his head hangs below the line of his back, the way
 * it does in a real carrying stoop. Drawn last so it sits in front of the hips.
 */
const HEAD = [
  [360, 246], [414, 270], [436, 308], [414, 344],
  [360, 362], [306, 344], [284, 308], [306, 270],
];

/**
 * Each arm is one tapered wedge rather than a chain of boxes. Its top edge is
 * part of the support line; its inner edge peels away from the torso below,
 * opening a wedge of background between arm and body. That gap is the whole
 * reason the arms read as raised limbs instead of shoulder padding.
 */
const ARM_L = [
  [SUPPORT_LEFT, SUPPORT_Y], [212, SUPPORT_Y],
  [206, 114], [178, 174], [152, 244], [140, 296],
  [98, 292], [76, 218], [62, 134], [66, 60],
];

/** Flat of the hand, drawn over the arm so its outline reads as the wrist. */
const HAND_L = [[SUPPORT_LEFT, SUPPORT_Y], [204, SUPPORT_Y], [198, 108], [84, 114]];

/**
 * Legs are traced as one polygon each, hip to toe. Chaining separate quads left
 * notches at every joint, which is what made the first pass look like a pile of
 * loose boxes rather than a body.
 */

/** Near leg: knee high and out, foot planted flat. */
const LEG_R = [
  [416, 376], [534, 396], [598, 434],
  [598, 472], [596, 556],
  [644, 580], [648, BOTTOM], [532, BOTTOM],
  [552, 556], [548, 472],
  [514, 448], [462, 436], [410, 428],
];

/** Far leg: knee down on the ground, shin folded away behind him. */
const LEG_L = [
  [304, 376], [216, 442], [140, 528],
  [136, 582], [330, BOTTOM], [336, 564],
  [226, 540], [242, 474], [322, 412], [352, 392],
];

/** Interior lines: the sparse faceting that makes it read as a carved figure. */
const FACETS = [
  // Trapezius, running from the bowed head out to each shoulder.
  [[306, 92], [258, 60]],
  [[mx(306), 92], [mx(258), 60]],
  // Spine down the back.
  [[360, 108], [360, 232]],
  // Elbow, dividing forearm from upper arm.
  [[92, 232], [166, 206]],
  [[mx(92), 232], [mx(166), 206]],
  // Knee creases and thigh planes.
  [[542, 452], [590, 468]],
  [[188, 520], [252, 542]],
  [[452, 400], [526, 438]],
  [[300, 396], [214, 492]],
];

/** Knuckles across the flat of each hand. */
for (let i = 0; i < 3; i++) {
  FACETS.push([[112 + i * 26, 58], [110 + i * 26, 96]]);
  FACETS.push([[mx(112 + i * 26), 58], [mx(110 + i * 26), 96]]);
}

/* --------------------------------------------------------------- output --- */

const round = (n) => Math.round(n * 10) / 10;
const pts = (poly) => poly.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
const polygon = (poly) => `    <polygon points="${pts(poly)}"/>`;
const polyline = (line) => `    <polyline points="${pts(line)}"/>`;

// Back leg first, torso over it, then the near leg, head, and arms on top.
const SHAPES = [
  LEG_L,
  HIPS,
  TORSO,
  LEG_R,
  HEAD,
  ARM_L, HAND_L,
  mirror(ARM_L), mirror(HAND_L),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}">
  <!-- Generated by scripts/make-atlas-art.mjs — edit the pose there, not here. -->
  <g fill="${PAPER}" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round" stroke-linecap="round">
${SHAPES.map(polygon).join('\n')}
  </g>
  <g fill="none" stroke="${INK}" stroke-width="${STROKE * 0.55}" stroke-linejoin="round" stroke-linecap="round" opacity="0.8">
${FACETS.map(polyline).join('\n')}
  </g>
</svg>
`;

await mkdir(path.join(ROOT, 'assets'), { recursive: true });
await writeFile(path.join(ROOT, 'assets/atlas.svg'), svg);

console.log(`assets/atlas.svg  ${VIEW.w}x${VIEW.h}`);
console.log(`  support line y=${SUPPORT_Y}, x ${SUPPORT_LEFT}..${SUPPORT_RIGHT} (span ${SUPPORT_RIGHT - SUPPORT_LEFT})`);
console.log(`  figure bottom  y=${BOTTOM}`);
