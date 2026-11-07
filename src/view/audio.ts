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
  private musicFilter!: BiquadFilterNode;
  private ambBus!: GainNode;
  private echo!: DelayNode;
  private echoSend!: GainNode;
  private bed: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private bed2: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  /** What the game is doing, for the music and the ambience. */
  scene: SoundScene = { biome: 'pond', boss: false, danger: 0, water: 1, fishing: false, quiet: false };
  private theme: Theme = 'pond';
  private ambT = 0;
  private beatT = 0;
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
    // music runs through a lowpass that closes when Bimbo is drying out (everything goes muffled and far away)
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 12000; this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.musicFilter);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.5; this.ambBus.connect(this.master);
    // a cave echo: a feedback delay the effects are sent into while underground
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2200;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.sfxBus.connect(this.echoSend); this.echoSend.connect(this.echo); this.echo.connect(ef).connect(fb).connect(this.echo); ef.connect(this.master);
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

  private noise(dur: number, freq: number, vol = 0.3, type: BiquadFilterType = 'bandpass', to?: number, at = 0, q = 1, bus?: GainNode): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus ?? this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ effects
  /**
   * A goose voice: a buzzy kazoo (sawtooth through a nasal formant) with a wobbly vibrato. `to` slides the pitch,
   * `crack` jumps it up an octave part-way through like a voice breaking.
   */
  private kazoo(f: number, dur: number, vol = 0.16, to?: number, at = 0, crack?: number, wob = 9): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
    const form = c.createBiquadFilter(), nose = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 14;
    for (const x of [o, o2]) {
      x.frequency.setValueAtTime(f, t);
      if (crack) { x.frequency.setValueAtTime(f * 1.9, t + dur * crack); x.frequency.exponentialRampToValueAtTime(Math.max(40, (to ?? f) * 1.6), t + dur); }
      else if (to) x.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    }
    lfo.frequency.value = wob; lg.gain.value = f * 0.035; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    form.type = 'bandpass'; form.frequency.value = 1150; form.Q.value = 2.4;
    nose.type = 'peaking'; nose.frequency.value = 2600; nose.gain.value = 9;
    const mix = c.createGain(); mix.gain.value = 0.7;
    o.connect(form); o2.connect(mix).connect(form); form.connect(nose).connect(g).connect(this.sfxBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  /** Biscuit's honk: a kazoo, lower as Goose Power grows. Never quite the same twice; sometimes his voice cracks. */
  honk(power = 2): void {
    const f = (340 - power * 22) * (0.9 + Math.random() * 0.2), r = Math.random();
    if (r < 0.15) {                                                        // HO-ONK: the voice cracks
      this.kazoo(f, 0.36, 0.2, f * 0.8, 0, 0.35);
    } else if (r < 0.27) {                                                 // honk-honk
      this.kazoo(f, 0.14, 0.18, f * 0.85); this.kazoo(f * 1.06, 0.2, 0.18, f * 0.8, 0.17);
    } else if (r < 0.33) {                                                 // HOOOOOONK
      this.kazoo(f, 0.6, 0.18, f * 0.62, 0, undefined, 6);
    } else this.kazoo(f, 0.26, 0.19, f * 0.78);
    this.noise(0.12, 1400, 0.06, 'bandpass', 900, 0, 3);
  }

  private stepN = 0;
  /** Biscuit's big flat feet: pap, pip, pap, pip. */
  gooseStep(fast = false): void {
    if (!this.ctx || this.muted) return;
    const hi = (this.stepN++ & 1) ? 1.22 : 1;
    this.tone(260 * hi, 0.05, 'triangle', fast ? 0.09 : 0.06, 150 * hi);
    this.noise(0.04, 700, 0.04, 'lowpass', 300);
  }

  play(kind: string, power = 2): void {
    if (!this.ctx || this.muted) return;
    switch (kind) {
      case 'honk': this.honk(power); break;
      case 'chomp': {                                                     // CRUNCH, then a pleased little squeak
        this.noise(0.07, 1800, 0.35, 'bandpass', 900, 0, 2); this.tone(140, 0.09, 'triangle', 0.3, 70);
        const r = Math.random();
        if (r < 0.45) { this.tone(900, 0.06, 'sine', 0.1, 1400, 0.07); }                              // nom
        else if (r < 0.75) { this.tone(820, 0.05, 'sine', 0.09, 1250, 0.07); this.tone(880, 0.06, 'sine', 0.09, 1350, 0.15); }   // nom nom
        else this.kazoo(260, 0.16, 0.1, 200, 0.06);                                                  // mmf
        break;
      }
      case 'eep': { const f = 900 + Math.random() * 200; this.tone(f, 0.07, 'sine', 0.11, f * 1.6); this.tone(f * 1.2, 0.09, 'sine', 0.09, f * 1.9, 0.08); break; }   // Rocco squeaks
      case 'gulp': this.tone(240, 0.08, 'triangle', 0.12, 120); this.tone(180, 0.07, 'sine', 0.08, 90, 0.09); break;
      case 'gnaw': this.noise(0.05, 2200, 0.08, 'bandpass', 1200, 0, 3); this.kazoo(150 + Math.random() * 60, 0.14, 0.07, 120, 0.02, undefined, 22); break;   // grrmmf
      case 'goosehiss': this.noise(0.6, 4200, 0.14, 'highpass', 6000); this.kazoo(110, 0.5, 0.05, 90, 0.05, undefined, 26); break;
      case 'mutter': { const f = 300 + Math.random() * 80; this.kazoo(f, 0.13, 0.08, f * (Math.random() < 0.5 ? 1.35 : 0.8)); break; }   // hnk? / hnk.
      case 'squawk': this.kazoo(520, 0.32, 0.16, 260, 0, 0.2, 14); break;                              // HONK?!
      case 'slide': { const c = this.ctx; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;  // the slide whistle on a cast
        o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1560, t + 0.3);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.4); break; }
      case 'slidedown': { const c = this.ctx; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
        o.type = 'sine'; o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.22);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.3); break; }
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
      case 'blip': this.tone(520, 0.06, 'sine', 0.12, 700); break;
      case 'reelclick': this.noise(0.02, 3000, 0.08, 'highpass'); break;
      case 'door': this.noise(0.4, 400, 0.12, 'bandpass', 1200); this.tone(330, 0.2, 'sine', 0.06, 440); break;
      case 'thud': this.tone(160, 0.12, 'triangle', 0.18, 80); this.noise(0.1, 600, 0.12, 'lowpass', 200); break;
      case 'dust': this.noise(0.5, 300, 0.25, 'lowpass', 90); this.tone(70, 0.3, 'sine', 0.25, 40); break;
      case 'spores': this.noise(0.6, 3000, 0.08, 'bandpass', 1200, 0, 2); [784, 659, 523].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.06, undefined, i * 0.1)); break;
      case 'bush': this.noise(0.25, 1800, 0.25, 'bandpass', 700, 0, 1.5); this.tone(120, 0.1, 'triangle', 0.2, 70); break;
      case 'chatter': this.tone(1400, 0.04, 'square', 0.05, 1800); this.tone(1500, 0.04, 'square', 0.05, 1900, 0.06); break;
      case 'growl': this.tone(80, 0.5, 'sawtooth', 0.12, 60); this.noise(0.4, 400, 0.1, 'lowpass', 200); break;
      // backpack crafting: each step climbs a little scale (power = step number), so a puzzle plays a tune as you go
      case 'pluck': { const f = 262 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14][power % 9]! / 12); this.tone(f, 0.22, 'triangle', 0.16, f * 0.99); this.tone(f * 2, 0.08, 'square', 0.03); break; }   // twang
      case 'squish': { const f = 140 + power * 18; this.noise(0.09, 700, 0.18, 'lowpass', 250); this.kazoo(f, 0.12, 0.06, f * 1.5, 0.02, undefined, 18); break; }   // splorch
      case 'stitch': { const f = 523 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16][power % 8]! / 12); this.noise(0.03, 3500, 0.1, 'highpass'); this.tone(f, 0.1, 'sine', 0.13, f * 1.25, 0.02); break; }   // pip!
      case 'ovending': this.tone(1568, 0.5, 'sine', 0.12); this.tone(2093, 0.4, 'sine', 0.06, undefined, 0.02); break;
      case 'burnt': this.kazoo(220, 0.4, 0.1, 110, 0, undefined, 16); this.noise(0.3, 900, 0.1, 'lowpass', 200, 0.1); break;   // wah-wahh
      case 'tada': [523, 659, 784].forEach((f, i) => this.kazoo(f, 0.12, 0.1, f, i * 0.1)); this.kazoo(1046, 0.4, 0.12, 1100, 0.3, undefined, 10); this.honk(3); break;
      case 'learn':[392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.13, undefined, i * 0.09)); break;
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

  // ------------------------------------------------------------------ music: a theme per region, and one for bosses
  private scheduleMusic(): void {
    const c = this.ctx; if (!c || this.muted) { if (c) this.nextNote = Math.max(this.nextNote, c.currentTime + 0.1); return; }
    this.stepScene();
    const th = THEMES[this.theme], beat = 60 / th.bpm / 2;               // eighth notes
    while (this.nextNote < c.currentTime + 0.3) {
      const i = this.step % 16, bar = Math.floor(this.step / 16) % 4, at = this.nextNote - c.currentTime;
      if (i === 0 && bar === 0) {                                        // themes change on the downbeat
        const want: Theme = this.stormy ? 'storm' : this.scene.boss ? 'boss' : this.scene.fishing ? 'cove' : this.scene.biome;
        if (want !== this.theme) { this.theme = want; break; }
      }
      const root = th.roots[bar]!, mel = th.mel[i]!;
      if (mel !== null && (th.every ?? 2) && i % (th.every ?? 2) === 0) this.tone(th.lead * Math.pow(2, (mel + root) / 12), beat * th.len, th.wave, th.vol, undefined, at, this.musicBus);
      if (i % 8 === 0) this.tone(th.bass * Math.pow(2, root / 12), beat * 7.5, 'sine', 0.22, undefined, at, this.musicBus);
      if (th.drums) {
        if (i % 4 === 0) this.tone(70, 0.18, 'sine', 0.3, 35, at, this.musicBus);
        if (i % 4 === 2) this.noiseOn(0.05, 6000, 0.05, at, this.musicBus);
        if (i % 8 === 4) this.noiseOn(0.12, 1800, 0.08, at, this.musicBus);
      }
      if (th.pad && i % 8 === 4) this.tone(th.bass * 2 * Math.pow(2, (root + 7) / 12), beat * 3.5, 'sine', 0.05, undefined, at, this.musicBus);
      // danger: a low pulse under everything when something is winding up close by
      if (this.scene.danger > 0.3 && i % 4 === 0) this.tone(55, 0.25, 'triangle', 0.08 + this.scene.danger * 0.1, 40, at, this.musicBus);
      this.nextNote += beat; this.step++;
    }
  }

  private noiseOn(dur: number, freq: number, vol: number, at: number, bus: GainNode): void { this.noise(dur, freq, vol, 'highpass', undefined, at, 1, bus); }

  // ------------------------------------------------------------------ ambience, heartbeat, echo
  private loopBed(): { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } {
    const c = this.ctx!, src = c.createBufferSource(), filt = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true; filt.type = 'lowpass'; gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(this.ambBus); src.start();
    return { src, filt, gain };
  }

  /** Called every 100 ms: the region's bed (waves, wind, cave rumble), its little sounds, and Bimbo's heartbeat. */
  private stepScene(): void {
    const c = this.ctx!, t = c.currentTime, sc = this.scene, b = sc.biome;
    if (!this.bed) { this.bed = this.loopBed(); this.bed2 = this.loopBed(); }
    const bed = this.bed, bed2 = this.bed2!;
    const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1);
    const quiet = sc.quiet ? 0 : 1;
    // the bed: waves on the coast, wind in the woods, a low rumble underground, a soft hush on the water
    const sea = b === 'wharf' || b === 'cove';
    bed.filt.type = 'lowpass';
    bed.filt.frequency.setTargetAtTime(sea ? 300 + swell * 700 : b === 'woods' ? 500 + swell * 500 : b === 'tide' || b === 'castle' ? 160 : 700, t, 0.4);
    bed.gain.gain.setTargetAtTime(quiet * (sea ? 0.05 + swell * 0.1 : b === 'woods' ? 0.03 + swell * 0.05 : b === 'tide' ? 0.09 : 0.025), t, 0.5);
    bed2.filt.type = 'bandpass'; bed2.filt.Q.value = b === 'woods' ? 3 : 1;
    bed2.filt.frequency.setTargetAtTime(b === 'woods' ? 900 + Math.sin(t * 0.3) * 400 : sea ? 2500 : 4000, t, 0.5);
    bed2.gain.gain.setTargetAtTime(quiet * (b === 'woods' ? 0.03 * swell : sea ? 0.02 * swell : 0.006), t, 0.5);
    this.echoSend.gain.setTargetAtTime(b === 'tide' ? 0.35 : b === 'castle' ? 0.22 : 0, t, 0.3);
    // muffled music when Bimbo is drying out
    this.musicFilter.frequency.setTargetAtTime(sc.water < 0.25 ? 500 + sc.water * 3000 : 12000, t, 0.4);
    // little sounds of the place
    this.ambT -= 0.1;
    if (this.ambT <= 0 && quiet) {
      this.ambT = 1 + Math.random() * 3;
      const A = this.ambBus, r = Math.random();
      if (b === 'pond' || b === 'marsh') {
        if (r < 0.6) for (let k = 0; k < 3 + Math.floor(Math.random() * 4); k++) this.tone(4200 + Math.random() * 300, 0.03, 'square', 0.012, undefined, k * 0.07, A);   // crickets
        else { this.tone(190, 0.07, 'square', 0.025, 150, 0, A); this.tone(220, 0.08, 'square', 0.025, 160, 0.1, A); }                                      // a far frog
      } else if (b === 'woods') {
        if (r < 0.35) { this.tone(392, 0.35, 'sine', 0.03, 370, 0, A); this.tone(330, 0.5, 'sine', 0.03, 310, 0.45, A); }   // an owl
        else if (r < 0.6) this.noise(0.05, 2500, 0.04, 'highpass', undefined, 0, 1, A);                                      // a twig
        else for (let k = 0; k < 3; k++) this.tone(3000 + Math.random() * 600, 0.04, 'sine', 0.01, undefined, k * 0.12, A);
      } else if (sea) {
        if (r < 0.3) { const f = 1300 + Math.random() * 300; this.tone(f, 0.25, 'sawtooth', 0.012, f * 0.7, 0, A); this.tone(f * 1.1, 0.2, 'sawtooth', 0.01, f * 0.8, 0.28, A); }   // a gull, far off
        else if (r < 0.45) for (const [m, v] of [[1, 0.02], [2.76, 0.008]] as const) this.tone(520 * m, 2, 'sine', v, undefined, 0, A);            // the bell buoy
        else if (r < 0.65 && b === 'wharf') this.tone(70 + Math.random() * 30, 0.5, 'sawtooth', 0.01, 60, 0, A);                                        // a rope creaks
      } else if (b === 'castle') {
        if (r < 0.4) for (let k = 0; k < 4; k++) this.noise(0.04, 2400 + Math.random() * 1500, 0.02, 'bandpass', undefined, k * 0.06, 2, A);   // a torch crackles
        else if (r < 0.55) { this.tone(110, 0.4, 'square', 0.012, 100, 0, A); this.noise(0.2, 800, 0.015, 'bandpass', undefined, 0.05, 4, A); }   // chains, far off
        else if (r < 0.65) this.tone(87, 3, 'sine', 0.025, undefined, 0, A);                                                                // a low organ note
      } else if (b === 'tide') {
        const f = 900 + Math.random() * 1400;                                                                                           // drips, echoing
        this.tone(f, 0.08, 'sine', 0.05, f * 0.6); if (r < 0.2) this.noise(1.2, 120, 0.05, 'lowpass', 60, 0, 1, A);
        this.ambT = 0.5 + Math.random() * 1.5;
      }
    }
    // Bimbo's heartbeat when the water's low: faster as it drops
    if (sc.water < 0.25 && sc.water > 0 && quiet) {
      this.beatT -= 0.1;
      if (this.beatT <= 0) {
        this.beatT = 0.55 + sc.water * 2.2;
        this.tone(60, 0.12, 'sine', 0.35, 45); this.tone(55, 0.12, 'sine', 0.28, 40, 0.17);
      }
    }
  }

  /** A footstep: planks knock, sand hushes, stone taps. */
  footstep(surface: 'wood' | 'sand' | 'stone' | 'grass'): void {
    if (!this.ctx || this.muted) return;
    if (surface === 'wood') { this.tone(140 + Math.random() * 30, 0.06, 'triangle', 0.05, 90); this.noise(0.03, 900, 0.03, 'bandpass'); }
    else if (surface === 'sand') this.noise(0.07, 1800, 0.035, 'lowpass', 600);
    else if (surface === 'stone') { this.noise(0.03, 3000, 0.04, 'bandpass', 2000, 0, 3); }
    else this.noise(0.05, 1200, 0.025, 'lowpass', 500);
  }

  dispose(): void { window.clearInterval(this.musicTimer); void this.ctx?.close(); }
}

