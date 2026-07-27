import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('stage'));

const ui = new UI({
  onStart: () => void game.begin(),
  onRestart: () => void game.begin(),
  onToggleSound: (on) => game.setSound(on),
});

const game = new Game({ canvas, ui });

ui.showTitle();
requestAnimationFrame(game.loop);
