/**
 * All the game's sound, synthesized with WebAudio (no files): one-shot effects, a leash creak that rises
 * with strain, rain for storm rooms, and a small music loop (a pond lullaby; a darker drone in storms).
 * The context starts on the first key or click (browsers require a gesture). M toggles mute.
 */

type Wave = OscillatorType;
const KEY = 'goose-on-a-leash/sound';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private creak: { osc: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTimer = 0;
  private step = 0;
  private nextNote = 0;
  muted = false;
  stormy = false;
  onChange: () => void = () => {};

  constructor() {
    try { this.muted = localStorage.getItem(KEY) === 'off'; } catch { /* storage blocked: default on */ }
    const start = () => this.start();
    window.addEventListener('pointerdown', start, { once: false });
    window.addEventListener('keydown', e => {
      start();
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() === 'm' && !(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) this.toggle();
    });
  }

  toggle(): void {
    this.muted = !this.muted;
    try { localStorage.setItem(KEY, this.muted ? 'off' : 'on'); } catch { /* fine */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    this.onChange();
  }

  private start(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.7; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextNote = ctx.currentTime + 0.2;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  // ------------------------------------------------------------------ building blocks
  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.3, to?: number, at = 0, bus?: GainNode): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol = 0.3, type: BiquadFilterType = 'bandpass', to?: number, at = 0, q = 1): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ effects
  /** Biscuit's honk: two reedy voices, lower and longer as Goose Power grows. */
  honk(power = 2): void {
    const f = 340 - power * 22;
    this.tone(f, 0.26, 'sawtooth', 0.16, f * 0.78); this.tone(f * 1.01, 0.26, 'square', 0.08, f * 0.8);
    this.noise(0.18, 1400, 0.08, 'bandpass', 900, 0, 3);
  }

  play(kind: string, power = 2): void {
    if (!this.ctx || this.muted) return;
    switch (kind) {
      case 'honk': this.honk(power); break;
      case 'chomp': this.noise(0.07, 1800, 0.35, 'bandpass', 900, 0, 2); this.tone(140, 0.09, 'triangle', 0.3, 70); break;
      case 'block': this.tone(520, 0.06, 'square', 0.12, 300); this.noise(0.08, 2400, 0.2, 'bandpass', 1400); break;
      case 'perfect': this.tone(660, 0.06, 'triangle', 0.16, 990); this.tone(990, 0.2, 'triangle', 0.14, 1480, 0.05); break;
      case 'parry': this.tone(880, 0.05, 'square', 0.14, 1320); this.tone(1320, 0.18, 'triangle', 0.12, 1760, 0.04); this.noise(0.1, 3000, 0.2, 'highpass', 2000); break;
      case 'boing': this.tone(260, 0.3, 'sine', 0.2, 620); break;
      case 'splash': this.noise(0.4, 2400, 0.28, 'lowpass', 300); this.tone(420, 0.12, 'sine', 0.08, 180, 0.03); break;
      case 'tear': this.noise(0.16, 3200, 0.3, 'highpass', 5000, 0, 1); this.noise(0.1, 2000, 0.25, 'bandpass', 1200, 0.05, 4); break;
      case 'patch': this.tone(1046, 0.09, 'triangle', 0.18); this.tone(1318, 0.12, 'triangle', 0.18, undefined, 0.08); break;
      case 'pick': this.tone(880, 0.12, 'sine', 0.14); this.tone(1320, 0.16, 'sine', 0.12, undefined, 0.06); break;
      case 'bell': for (const [m, v] of [[1, 0.22], [2.76, 0.08], [5.4, 0.04]] as const) this.tone(784 * m, 1.6, 'sine', v); break;
      case 'spawn': this.tone(300, 0.15, 'sine', 0.06, 200); break;
      case 'wake': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, undefined, i * 0.07)); break;
      case 'chest': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, undefined, i * 0.08)); break;
      case 'gust': this.noise(0.7, 600, 0.3, 'bandpass', 2200, 0, 0.8); break;
      case 'slam': this.tone(90, 0.5, 'sine', 0.5, 35); this.noise(0.4, 500, 0.35, 'lowpass', 120); break;
      case 'snap': this.noise(0.12, 4000, 0.45, 'highpass'); this.tone(1500, 0.18, 'square', 0.12, 200); break;
      case 'faint': [523, 466, 392, 330].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15, undefined, i * 0.16)); break;
      case 'bread': this.tone(600, 0.06, 'sine', 0.12, 900); break;
      case 'poof': this.noise(0.25, 900, 0.2, 'lowpass', 200); break;
      case 'ribbit': this.tone(210, 0.06, 'square', 0.07, 160); this.tone(240, 0.07, 'square', 0.07, 170, 0.08); break;
      case 'tongue': this.tone(900, 0.1, 'sine', 0.1, 300); break;
      case 'hiss': this.noise(0.45, 5000, 0.12, 'highpass'); break;
      case 'kraa': this.tone(520, 0.4, 'sawtooth', 0.12, 340); this.noise(0.3, 1600, 0.08, 'bandpass', 900, 0, 3); break;
      case 'whoosh': this.noise(0.35, 300, 0.15, 'bandpass', 1500); break;
      case 'door': this.noise(0.4, 400, 0.12, 'bandpass', 1200); this.tone(330, 0.2, 'sine', 0.06, 440); break;
      case 'thud': this.tone(160, 0.12, 'triangle', 0.18, 80); this.noise(0.1, 600, 0.12, 'lowpass', 200); break;
      case 'dust': this.noise(0.5, 300, 0.25, 'lowpass', 90); this.tone(70, 0.3, 'sine', 0.25, 40); break;
      case 'spores': this.noise(0.6, 3000, 0.08, 'bandpass', 1200, 0, 2); [784, 659, 523].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.06, undefined, i * 0.1)); break;
      case 'bush': this.noise(0.25, 1800, 0.25, 'bandpass', 700, 0, 1.5); this.tone(120, 0.1, 'triangle', 0.2, 70); break;
      case 'chatter': this.tone(1400, 0.04, 'square', 0.05, 1800); this.tone(1500, 0.04, 'square', 0.05, 1900, 0.06); break;
      case 'growl': this.tone(80, 0.5, 'sawtooth', 0.12, 60); this.noise(0.4, 400, 0.1, 'lowpass', 200); break;
      case 'learn': [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.13, undefined, i * 0.09)); break;
    }
  }

  // ------------------------------------------------------------------ continuous: leash creak and rain
  /** 0-1 strain: a rope creak that rises in pitch and volume, so danger is heard before it is seen. */
  setStrain(v: number): void {
    const c = this.ctx; if (!c) return;
    if (!this.creak) {
      const osc = c.createOscillator(), filt = c.createBiquadFilter(), gain = c.createGain();
      osc.type = 'sawtooth'; filt.type = 'bandpass'; filt.Q.value = 9; gain.gain.value = 0;
      osc.connect(filt).connect(gain).connect(this.sfxBus); osc.start();
      this.creak = { osc, gain, filt };
    }
    const k = Math.max(0, Math.min(1, v)), t = c.currentTime;
    this.creak.osc.frequency.setTargetAtTime(55 + k * 70 + Math.sin(t * 13) * 6 * k, t, 0.05);
    this.creak.filt.frequency.setTargetAtTime(500 + k * 1600, t, 0.05);
    this.creak.gain.gain.setTargetAtTime(k > 0.15 ? 0.05 + k * 0.2 : 0, t, 0.08);
  }

  setRain(on: boolean): void {
    const c = this.ctx; if (!c) return;
    this.stormy = on;
    if (!this.rain) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), gain = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 1800; gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.master); src.start();
      this.rain = { src, gain };
    }
    this.rain.gain.gain.setTargetAtTime(on ? 0.18 : 0, c.currentTime, 0.6);
  }

  // ------------------------------------------------------------------ music
  private scheduleMusic(): void {
    const c = this.ctx; if (!c || this.muted) { if (c) this.nextNote = Math.max(this.nextNote, c.currentTime + 0.1); return; }
    const beat = 60 / 84 / 2;                                        // eighth notes at 84 bpm
    // a lullaby in C major pentatonic; the storm swaps to a low A minor pulse
    const calm = [0, 4, 7, 9, 7, 4, 2, 4, 0, 2, 4, 7, 9, 12, 9, 7];
    const storm = [0, -1, 3, -1, 0, -1, 7, 5, 0, -1, 3, -1, 8, 7, 5, 3];
    while (this.nextNote < c.currentTime + 0.3) {
      const i = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      if (this.stormy) {
        const n = storm[i]!;
        if (n >= 0) this.tone(110 * Math.pow(2, n / 12), beat * 1.6, 'triangle', 0.18, undefined, this.nextNote - c.currentTime, this.musicBus);
        if (i % 8 === 0) this.tone(55, beat * 7, 'sine', 0.3, undefined, this.nextNote - c.currentTime, this.musicBus);
      } else {
        const root = [0, 5, 7, 0][bar]!;
        if (i % 2 === 0) this.tone(523 * Math.pow(2, (calm[i]! + (bar === 2 ? 2 : 0)) / 12), beat * 1.8, 'triangle', 0.14, undefined, this.nextNote - c.currentTime, this.musicBus);
        if (i % 8 === 0) this.tone(131 * Math.pow(2, root / 12), beat * 7.5, 'sine', 0.22, undefined, this.nextNote - c.currentTime, this.musicBus);
        if (i % 4 === 2) this.tone(262 * Math.pow(2, (root + 7) / 12), beat * 1.5, 'sine', 0.06, undefined, this.nextNote - c.currentTime, this.musicBus);
      }
      this.nextNote += beat; this.step++;
    }
  }

  dispose(): void { window.clearInterval(this.musicTimer); void this.ctx?.close(); }
}

export const sound = new Sound();
