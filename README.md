# Atlas — Don't Drop It

A silly physics game about balancing the world's junk on the back of a very
patient titan. Objects arrive one at a time — a traffic pylon, a refrigerator,
a bathtub, an unrequested accordion, eventually the Sun — and you steer each
one onto the shelf made by Atlas' back and raised hands. Every object placed is
a point. When the pile falls over, that's the run.

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

- **Grab** the object from its stage at the top of the screen. It steps onto
  Atlas' back immediately, just clear of the pile, and you bring it down from
  there — the direction the load is going anyway.
- **Steer** it from wherever your hand already is: only the *movement* of the
  pointer counts, one-to-one in screen pixels, so the object is never hidden
  under your finger. It collides with nothing while you hold it.
- The **shadow** shows exactly where it will come to rest, and placement snaps
  to it. You may hold the object anywhere — buried in the pile is fine; it
  rises to the first clear spot and the shadow shows the landing from there.
  The only refusal is having nothing underneath at all.
- **Two fingers** rotate on touch. Scroll wheel, `Q`/`E` or `←`/`→` on desktop,
  and there is a rotate button for one-handed play.
- The camera pulls back as the pile grows, so there is always room above it for
  the next thing, and Atlas stays planted at the bottom of the screen. Objects
  get larger as your score climbs.

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
time each sprite is rasterised, its alpha channel is traced with Moore-neighbour
boundary following, simplified with Douglas–Peucker, and handed to `poly-decomp`
for convex decomposition (see [`src/sprites.js`](src/sprites.js)). Anything that
fails to decompose cleanly falls back to its convex hull, so a bad outline
degrades instead of breaking.

Field reference:

| field | meaning |
| --- | --- |
| `id` | unique slug; also the artwork filename |
| `name` | shown on the stage |
| `weight` | kilograms, for comedy. Drives the score readout and, heavily compressed, the physics density |
| `size` | longest visible dimension in world units. Atlas' platform is 400 wide |
| `tier` | 1 (pocket junk) … 6 (celestial bodies). A tier unlocks every 7 placements |
| `friction`, `restitution` | optional physics overrides |

Weights are deliberately absurd and span thirty orders of magnitude, so the
simulation compresses them: an anvil still outweighs a rubber duck, but the Moon
does not turn the pile beneath it into soup.

## Layout

| file | what it does |
| --- | --- |
| `src/sprites.js` | rasterises art, traces collision outlines from pixels |
| `src/physics.js` | Matter.js world, body construction, drop projection |
| `src/camera.js` | framing — keeps guaranteed empty space above the pile |
| `src/atlas.js` | Atlas himself, drawn in canvas vectors. His back and palms *are* the platform surface |
| `src/ui.js` | HUD, the object stage, overlays, mass formatting |
| `src/render.js` | sky, clouds, stars, sprites, landing shadow |
| `src/input.js` | one-finger drag, two-finger rotate, wheel and keys |
| `src/game.js` | run state, placement rules, topple detection |
| `vendor/` | Matter.js + poly-decomp browser builds, loaded as plain scripts |
| `scripts/fetch-assets.mjs` | vendors artwork; also validates the catalog |
| `scripts/vendor-libs.mjs` | refreshes `vendor/` from `node_modules` |
| `scripts/serve.mjs` | dependency-free local server for `npm run dev` |

## Credits

Object artwork is [OpenMoji](https://openmoji.org) — the open-source emoji and
icon project — used under **CC BY-SA 4.0**. A handful of objects Unicode does not
cover (traffic pylon, refrigerator, washing machine, filing cabinet, vending
machine, anvil, rubber duck, lava lamp) were drawn for this project and live in
`assets/custom/`. See [`ATTRIBUTION.md`](ATTRIBUTION.md).

Physics by [Matter.js](https://brm.io/matter-js/) with
[poly-decomp](https://github.com/schteppe/poly-decomp.js).
