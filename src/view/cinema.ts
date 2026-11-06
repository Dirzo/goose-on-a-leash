/**
 * Plays a cinematic script (src/data/cinematics.ts): letterbox bars, camera pans, typewriter dialogue
 * with portraits, chapter cards, shakes and fades. The scene stops stepping the sim while one plays.
 * Space / Enter / click: finish the line or go to the next. Esc: skip the whole thing.
 *
 * `CinemaView` draws it on the HUD layer.
 */
import Phaser from 'phaser';
import type { Vec } from '../core/math';
import type { Sim } from '../core/sim';
import { CINEMATICS, SPEAKERS, type CamTarget, type Speaker, type Step } from '../data/cinematics';
import { SPRITES } from './assets';
import { TextPool } from './render';

const CPS = 46;             // typewriter characters per second

export interface CinemaState {
  bars: number;             // 0..1 letterbox
  fade: number;             // 0..1 black over everything
  cam: Vec | null;          // camera target while it plays
  title: { text: string; sub?: string; a: number } | null;
  line: { who: Speaker; text: string; shown: number; done: boolean } | null;
}

export class Cinema {
  private steps: Step[] = [];
  private i = 0;
  private t = 0;
  private id = '';
  state: CinemaState = { bars: 0, fade: 0, cam: null, title: null, line: null };
  /** Called for side effects a step asks for (sound, shake). */
  onCue: (cue: { sound?: string; shake?: number }) => void = () => {};
  onEnd: (id: string) => void = () => {};

  get active(): boolean { return this.steps.length > 0 && this.i < this.steps.length; }
  /** Letterbox still easing out after it ended. */
  get visible(): boolean { return this.active || this.state.bars > 0.001 || this.state.fade > 0.001; }

  play(id: string): boolean {
    const s = CINEMATICS[id];
    if (!s || this.active) return false;
    this.id = id; this.steps = s; this.i = 0; this.t = 0;
    this.state.title = null; this.state.line = null;
    this.enter();
    return true;
  }

  /** Space / click: finish typing the line, or move on. */
  advance(): void {
    if (!this.active) return;
    const st = this.steps[this.i]!, ln = this.state.line;
    if ('say' in st && ln) {
      if (!ln.done) { ln.shown = ln.text.length; ln.done = true; return; }
      this.next(); return;
    }
    if ('title' in st && this.t > 0.6) this.next();
  }

  skip(): void {
    if (!this.active) return;
    this.i = this.steps.length; this.finish();
  }

  update(dt: number, sim: Sim, playerAt: Vec): void {
    const s = this.state;
    if (!this.active) {
      s.bars = Math.max(0, s.bars - dt * 3); s.fade = Math.max(0, s.fade - dt * 2);
      s.cam = null; s.title = null; s.line = null;
      return;
    }
    s.bars = Math.min(1, s.bars + dt * 3);
    this.t += dt;
    const st = this.steps[this.i]!;
    if ('fadeIn' in st) {
      s.fade = Math.max(0, 1 - this.t / st.fadeIn);
      if (this.t >= st.fadeIn) this.next();
    } else if ('title' in st) {
      const hold = st.hold ?? 2.5;
      s.title = { text: st.title, sub: st.sub, a: Math.min(1, this.t / 0.5, (hold - this.t) / 0.5) };
      if (this.t >= hold) this.next();
    } else if ('pan' in st) {
      s.cam = this.where(st.pan, sim, playerAt);
      if (this.t >= (st.dur ?? 1)) this.next();
    } else if ('say' in st) {
      const ln = s.line!;
      if (!ln.done) { ln.shown = Math.min(ln.text.length, ln.shown + dt * CPS); if (ln.shown >= ln.text.length) ln.done = true; }
      if (ln.done && this.t > ln.text.length / CPS + 5) this.next();    // nobody pressing: move on after a while
    } else if ('wait' in st) {
      if (this.t >= st.wait) this.next();
    } else this.next();
  }

  private where(t: CamTarget, sim: Sim, playerAt: Vec): Vec {
    if (t === 'player') return { x: playerAt.x, y: playerAt.y - 18 };
    if (t === 'boss') {
      const b = sim.enemies.find(e => e.kind === 'heron' || e.kind === 'king' || e.kind === 'elder');
      return b ? { x: b.x, y: b.y - (b.kind === 'heron' ? 50 : 24) } : { x: playerAt.x, y: playerAt.y };
    }
    return t;
  }

  private next(): void {
    this.i++; this.t = 0;
    if (!this.active) { this.finish(); return; }
    this.enter();
  }

  /** Set up a step as it starts (and run the instant ones). */
  private enter(): void {
    const st = this.steps[this.i]!, s = this.state;
    s.title = null;
    if ('say' in st) s.line = { who: st.who, text: st.say, shown: 0, done: false };
    else if (!('shake' in st) && !('sound' in st)) s.line = null;
    if ('fadeIn' in st) s.fade = 1;
    if ('sound' in st) { this.onCue({ sound: st.sound }); this.next(); return; }
    if ('shake' in st) { this.onCue({ shake: st.shake }); this.next(); return; }
  }

