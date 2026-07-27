# Atlas — Don't Drop It

A silly physics game about balancing the world's junk on the back of a very
patient titan. Three objects are on offer at any moment — a traffic pylon, a
refrigerator, a bathtub, an unrequested accordion, eventually the Sun — and you
steer one of them onto Atlas' raised hands, or the dip between them. Every
object placed is a point. When the pile falls over, that's the run.

One to four players take turns, each carrying the weight they personally added,
so the winner is whoever dared the most and got away with it. Atlas is only the
default: you pick who holds the pile up on a select screen, and **any picture
can be a carrier** — see [Carriers](#carriers).

**There is no build step.** The repo root *is* the site: `index.html` loads
`src/*.js` as native ES modules and the two physics libraries from `vendor/` as
plain scripts. Open it however you like:

```bash
npm run dev        # play at http://localhost:5173 (zero-dependency static server)
```

`npm install` is optional — it is only needed for `npm run typecheck` and for
refreshing `vendor/`. Nothing is required to run or deploy the game.

## Deploying

Push. That is the whole process.

For **GitHub Pages**, set *Settings → Pages → Build and deployment →
Source: **Deploy from a branch***, pick the branch and `/ (root)`. No workflow,
no artifact, no build.

Every path in the game resolves relative to the module that asks for it
(`new URL('…', import.meta.url)`), so it works unchanged at a user page, a
project page (`user.github.io/atlas/`), a nested subdirectory, or `file://`.
There are no runtime network calls at all — every sprite is vendored into the
repo, so the game works offline once loaded.

## Type checking without a build

The source is plain JavaScript annotated with JSDoc. `npm run typecheck` runs
TypeScript over it (`checkJs`, `strict`) and catches the same class of mistakes
a `.ts` codebase would — it just never emits anything, and the browser runs the
files you actually wrote.

## How it plays

- **Three offers** sit at the top of the screen. Take hold of one and the other
  two grey out; place it and a fresh object drops into the empty slot, so the
  choice is always live and always three wide.
- **Lift** the object out of its slot. It appears exactly where it was sitting
  — no teleporting — and you drag it down onto the load, the direction it is
  going anyway.
- **Steer** it from wherever your hand already is: only the *movement* of the
  pointer counts, one-to-one in screen pixels, so the object is never hidden
  under your finger. It collides with nothing while you hold it.
- The **shadow** shows exactly where it will come to rest, and placement snaps
  to it. You may hold the object anywhere — buried in the pile is fine; it
  rises to the first clear spot and the shadow shows the landing from there.
  The two refusals are having nothing underneath at all, and a landing that
  would put it in the grass.
- Carriers are not flat. The dip between Atlas' hands is a real place to put
  something, and so is his knee — anywhere the drawing of him has a surface.
  A run ends when something ends up on the ground instead of on him.
- **Two fingers** rotate on touch. Scroll wheel, `Q`/`E` or `←`/`→` on desktop.
  `R` sets the angle back to zero.
- The camera pulls back as the pile grows, so there is always room above it for
  the next thing, and the carrier stays planted at the bottom of the screen.
  Objects get larger as the score climbs.
- **Turns** pass on every successful placement. The weight of the object goes on
  the placer's tally, whoever's it is when the tower finally goes; the scoreboard
  ranks by weight carried and names who put the last one on.

## Adding objects

The catalog is data. To add one:

1. Add a row to [`src/data/objects.json`](src/data/objects.json):

   ```json
   { "id": "grand-piano", "name": "Grand Piano", "weight": 480, "size": 210,
     "tier": 4, "art": { "openmoji": "1F3B9" } }
   ```

   `art` is either `{ "openmoji": "<hexcode>" }` (fetched from the OpenMoji CDN)
   or `{ "custom": "<name>" }` (a file in `assets/custom/<name>.svg`).

2. `npm run assets` — vendors the artwork into `assets/objects/<id>.svg`.

That is the whole process. **No collision shape is authored by hand:** at load
time each sprite is rasterised, dilated so hairline strokes weld together, and
its largest connected blob traced with Moore-neighbour boundary following. The
outline is simplified with Douglas–Peucker down to a vertex budget — keeping the
most detailed *simple* polygon along the way — then handed to `poly-decomp` for
convex decomposition. See [`src/sprites.js`](src/sprites.js).

Two guards matter, because a silently wrong collision shape is worse than an
obviously crude one:

- the trace uses Jacob's stopping criterion, so a boundary that doubles back
  through its own starting pixel does not close the loop early;
- the result is **checked against the artwork it came from**. An outline that
  fails to span 70% of the sprite in both axes is thrown away for a convex
  silhouette, which is coarse but at least the right size.

`npm run typecheck` will not catch a bad outline, so if you add unusual artwork,
eyeball it in game — an object that things fall straight through has an outline
that collapsed.

Field reference:

| field | meaning |
| --- | --- |
| `id` | unique slug; also the artwork filename |
| `name` | shown on the offer card |
| `weight` | kilograms, for comedy. Drives the score readout and, heavily compressed, the physics density |
| `size` | longest visible dimension in world units. The platform is 400 wide |
| `tier` | 1 (pocket junk) … 6 (celestial bodies). A tier unlocks every 7 placements |
| `friction`, `restitution` | optional physics overrides |

Weights are deliberately absurd and span thirty orders of magnitude, so the
simulation compresses them: an anvil still outweighs a rubber duck, but the Moon
does not turn the pile beneath it into soup.

## Layout

| file | what it does |
| --- | --- |
| `src/sprites.js` | rasterises art, traces collision outlines from pixels |
| `src/physics.js` | Matter.js world, terrain slabs, body construction, drop projection |
| `src/camera.js` | framing — keeps guaranteed empty space above the pile |
| `src/carriers.js` | reads any carrier image column by column into a load-bearing skyline |
| `src/carrier.js` | draws the chosen carrier, the ground, the sweat, and `?terrain` |
| `src/names.js` | the Greek roster the re-roll button pulls from |
| `src/ui.js` | offers, player and pile readouts, setup and select screens, mass formatting |
| `src/render.js` | sky, clouds, stars, sprites, landing shadow |
| `src/input.js` | one-finger drag, two-finger rotate, wheel and keys |
| `src/game.js` | run state, turn order, placement rules, topple detection |
| `vendor/` | Matter.js + poly-decomp browser builds, loaded as plain scripts |
| `scripts/fetch-assets.mjs` | vendors artwork; also validates the catalog |
| `scripts/vendor-libs.mjs` | refreshes `vendor/` from `node_modules` |
| `scripts/serve.mjs` | dependency-free local server for `npm run dev` |

## Carriers

<a id="carriers"></a>

**Any image can be the platform.** Nothing about a carrier is authored by hand —
no support line, no scale, no ground offset. To add one:

1. Drop a PNG or SVG into `assets/carriers/`.
2. Add a row to [`src/data/carriers.json`](src/data/carriers.json):

   ```json
   { "id": "forklift", "name": "Forklift", "blurb": "Union rules apply.",
     "art": "forklift.svg" }
   ```

It appears on the select screen with a thumbnail, and the pile stacks on it.
That is the whole process.

### How a picture becomes a surface

The art is rasterised and read **one column of pixels at a time**: the highest
solid pixel in each column is a point on the carrier's *skyline*. Joined up and
simplified, that skyline is what objects land on — so a carrier is not one flat
shelf but every ledge, slope and hollow its own silhouette describes. Atlas' two
raised hands and the dip of his shoulders between them are three different
places to put something, and none of that is written down anywhere except in the
drawing of him.

Each simplified stretch becomes one convex static slab, **as thick as the ink
beneath it** — the top run of solid pixels in those columns, no further. A raised
arm is a thin band you could rest a hat on, not a wall down to the floor, and the
sky under it stays sky. Convex by construction, so no decomposition step can
quietly fill in a hollow you should be able to drop something into.

It is a skyline and not an outline because nothing is ever placed from
underneath: what is below the *second* surface in a column is not worth knowing.

Two smaller things the reading handles, because "any image" means any image:

- **No transparency?** Then the picture has a background rather than none. The
  four corners are consulted, and if three agree on a colour it is keyed out. If
  they disagree it is a photo that fills its frame, and a rectangle is the honest
  answer.
- **A thin spike on top** — an antenna, a raised umbrella, an arm in the air —
  would otherwise be scaled and centred as though it were the whole platform.
  The band the carrier is measured from widens until it has hold of at least 30%
  of the width, and the origin then sits on the lowest surface that band had to
  reach for. On a flat-topped carrier that is the top; on a figure reaching
  upward it is the shoulders, which is what actually holds the pile up.

Scale and position come from that band: the image is sized so it spans the
400-unit platform and stands at least 320 units deep, centred on the band, with
the ground at its feet. Add `?terrain` to the URL to draw the skyline the physics
is actually using over the art it was read from — the fastest way to tell a
picture that reads badly from one that reads fine.

So the artwork that works best is a figure or object **seen side-on, drawn wider
than what it will carry**, ideally on transparency. A flat top is not required;
ledges at several heights are more interesting than one shelf. If the band is
read wrongly, `src/data/carriers.json` takes an optional `support` override
(`{ "y": 0.3, "left": 0.2, "right": 0.8 }`, fractions of the image) — it only
moves the anchor, the skyline is always measured.

The three that ship are Atlas — a public-domain engraving of the Farnese pose,
who reads as a back, a pair of shoulders, a head of hair and a raised forearm,
all at different heights — a World Tortoise, and a folding table.

## Credits

Object artwork is [OpenMoji](https://openmoji.org) — the open-source emoji and
icon project — used under **CC BY-SA 4.0**. A handful of objects Unicode does not
cover (traffic pylon, refrigerator, washing machine, filing cabinet, vending
machine, anvil, rubber duck, lava lamp) were drawn for this project and live in
`assets/custom/`. See [`ATTRIBUTION.md`](ATTRIBUTION.md).

Physics by [Matter.js](https://brm.io/matter-js/) with
[poly-decomp](https://github.com/schteppe/poly-decomp.js).
