import { spriteUrl } from './catalog.js';
import { CARRIERS, carrierArtUrl } from './carriers.js';
import { randomName } from './names.js';

/** @typedef {import('./types.js').ObjectDef} ObjectDef */
/** @typedef {import('./types.js').CarrierDef} CarrierDef */
/** @typedef {import('./types.js').Player} Player */
/** @typedef {import('./types.js').Vec} Vec */

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

const UNITS = [
  { limit: 1e3, div: 1, suffix: 'kg' },
  { limit: 1e6, div: 1e3, suffix: 't' },
  { limit: 1e9, div: 1e6, suffix: 'kt' },
  { limit: 1e12, div: 1e9, suffix: 'Mt' },
  { limit: 1e15, div: 1e12, suffix: 'Gt' },
  { limit: 1e18, div: 1e15, suffix: 'Tt' },
];

/** How many objects are on offer. Mirrors SLOT_COUNT in game.js. */
const SLOTS = 3;
const MAX_PLAYERS = 4;
/** Long enough for Bellerophon, short enough to fit four across a phone. */
const MAX_NAME = 14;

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
 * @property {(setup: { names: string[], carrier: CarrierDef }) => void} onStart
 * @property {() => void} onRestart
 * @property {(on: boolean) => void} onToggleSound
 * @property {() => void} onLayout Fired when the tray changes height.
 */

export class UI {
  toastTimer = 0;
  soundOn = true;
  lastTrayHeight = 190;
  lastHudHeight = 74;

  /** Names chosen on the setup screen. Never two the same. */
  /** @type {string[]} */
  names = [];
  playerCount = 2;
  carrierIndex = 0;

  /** @type {HTMLElement[]} */
  slotEls = [];
  /** @type {HTMLImageElement[]} */
  slotImgs = [];

  /** @param {UIHandlers} handlers */
  constructor(handlers) {
    this.handlers = handlers;
    this.el = {
      players: byId('players'),
      totals: byId('totals'),
      score: byId('score'),
      weight: byId('weight'),
      slots: byId('slots'),
      tray: byId('tray'),
      toast: byId('toast'),
      title: byId('title'),
      select: byId('select'),
      over: byId('over'),
      overScore: byId('overScore'),
      overWeight: byId('overWeight'),
      overNote: byId('overNote'),
      scoreboard: byId('scoreboard'),
      roster: byId('roster'),
      countRow: byId('countRow'),
      carriers: byId('carriers'),
      hud: byId('hud'),
      sound: /** @type {HTMLButtonElement} */ (byId('soundBtn')),
    };

    this.fillNames(this.playerCount);
    this.buildSlots();
    this.buildCountRow();
    this.buildCarriers();
    this.renderRoster();

    byId('toSelectBtn').addEventListener('click', () => {
      this.el.title.classList.add('hidden');
      this.el.select.classList.remove('hidden');
    });
    byId('backBtn').addEventListener('click', () => {
      this.el.select.classList.add('hidden');
      this.el.title.classList.remove('hidden');
    });
    byId('startBtn').addEventListener('click', () => {
      this.el.select.classList.add('hidden');
      handlers.onStart(this.setup());
    });
    byId('restartBtn').addEventListener('click', handlers.onRestart);
    // Mid-run, "New game" means a new game: back to who is playing.
    byId('hudRestart').addEventListener('click', () => this.showTitle());
    byId('overSetupBtn').addEventListener('click', () => this.showTitle());

    // The tray grows and shrinks on its own — a fourth player wraps the row, a
    // long object name wraps a card. Whatever the camera reserves for it has to
    // follow, so watch the element rather than only the window.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => handlers.onLayout()).observe(this.el.tray);
    }

