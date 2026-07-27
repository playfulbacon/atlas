import './style.css';
import { Game } from './game';
import { UI } from './ui';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

const ui = new UI({
  onStart: () => void game.begin(),
  onRestart: () => void game.begin(),
  onRotate: () => game.rotateStep(),
  onToggleSound: (on) => game.setSound(on),
});

const game = new Game({ canvas, ui });

ui.showTitle();
requestAnimationFrame(game.loop);
