import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('stage'));

/** @type {{ names: string[], carrier: import('./types.js').CarrierDef } | null} */
let lastSetup = null;

const ui = new UI({
  onStart: (setup) => { lastSetup = setup; void game.begin(setup); },
  // Restart replays the same table on the same carrier.
  onRestart: () => { if (lastSetup) void game.begin(lastSetup); },
  onToggleSound: (on) => game.setSound(on),
});

const game = new Game({ canvas, ui });

ui.showTitle();
requestAnimationFrame(game.loop);
