const rand = (a, b) => a + Math.random() * (b - a);

/** Fully synthesized sound effects (WebAudio) — no audio files needed. */
export class SoundEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Hydraulic hum: low saw + rumbling filtered noise
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'sawtooth';
    this.humOsc.frequency.value = 45;
    const humLP = ctx.createBiquadFilter();
    humLP.type = 'lowpass';
    humLP.frequency.value = 260;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.35;
    this.humOsc.connect(humLP).connect(oscGain).connect(this.humGain);
    this.humOsc.start();
    const rumble = this._noiseSrc(true);
    const rLP = ctx.createBiquadFilter();
    rLP.type = 'lowpass';
    rLP.frequency.value = 160;
    rumble.connect(rLP).connect(this.humGain);
    rumble.start();

    // Hiss for spraying fluid
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    const hiss = this._noiseSrc(true);
    const hHP = ctx.createBiquadFilter();
    hHP.type = 'highpass';
    hHP.frequency.value = 2200;
    hiss.connect(hHP).connect(this.hissGain).connect(this.master);
    hiss.start();
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  _noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  _env(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  setHum(level, load = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(level * 0.3, t, 0.15);
    this.humOsc.frequency.setTargetAtTime(42 + load * 28, t, 0.2);
  }

  setHiss(level) {
    if (!this.ctx) return;
    this.hissGain.gain.setTargetAtTime(level * 0.25, this.ctx.currentTime, 0.1);
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = c.createGain();
    this._env(g, t, 0.6 * strength, 0.005, 0.35);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
    const n = this._noiseSrc();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = c.createGain();
    this._env(ng, t, 0.3 * strength, 0.002, 0.15);
    n.connect(lp).connect(ng).connect(this.master);
    n.start(t); n.stop(t + 0.3);
  }

  creak(intensity = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = rand(0.4, 1.1);
    const g = c.createGain();
    this._env(g, t, 0.18 * intensity, 0.06, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = rand(350, 900);
    bp.connect(g).connect(this.master);
    for (const detune of [0, rand(3, 9)]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f0 = rand(55, 130);
      const curve = new Float32Array(16).map(() => f0 * rand(0.8, 1.35) + detune);
      o.frequency.setValueCurveAtTime(curve, t, dur);
      o.connect(bp);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  ping(pitch = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const f of [1320, 2210, 3460]) {
      const o = c.createOscillator();
      o.frequency.value = f * pitch * rand(0.95, 1.05);
      const g = c.createGain();
      this._env(g, t, 0.08, 0.002, 0.7);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.8);
    }
    this.thud(0.3);
  }

  crunch() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = rand(1200, 3500); bp.Q.value = 1.5;
    const g = c.createGain();
    this._env(g, t, rand(0.15, 0.35), 0.002, rand(0.04, 0.12));
    n.connect(bp).connect(g).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.2);
  }

  shatter() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = c.createGain();
    this._env(g, t, 0.7, 0.002, 0.9);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 1.2);
    for (let i = 0; i < 10; i++) {
      const o = c.createOscillator();
      o.frequency.value = rand(2500, 7000);
      const og = c.createGain();
      const s = t + rand(0, 0.5);
      this._env(og, s, 0.05, 0.001, rand(0.1, 0.4));
      o.connect(og).connect(this.master);
      o.start(s); o.stop(s + 0.5);
    }
    this.thud(0.5);
  }

  boing() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.25);
    const g = c.createGain();
    this._env(g, t, 0.3, 0.01, 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  bang() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    // noise blast
    const n = this._noiseSrc();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(150, t + 1.6);
    const g = c.createGain();
    this._env(g, t, 1.4, 0.003, 1.9);
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    shaper.curve = curve;
    n.connect(lp).connect(shaper).connect(g).connect(this.master);
    n.start(t); n.stop(t + 2.2);
    // sub thump
    const o = c.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1);
    const og = c.createGain();
    this._env(og, t, 1.2, 0.004, 1.2);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 1.4);
    // metallic ring
    for (const f of [187, 431, 612, 1180, 1733]) {
      const r = c.createOscillator();
      r.frequency.value = f * rand(0.97, 1.03);
      const rg = c.createGain();
      this._env(rg, t, 0.07, 0.003, rand(1.5, 3));
      r.connect(rg).connect(this.master);
      r.start(t); r.stop(t + 3.2);
    }
  }

  stopLoops() {
    this.setHum(0);
    this.setHiss(0);
  }
}
