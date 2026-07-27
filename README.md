# Atlas — Don't Drop It

A silly physics game about balancing the world's junk on the back of a very
patient titan. Objects arrive one at a time — a traffic pylon, a refrigerator,
a bathtub, an unrequested accordion, eventually the Sun — and you drag each one
onto the flat shelf made by Atlas' back and raised hands. Every object placed is
a point. When the pile falls over, that's the run.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # static bundle in dist/
```

## How it plays

- **Drag** the object from the tray onto the pile. It does not collide with
  anything while you hold it.
- The **shadow** shows exactly where it will come to rest. Placement snaps to
  that shadow, so what you preview is what you get.
- **Two fingers** rotate on touch. Scroll wheel, `Q`/`E` or `←`/`→` on desktop,
  and there is a rotate button for one-handed play.
- Objects must land in **free space** with something underneath them. You cannot
  overlap the pile, and you cannot place into thin air beside it.
- The camera pulls back as the pile grows, so there is always room above it for
  the next thing. Objects get larger as your score climbs.

## Adding objects

The catalog is data. To add one:

1. Add a row to [`src/data/objects.json`](src/data/objects.json):

   ```json
   { "id": "grand-piano", "name": "Grand Piano", "weight": 480, "size": 210,
     "tier": 4, "art": { "openmoji": "1F3B9" } }
   ```

   `art` is either `{ "openmoji": "<hexcode>" }` (fetched from the OpenMoji CDN)
   or `{ "custom": "<name>" }` (a file in `assets/custom/<name>.svg`).

2. `npm run assets` — vendors the artwork into `public/assets/objects/<id>.svg`.

That is the whole process. **No collision shape is authored by hand:** at load
time each sprite is rasterised, its alpha channel is traced with Moore-neighbour
boundary following, simplified with Douglas–Peucker, and handed to `poly-decomp`
for convex decomposition (see [`src/sprites.ts`](src/sprites.ts)). Anything that
fails to decompose cleanly falls back to its convex hull, so a bad outline
degrades instead of breaking.

Field reference:

| field | meaning |
| --- | --- |
| `id` | unique slug; also the artwork filename |
| `name` | shown in the tray |
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
| `src/sprites.ts` | rasterises art, traces collision outlines from pixels |
| `src/physics.ts` | Matter.js world, body construction, drop projection |
| `src/camera.ts` | framing — keeps guaranteed empty space above the pile |
| `src/atlas.ts` | Atlas himself, drawn in canvas vectors |
| `src/render.ts` | sky, clouds, stars, sprites, landing shadow |
| `src/input.ts` | one-finger drag, two-finger rotate, wheel and keys |
| `src/game.ts` | run state, placement rules, topple detection |
| `scripts/fetch-assets.mjs` | vendors artwork; also validates the catalog |

## Credits

Object artwork is [OpenMoji](https://openmoji.org) — the open-source emoji and
icon project — used under **CC BY-SA 4.0**. A handful of objects Unicode does not
cover (traffic pylon, refrigerator, washing machine, filing cabinet, vending
machine, anvil, rubber duck, lava lamp) were drawn for this project and live in
`assets/custom/`. See [`ATTRIBUTION.md`](ATTRIBUTION.md).

Physics by [Matter.js](https://brm.io/matter-js/) with
[poly-decomp](https://github.com/schteppe/poly-decomp.js).