    this.el.sound.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.el.sound.textContent = this.soundOn ? '🔊' : '🔇';
      this.el.sound.setAttribute('aria-label', this.soundOn ? 'Mute' : 'Unmute');
      handlers.onToggleSound(this.soundOn);
    });
  }

  /** @returns {{ names: string[], carrier: CarrierDef }} */
  setup() {
    // A name typed and left mid-edit still has to be a name.
    const names = this.names.slice(0, this.playerCount).map((name, i) => {
      const typed = name.trim().slice(0, MAX_NAME);
      return typed || `Player ${i + 1}`;
    });
    return { names, carrier: CARRIERS[this.carrierIndex] ?? CARRIERS[0] };
  }

  /* --------------------------------------------------------- setup screen */

  /**
   * Tops the roster up to `n` names, each one different from every name already
   * on it — including any typed by hand, which is why it is a comparison and not
   * just a fresh draw.
   * @param {number} n
   */
  fillNames(n) {
    while (this.names.length < n) this.names.push(randomName(this.names));
  }

  buildCountRow() {
    for (let n = 1; n <= MAX_PLAYERS; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'count-btn';
      btn.textContent = String(n);
      btn.addEventListener('click', () => {
        this.playerCount = n;
        this.fillNames(n);
        this.renderRoster();
      });
      this.el.countRow.append(btn);
    }
  }

  renderRoster() {
    for (const [i, btn] of [...this.el.countRow.children].entries()) {
      btn.classList.toggle('is-on', i + 1 === this.playerCount);
    }

    this.el.roster.replaceChildren();
    for (let i = 0; i < this.playerCount; i++) {
      const row = document.createElement('li');
      row.className = 'roster-row';

      const dot = document.createElement('span');
      dot.className = `pip pip-${i}`;

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'roster-name';
      name.value = this.names[i];
      name.maxLength = MAX_NAME;
      name.autocomplete = 'off';
      name.spellcheck = false;
      name.setAttribute('aria-label', `Name for player ${i + 1}`);
      name.addEventListener('input', () => { this.names[i] = name.value; });
      // Blank it and you get a name back rather than an anonymous seat.
      name.addEventListener('blur', () => {
        const typed = name.value.trim().slice(0, MAX_NAME);
        this.names[i] = typed || randomName(this.names.filter((_, j) => j !== i));
        name.value = this.names[i];
      });
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') name.blur();
      });

      const reroll = document.createElement('button');
      reroll.type = 'button';
      reroll.className = 'reroll-btn';
      reroll.textContent = '⤾';
      reroll.setAttribute('aria-label', `New name for player ${i + 1}`);
      reroll.addEventListener('click', () => {
        this.names[i] = randomName(this.names.filter((_, j) => j !== i));
        name.value = this.names[i];
      });

      row.append(dot, name, reroll);
      this.el.roster.append(row);
    }
  }

  buildCarriers() {
    for (const [i, def] of CARRIERS.entries()) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'carrier-card';
      card.innerHTML = `
        <span class="carrier-art"><img src="${carrierArtUrl(def)}" alt="" /></span>
        <span class="carrier-name"></span>
        <span class="carrier-blurb"></span>`;
      // Names come from data, so set them as text rather than markup.
      /** @type {HTMLElement} */ (card.querySelector('.carrier-name')).textContent = def.name;
      /** @type {HTMLElement} */ (card.querySelector('.carrier-blurb')).textContent = def.blurb;
      card.addEventListener('click', () => {
        this.carrierIndex = i;
        for (const [j, el] of [...this.el.carriers.children].entries()) {
          el.classList.toggle('is-on', j === i);
        }
      });
      this.el.carriers.append(card);
    }
    this.el.carriers.firstElementChild?.classList.add('is-on');
  }

  /* -------------------------------------------------------------- offers */

  buildSlots() {
    for (let i = 0; i < SLOTS; i++) {
      const card = document.createElement('div');
      card.className = 'slot';
      card.innerHTML = `
        <span class="slot-plinth"><img class="slot-img" alt="" draggable="false" /></span>
        <span class="slot-name"></span>
        <span class="slot-weight"></span>`;
      this.el.slots.append(card);
      this.slotEls.push(card);
      this.slotImgs.push(/** @type {HTMLImageElement} */ (card.querySelector('.slot-img')));
    }
  }

  /**
   * @param {number} index
   * @param {ObjectDef | null} def
   */
  setSlot(index, def) {
    const card = this.slotEls[index];
    if (!card) return;
    const img = this.slotImgs[index];
    const name = /** @type {HTMLElement} */ (card.querySelector('.slot-name'));
    const weight = /** @type {HTMLElement} */ (card.querySelector('.slot-weight'));

    card.classList.toggle('is-empty', !def);
    if (!def) {
      img.removeAttribute('src');
      name.textContent = '';
      weight.textContent = '';
      return;
    }
    img.src = spriteUrl(def);
    img.alt = def.name;
    name.textContent = def.name;
    weight.textContent = formatMass(def.weight);
    // Replay the arrival animation for the object that just refilled the gap.
    card.classList.remove('is-fresh');
    void card.offsetWidth;
    card.classList.add('is-fresh');
  }

  /**
   * Marks one offer as in hand and greys the rest.
   * @param {number} index -1 for none.
   */
  setSelected(index) {
    this.el.tray.classList.toggle('is-choosing', index >= 0);
    for (const [i, card] of this.slotEls.entries()) {
      card.classList.toggle('is-held', i === index);
    }
  }

  /**
   * Which offer, if any, sits under a point in CSS pixels.
   * @param {Vec} point
   * @returns {number} slot index, or -1
   */
  slotAt(point) {
    for (const [i, card] of this.slotEls.entries()) {
      if (card.classList.contains('is-empty')) continue;
      const r = card.getBoundingClientRect();
      if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) return i;
    }
    return -1;
  }

  /**
   * Centre of an offer's artwork, so a drag lifts the object out of where it sat.
   * @param {number} index
   * @returns {Vec}
   */
  slotAnchor(index) {
    const r = this.slotImgs[index].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** @param {number} index */
  nudge(index) {
    const card = this.slotEls[index];
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  /* ------------------------------------------------------------- in-game */

  /**
   * @param {Player[]} players
   * @param {number} turn
   */
  setPlayers(players, turn) {
    this.el.players.replaceChildren();
    // A single player has nobody to take turns with; the row is just noise.
    this.el.players.classList.toggle('hidden', players.length < 2);
    for (const [i, player] of players.entries()) {
      const seat = document.createElement('div');
      seat.className = `player pip-${i}${i === turn ? ' is-turn' : ''}`;
      seat.innerHTML = '<span class="pip"></span>';
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = player.name;
      const kg = document.createElement('span');
      kg.className = 'player-weight';
      kg.textContent = formatMass(player.weight);
      seat.append(name, kg);
      this.el.players.append(seat);
    }
  }

  /**
   * @param {number} objects
   * @param {number} kg
   */
  setTotals(objects, kg) {
    this.el.score.textContent = String(objects);
    this.el.weight.textContent = formatMass(kg);
  }

  /**
   * Height the offers occupy at the top, so the camera keeps the pile clear.
   * @returns {number}
   */
  stageHeight() {
    const tray = this.el.tray.getBoundingClientRect().bottom;
    // Phones have no room to flank the offers, so the totals sit under them —
    // published as a variable because only the layout knows how tall the tray
    // ended up, and only the stylesheet knows whether it cares.
    if (tray > 0) {
      document.documentElement.style.setProperty('--tray-bottom', `${Math.round(tray)}px`);
    }
    const measured = Math.max(tray, this.el.totals.getBoundingClientRect().bottom);
    if (measured > 0) this.lastTrayHeight = measured + 12;
    return this.lastTrayHeight;
  }

  /** @returns {number} */
  hudHeight() {
    const measured = this.el.hud.getBoundingClientRect().height;
    if (measured > 0) this.lastHudHeight = measured + 10;
    return this.lastHudHeight;
  }

  /** @param {string} message */
  toast(message) {
    this.el.toast.textContent = message;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove('show'), 1400);
  }

  /* ------------------------------------------------------------- screens */

  showTitle() {
    this.renderRoster();
    this.el.title.classList.remove('hidden');
    this.el.select.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.tray.classList.add('hidden');
    this.el.totals.classList.add('hidden');
  }

  showGame() {
    this.el.title.classList.add('hidden');
    this.el.select.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.tray.classList.remove('hidden');
    this.el.totals.classList.remove('hidden');
  }

  /**
   * @param {{ players: Player[], objects: number, weight: number, blame: string, note: string }} result
   */
  showGameOver(result) {
    this.el.overScore.textContent = String(result.objects);
    this.el.overWeight.textContent = formatMass(result.weight);
    this.el.overNote.textContent = result.blame
      ? `${result.blame} put the last one on. ${result.note}`
      : result.note;

    const ranked = result.players
      .map((p, i) => ({ ...p, seat: i }))
      .sort((a, b) => b.weight - a.weight);
    this.el.scoreboard.replaceChildren();
    for (const [rank, player] of ranked.entries()) {
      const row = document.createElement('li');
      row.className = `score-row${rank === 0 && player.weight > 0 ? ' is-winner' : ''}`;
      row.innerHTML = `<span class="pip pip-${player.seat}"></span>`;
      const name = document.createElement('span');
      name.className = 'score-name';
      name.textContent = player.name;
      const kg = document.createElement('span');
      kg.className = 'score-weight';
      kg.textContent = formatMass(player.weight);
      row.append(name, kg);
      this.el.scoreboard.append(row);
    }
    // A solo run has nothing to rank.
    this.el.scoreboard.classList.toggle('hidden', result.players.length < 2);

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
