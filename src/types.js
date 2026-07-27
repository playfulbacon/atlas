/**
 * Shared shapes, as JSDoc typedefs. There is no build step — these exist so
 * editors give completion and `npm run typecheck` can still catch mistakes.
 */

/**
 * @typedef {{ x: number, y: number }} Vec
 */

/**
 * Where an object's picture comes from. See scripts/fetch-assets.mjs.
 * @typedef {object} ObjectArt
 * @property {string} [openmoji] OpenMoji hexcode, e.g. "1F6C1".
 * @property {string} [custom]   Basename of a file in assets/custom/, e.g. "anvil".
 */

/**
 * One entry in src/data/objects.json.
 * @typedef {object} ObjectDef
 * @property {string} id
 * @property {string} name
 * @property {number} weight Comedic weight in kilograms. Drives the score display
 *   and, heavily compressed, the physics density.
 * @property {number} size   Longest visible dimension in world units. The platform is 400 wide.
 * @property {number} tier   1 = pocket junk, 6 = celestial bodies. Gates when it starts appearing.
 * @property {ObjectArt} art
 * @property {number} [friction]
 * @property {number} [restitution]
 */

/**
 * A sprite plus the collision outline traced from its own pixels.
 * @typedef {object} Sprite
 * @property {HTMLCanvasElement} canvas     Pre-rasterised artwork; blitting a canvas
 *   beats re-rendering an SVG every frame.
 * @property {HTMLCanvasElement} silhouette Flat dark version, for the landing shadow.
 * @property {Vec[]} hull   Outline in local units, origin at the centre of the art's
 *   visible bounding box, longest dimension normalised to 1. Multiply by ObjectDef.size.
 * @property {boolean} convexFallback Whether the hull is concave detail or a plain hull.
 * @property {{ x: number, y: number, w: number, h: number }} draw Image draw rect,
 *   in the same normalised local units.
 */

export {};