export type Theme = 'pond' | 'marsh' | 'woods' | 'wharf' | 'tide' | 'cove' | 'boss' | 'storm' | 'castle';
export interface SoundScene { biome: Theme; boss: boolean; danger: number; water: number; fishing: boolean; quiet: boolean }
interface ThemeDef { bpm: number; mel: (number | null)[]; roots: number[]; lead: number; bass: number; wave: Wave; vol: number; len: number; every?: number; drums?: boolean; pad?: boolean }
const _ = null;
/** The music: an eight-bar loop per region. Melody in semitones over each bar's root. */
const THEMES: Record<Theme, ThemeDef> = {
  pond: { bpm: 84, mel: [0, _, 4, _, 7, _, 9, _, 7, _, 4, _, 2, _, 4, _], roots: [0, 5, 7, 0], lead: 523, bass: 131, wave: 'triangle', vol: 0.13, len: 1.8 },
  marsh: { bpm: 76, mel: [0, _, 3, 5, _, 7, _, 5, 3, _, 0, _, 10, _, 7, _], roots: [0, 0, 5, 3], lead: 294, bass: 73, wave: 'triangle', vol: 0.14, len: 1.4, every: 1, pad: true },
  woods: { bpm: 70, mel: [0, _, _, 3, _, 7, _, _, 5, _, 3, _, 2, _, _, _], roots: [0, 8, 3, 10], lead: 330, bass: 82, wave: 'sine', vol: 0.16, len: 3, every: 1, pad: true },
  wharf: { bpm: 104, mel: [0, _, 0, 4, 7, _, 7, _, 5, _, 4, 2, 0, _, 2, _], roots: [0, 5, 0, 7], lead: 392, bass: 98, wave: 'square', vol: 0.06, len: 0.9, every: 1, drums: false, pad: true },
  tide: { bpm: 58, mel: [12, _, _, _, 7, _, _, _, 10, _, _, _, 3, _, _, _], roots: [0, 3, 8, 7], lead: 440, bass: 55, wave: 'sine', vol: 0.09, len: 5, every: 1, pad: true },
  cove: { bpm: 72, mel: [0, _, 4, _, 9, _, 7, _, 4, _, 2, _, 0, _, _, _], roots: [0, 5, 2, 7], lead: 349, bass: 87, wave: 'triangle', vol: 0.12, len: 2.2, every: 1, pad: true },
  castle: { bpm: 92, mel: [0, _, 3, _, 7, _, 8, 7, 3, _, 2, _, 0, _, -1, _], roots: [0, 8, 5, 7], lead: 262, bass: 65, wave: 'square', vol: 0.05, len: 1.2, every: 1, pad: true, drums: false },
  boss: { bpm: 132, mel: [0, 0, 3, 0, 7, 0, 6, 5, 0, 0, 3, 0, 10, 8, 7, 3], roots: [0, 0, 8, 7], lead: 220, bass: 55, wave: 'sawtooth', vol: 0.05, len: 0.6, every: 1, drums: true },
  storm: { bpm: 84, mel: [0, _, 3, _, 0, _, 7, 5, 0, _, 3, _, 8, 7, 5, 3], roots: [0, 0, 0, 0], lead: 110, bass: 55, wave: 'triangle', vol: 0.18, len: 1.6, every: 1, drums: false },
};

export const sound = new Sound();
