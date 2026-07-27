# Attribution

## Object artwork

Most sprites in `public/assets/objects/` come from **[OpenMoji](https://openmoji.org)**,
the open-source emoji and icon project by the University of Applied Sciences of
Design Schwäbisch Gmünd.

- Licence: **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**
- Version vendored: `openmoji@17.0.0`, `color/svg`
- Files are unmodified copies of the upstream SVGs, renamed to the object's `id`
  so the game can load them by name. The mapping from `id` to OpenMoji hexcode is
  recorded in [`src/data/objects.json`](src/data/objects.json) and re-runnable
  via `npm run assets`.

CC BY-SA 4.0 is a share-alike licence: if you redistribute these images, or
adaptations of them, the images must stay under CC BY-SA 4.0 with attribution to
OpenMoji.

## Artwork drawn for this project

The following are original SVGs in `assets/custom/`, drawn to match OpenMoji's
flat-fill-and-black-line style because Unicode has no emoji for them:

`traffic-cone` · `refrigerator` · `washing-machine` · `filing-cabinet` ·
`vending-machine` · `anvil` · `rubber-duck` · `lava-lamp`

## Code

- **[Matter.js](https://brm.io/matter-js/)** — 2D rigid-body physics, MIT
- **[poly-decomp](https://github.com/schteppe/poly-decomp.js)** — convex
  decomposition of the traced outlines, MIT
- **[Vite](https://vitejs.dev/)** — build tooling, MIT

Atlas himself, the sky, and all game code are original work.
