import { spriteUrl } from './catalog.js';

/** @typedef {import('./types.js').ObjectDef} ObjectDef */

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

const UNITS = [
  { limit: 1e3, div: 1, suffix: 'kg' },
  { limit: 1e6, div: 1e3, suffix: 't' },
  { limit: 1e9, div: 1e6, suffix: 'kt' },
  { limit: 1e12, div: 1e9, suffix: 'Mt' },
  { limit: 1e15, div: 1e12, suffix: 'Gt' },
  { limit: 1e18, div: 1e15, suffix: 'Tt' },
];

/**
 * Kilograms into something readable, all the way up to stellar masses.
 * @param {number} kg
 * @returns {string}
 */
export function formatMass(kg) {
  if (!Number.isFinite(kg)) return '∞';
  if (kg <= 0) return '0 kg';
  for (const unit of UNITS) {
    if (kg < unit.limit) return `${significant(kg / unit.div)} ${unit.suffix}`;
  }
  const exponent = Math.floor(Math.log10(kg));
  const mantissa = kg / 10 ** exponent;
  const digits = String(exponent)
    .split('')
    .map((c) => (c === '-' ? '⁻' : SUPERSCRIPT[Number(c)]))
    .join('');
  return `${mantissa.toFixed(2)}×10${digits} kg`;
}

/**
 * @param {number} v
 * @returns {string}
 */
function significant(v) {
  if (v < 10) return v < 1 ? v.toFixed(2) : v.toFixed(2).replace(/\.?0+$/, '');
  if (v < 100) return v.toFixed(1).replace(/\.0$/, '');
  return Math.round(v).toLocaleString('en-US');
}

/**
 * @typedef {object} UIHandlers
 * @property {() => void} onStart
 * @property {() => void} onRestart
 * @property {() => void} onRotate
 * @property {(on: boolean) => void} onToggleSound
 */

export class UI {
  toastTimer = 0;
  soundOn = true;
  lastTrayHeight = 132;

  /** @param {UIHandlers} handlers */
  constructor(handlers) {
    this.el = {
      score: byId('score'),
      weight: byId('weight'),
      trayCard: byId('trayCard'),
      trayImg: /** @type {HTMLImageElement} */ (byId('trayImg')),
      trayName: byId('trayName'),
      trayWeight: byId('trayWeight'),
      tray: byId('tray'),
      toast: byId('toast'),
      title: byId('title'),
      over: byId('over'),
      overScore: byId('overScore'),
      overWeight: byId('overWeight'),
      overNote: byId('overNote'),
      hud: byId('hud'),
      sound: /** @type {HTMLButtonElement} */ (byId('soundBtn')),
    };

    byId('startBtn').addEventListener('click', handlers.onStart);
    byId('restartBtn').addEventListener('click', handlers.onRestart);
    byId('rotateBtn').addEventListener('click', handlers.onRotate);
    this.el.sound.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.el.sound.textContent = this.soundOn ? '🔊' : '🔇';
      this.el.sound.setAttribute('aria-label', this.soundOn ? 'Mute' : 'Unmute');
      handlers.onToggleSound(this.soundOn);
    });
  }

  /**
   * Height in CSS pixels that the tray occupies, so the camera can avoid it.
   * The tray is display:none between runs, so hold on to the last real reading.
   * @returns {number}
   */
  trayHeight() {
    const measured = this.el.tray.getBoundingClientRect().height;
    if (measured > 0) this.lastTrayHeight = measured + 16;
    return this.lastTrayHeight;
  }

  /** @param {number} score */
  setScore(score) {
    this.el.score.textContent = String(score);
  }

  /** @param {number} kg */
  setWeight(kg) {
    this.el.weight.textContent = formatMass(kg);
  }

  /** @param {ObjectDef | null} def */
  setNext(def) {
    if (!def) {
      this.el.trayCard.classList.add('is-empty');
      return;
    }
    this.el.trayCard.classList.remove('is-empty');
    this.el.trayImg.src = spriteUrl(def);
    this.el.trayImg.alt = def.name;
    this.el.trayName.textContent = def.name;
    this.el.trayWeight.textContent = formatMass(def.weight);
  }

  /** @param {boolean} dragging */
  setDragging(dragging) {
    this.el.tray.classList.toggle('is-dragging', dragging);
  }

  nudge() {
    this.el.trayCard.classList.remove('shake');
    // Force a reflow so the animation can restart immediately.
    void this.el.trayCard.offsetWidth;
    this.el.trayCard.classList.add('shake');
  }

  /** @param {string} message */
  toast(message) {
    this.el.toast.textContent = message;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove('show'), 1400);
  }

  showTitle() {
    this.el.title.classList.remove('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.tray.classList.add('hidden');
  }

  showGame() {
    this.el.title.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.tray.classList.remove('hidden');
  }

  /**
   * @param {number} score @param {number} kg @param {string} note
   */
  showGameOver(score, kg, note) {
    this.el.overScore.textContent = String(score);
    this.el.overWeight.textContent = formatMass(kg);
    this.el.overNote.textContent = note;
    this.el.over.classList.remove('hidden');
    this.el.tray.classList.add('hidden');
  }
}

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}