  private finish(): void {
    const s = this.state;
    s.line = null; s.title = null; s.cam = null;
    this.steps = [];
    this.onEnd(this.id);
  }
}

/** Draws the cinematic on the HUD layer (1280x720 layout space). */
export class CinemaView {
  private g: Phaser.GameObjects.Graphics;
  private text: Record<'display' | 'body' | 'mono', TextPool>;
  private face: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, screen: <T extends Phaser.GameObjects.GameObject>(o: T) => T, res: number) {
    this.g = screen(scene.add.graphics().setDepth(9800));
    this.text = {
      display: new TextPool(scene, 'display', 9900, t => screen(t), res),
      body: new TextPool(scene, 'body', 9900, t => screen(t), res),
      mono: new TextPool(scene, 'mono', 9900, t => screen(t), res),
    };
    this.face = screen(scene.add.sprite(0, 0, 'rocco_idle').setDepth(9850).setVisible(false));
  }

  draw(st: CinemaState, W: number, H: number, time: number): void {
    const g = this.g; g.clear();
    for (const p of Object.values(this.text)) p.begin();
    this.face.setVisible(false);
    const bar = Math.round(st.bars * 74);
    if (bar > 0) { g.fillStyle(0x05040a, 1); g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar); }
    if (st.fade > 0) { g.fillStyle(0x05040a, st.fade); g.fillRect(0, 0, W, H); }
    if (st.title) {
      const a = Math.max(0, st.title.a);
      g.fillStyle(0x05040a, 0.55 * a); g.fillRect(0, H / 2 - 74, W, 132);
      g.fillStyle(0xc9a46a, a); g.fillRect(W / 2 - 160, H / 2 + 6, 320, 1);
      this.text.display.get(st.title.text.toUpperCase(), W / 2, H / 2 - 12, 40, '#e9e4d6', a);
      if (st.title.sub) this.text.body.get(st.title.sub, W / 2, H / 2 + 36, 18, '#c9a46a', a);
    }
    const ln = st.line;
    if (ln) {
      const sp = SPEAKERS[ln.who], bw = 860, bh = 118, bx = (W - bw) / 2, by = H - bar - bh - 18;
      g.fillStyle(0x0b0a10, 0.92); g.fillRect(bx, by, bw, bh);
      g.lineStyle(2, 0xc9a46a, 1); g.strokeRect(bx, by, bw, bh);
      // portrait
      g.fillStyle(0x1a1726, 1); g.fillRect(bx + 12, by + 12, 94, 94);
      g.lineStyle(1, 0x3a3448, 1); g.strokeRect(bx + 12, by + 12, 94, 94);
      const def = SPRITES[sp.strip];
      if (def) {
        const talking = !ln.done && Math.floor(time * 10) % 2 === 0;
        const frames = def.frames ?? 1;
        this.face.setTexture(sp.strip, Math.min(frames - 1, sp.frame + (talking && frames > 1 ? 1 : 0)))
          .setScale(sp.scale).setFlipX(false).setVisible(true);
        // show a 94px square of the sprite (in screen pixels), framed on the face
        const cw = Math.min(def.w, 94 / sp.scale), ch = Math.min(def.h, 94 / sp.scale);
        const cx = (def.w - cw) * sp.ax, cy = (def.h - ch) * sp.ay;
        this.face.setCrop(cx, cy, cw, ch).setOrigin(0, 0)
          .setPosition(bx + 12 + (94 - cw * sp.scale) / 2 - cx * sp.scale, by + 12 + (94 - ch * sp.scale) / 2 - cy * sp.scale + (talking ? -1 : 0));
      }
      this.text.display.get(sp.name.toUpperCase(), bx + 124, by + 32, 16, sp.color, 1, 'left');
      const shown = ln.text.slice(0, Math.floor(ln.shown));
      wrap(shown, 62).forEach((row, i) => this.text.body.get(row, bx + 124, by + 60 + i * 24, 19, '#e9e4d6', 1, 'left'));
      if (ln.done) this.text.mono.get('▸ space', bx + bw - 16, by + bh - 12, 11, '#c9a46a', 0.5 + 0.5 * Math.sin(time * 5), 'right');
    }
    if (st.bars > 0.5) this.text.mono.get('ESC skip', W - 20, bar - 22, 11, '#6a6478', 0.8, 'right');
    for (const p of Object.values(this.text)) p.end();
  }
}

function wrap(s: string, n: number): string[] {
  const out: string[] = []; let row = '';
  for (const w of s.split(' ')) {
    if ((row + ' ' + w).trim().length > n) { out.push(row.trim()); row = w; } else row += ' ' + w;
  }
  if (row.trim()) out.push(row.trim());
  return out;
}
