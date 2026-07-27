/**
 * Three synthesised noises, no asset files. Created lazily on the first user
 * gesture so browsers do not block the context.
 */
export class Sfx {
  /** @type {AudioContext | null} */
  ctx = null;
  enabled = true;

  /** @returns {AudioContext | null} */
  context() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /**
   * A soft wooden thunk. Pitch drops as the pile gets heavier.
   * @param {number} heaviness
   */
  place(heaviness) {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = 260 - heaviness * 150;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.45), t + 0.13);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Flat little "nope". */
  reject() {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.setValueAtTime(112, t + 0.06);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Filtered noise burst for the collapse. */
  crash() {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(240, t + 0.85);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);
  }
}
