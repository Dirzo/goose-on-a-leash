import Phaser from 'phaser';
import { BREADS, ITEMS, isCatalyst } from '../data/recipes';
import type { Enemy, Sim, SimEvent } from '../core/sim';
import type { Vec } from '../core/math';

/** Positions from the previous sim step, for interpolating between fixed steps. */
export interface Snapshot { px: number; py: number; gx: number; gy: number; enemies: Map<number, Vec>; rope: number[] }

export function snapshot(sim: Sim): Snapshot {
  const enemies = new Map<number, Vec>();
  for (const e of sim.enemies) enemies.set(e.id, { x: e.x, y: e.y });
  return { px: sim.player.x, py: sim.player.y, gx: sim.goose.x, gy: sim.goose.y, enemies, rope: sim.rope.points.flatMap(p => [p.x, p.y]) };
}

export const FONTS = {
  display: '"Bowlby One", "Arial Black", Impact, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  body: '"Atkinson Hyperlegible", system-ui, sans-serif',
} as const;
export type Face = keyof typeof FONTS;

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface ViewFx { kind: string; x: number; y: number; t: number; a?: number; cone?: number; range?: number; text?: string }
interface Quip { text: string; life: number }

/** Reusable Text objects, one pool per font face, so frames do not allocate. */
export class TextPool {
  private items: Phaser.GameObjects.Text[] = [];
  private used = 0;
  /** `setup` runs once per new Text (camera assignment); `resolution` > 1 keeps text sharp under camera zoom. */
  constructor(private scene: Phaser.Scene, private face: Face, private depth: number,
    private setup: (t: Phaser.GameObjects.Text) => void = () => {}, private resolution = 0) {}
  begin(): void { this.used = 0; }
  get(str: string, x: number, y: number, size: number, color: string, alpha = 1, align: 'center' | 'left' | 'right' = 'center', bold = false): Phaser.GameObjects.Text {
    let t = this.items[this.used];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: FONTS[this.face], fontSize: `${size}px`, color, resolution: this.resolution }).setDepth(this.depth);
      this.setup(t);
      this.items.push(t);
    }
    this.used++;
    if (t.text !== str) t.setText(str);
    const fs = `${size}px`;
    if (t.style.fontSize !== fs) t.setFontSize(fs);
    const weight = bold ? 'bold' : 'normal';
    if (t.style.fontStyle !== weight) t.setFontStyle(weight);
    if (t.style.color !== color) t.setColor(color);
    // Baseline-ish placement to match canvas fillText with textBaseline='alphabetic'.
    t.setOrigin(align === 'center' ? 0.5 : align === 'left' ? 0 : 1, 0.78);
    t.setPosition(x, y).setAlpha(alpha).setVisible(true);
    return t;
  }
  end(): void { for (let i = this.used; i < this.items.length; i++) this.items[i]!.setVisible(false); }
}

export class Renderer {
  private floor: Phaser.GameObjects.Graphics;
  private floorFor = '';
  private world: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private pools: Record<Face, TextPool>;
  private fx: ViewFx[] = [];
  private quips: Quip[] = [];
  private time = 0;

  constructor(private scene: Phaser.Scene) {
    this.floor = scene.add.graphics().setDepth(-1);
    this.world = scene.add.graphics().setDepth(0);
    this.top = scene.add.graphics().setDepth(10);
    this.pools = { display: new TextPool(scene, 'display', 12), mono: new TextPool(scene, 'mono', 11), body: new TextPool(scene, 'body', 11) };
  }

  /** Feed sim events into view-side effects and quips. */
  consume(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'say') this.quips.push({ text: e.text, life: 2.4 });
      else if (e.type === 'fx') this.fx.push({ kind: e.kind, x: e.x, y: e.y, t: 0, a: e.a, cone: e.cone, range: e.range, text: e.text });
      else if (e.type === 'reset') { this.fx = []; }
    }
    this.quips = this.quips.slice(-3);
  }

  draw(sim: Sim, prev: Snapshot | null, alpha: number, dt: number, aim: Vec, showReticle: boolean): void {
    this.time += dt;
    for (const q of this.quips) q.life -= dt;
    this.quips = this.quips.filter(q => q.life > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < 0.7);
    for (const p of Object.values(this.pools)) p.begin();

    const g = this.world, time = this.time, room = sim.room, def = room.def;
    g.clear(); this.top.clear();

    // interpolated positions
    const P = prev ? { x: lerp(prev.px, sim.player.x, alpha), y: lerp(prev.py, sim.player.y, alpha) } : sim.player;
    const G = prev ? { x: lerp(prev.gx, sim.goose.x, alpha), y: lerp(prev.gy, sim.goose.y, alpha) } : sim.goose;
    const EP = (e: Enemy): Vec => { const o = prev?.enemies.get(e.id); return o ? { x: lerp(o.x, e.x, alpha), y: lerp(o.y, e.y, alpha) } : e; };

    // floor tiles: static, so drawn once per room
    if (this.floorFor !== def.id) {
      this.floorFor = def.id; this.floor.clear();
      for (let x = 0; x < def.width; x += 40) for (let y = 0; y < def.height; y += 40) {
        this.floor.fillStyle(((x + y) / 40) % 2 ? 0x20262a : 0x1b2024, 1); this.floor.fillRect(x, y, 40, 40);
      }
    }
    // pit
    const pit = def.pit;
    if (pit) {
      g.fillStyle(0x050607, 1); g.fillRect(pit.x, pit.y, pit.w, pit.h);
      g.fillStyle(0x28323c, 0.18); g.fillRect(pit.x + pit.w * 0.3, pit.y, pit.w * 0.4, pit.h);
      this.stripes(pit.x - 8, pit.y, 8, pit.h); this.stripes(pit.x + pit.w, pit.y, 8, pit.h);
      this.text('display', 'PIT', pit.x + pit.w / 2, pit.y + pit.h / 2, 22, '#3a444b');
    }
    // exit
    const exit = def.exit;
    if (exit) {
      g.fillStyle(room.gateClosed ? 0x25302a : 0x2f5a3a, 1); g.fillRect(exit.x, exit.y, exit.w, exit.h);
      this.text('display', 'EXIT', exit.x + exit.w / 2, exit.y + exit.h / 2 + 4, 18, room.gateClosed ? '#4b5a50' : '#9fe0a8');
    }
    // walls and gate
    for (const r of def.walls) { g.fillStyle(0x3a444b, 1); g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle(0x4a565e, 1); g.fillRect(r.x, r.y, r.w, Math.min(4, r.h)); }
    if (room.gateClosed && def.gate) {
      const r = def.gate;
      g.fillStyle(0x6b5a2a, 1); g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(0xf2c230, 1); for (let x = r.x + 4; x < r.x + r.w; x += 12) g.fillRect(x, r.y - 2, 4, r.h + 4);
    }
    // vents
    for (const v of def.vents) { g.fillStyle(0x14181b, 1); g.fillRect(v.x - 14, v.y - 9, 28, 18); g.fillStyle(0x3a444b, 1); for (let i = -10; i <= 10; i += 5) g.fillRect(v.x + i - 1, v.y - 7, 2, 14); }
    // mop bucket
    const bk = def.bucket;
    if (bk) {
      const ready = sim.bucketCd <= 0;
      g.fillStyle(0x000000, 0.3); g.fillEllipse(bk.x + 2, bk.y + 12, 28, 10);
      g.fillStyle(ready ? 0xd9c330 : 0x6b6232, 1);
      fillP(g, [{ x: bk.x - 12, y: bk.y - 10 }, { x: bk.x + 12, y: bk.y - 10 }, { x: bk.x + 9, y: bk.y + 10 }, { x: bk.x - 9, y: bk.y + 10 }], true);
      g.lineStyle(3, 0x8b6a3e, 1); g.lineBetween(bk.x + 4, bk.y - 8, bk.x + 16, bk.y - 26);
      g.fillStyle(0xddd5be, 1); g.fillCircle(bk.x + 3, bk.y - 11, 5);
      if (!ready) this.text('mono', `${Math.ceil(sim.bucketCd)}s`, bk.x, bk.y + 28, 10, '#6b6232', 1, 'center', true);
    }
    // bread loaves
    def.breadSpots.forEach((b, i) => {
      if (sim.breadGot[i]) return;
      const y = b.y + Math.sin(time * 3 + b.x) * 2;
      g.fillStyle(0x000000, 0.3); g.fillEllipse(b.x + 2, b.y + 8, 22, 8);
      g.fillStyle(0xc98a3c, 1); g.fillEllipse(b.x, y, 24, 14);
      g.lineStyle(1.5, 0xe8b86a, 1); for (let k = -1; k <= 1; k++) g.lineBetween(b.x + k * 5 - 2, y - 4, b.x + k * 5 + 2, y + 1);
    });
    // posts
    for (const p of def.posts) {
      g.fillStyle(0x000000, 0.35); g.fillEllipse(p.x + 3, p.y + 5, p.r * 2, p.r * 1.2);
      g.fillStyle(0xb8862e, 1); g.fillCircle(p.x, p.y, p.r); g.fillStyle(0xe0b35a, 1); g.fillCircle(p.x - 3, p.y - 3, p.r * 0.45);
    }
    // bell
    const bell = def.bell;
    if (bell) {
      const pts: Vec[] = [{ x: bell.x - 16, y: bell.y + 12 }];
      for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(quad({ x: bell.x - 16, y: bell.y + 12 }, { x: bell.x - 14, y: bell.y - 16 }, { x: bell.x, y: bell.y - 18 }, t)); }
      for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(quad({ x: bell.x, y: bell.y - 18 }, { x: bell.x + 14, y: bell.y - 16 }, { x: bell.x + 16, y: bell.y + 12 }, t)); }
      g.fillStyle(room.gateClosed ? 0xf2c230 : 0x6b6b5a, 1); fillP(g, pts, true);
      g.fillStyle(0x1d2226, 1); g.fillCircle(bell.x, bell.y + 14, 4);
      this.text('display', room.gateClosed ? 'HONK ME' : 'OPEN', bell.x - 6, bell.y + 40, 11, room.gateClosed ? '#f2c230' : '#9fe0a8');
    }
    // dropped materials
    for (const it of sim.items) {
      const bob = Math.sin(time * 6 + it.x) * 1.5, c = hex(ITEMS[it.mat].color);
      if (isCatalyst(it.mat)) { g.fillStyle(0xf2c230, 0.25); g.fillCircle(it.x, it.y + bob, 11 + Math.sin(time * 8) * 2); g.fillStyle(c, 1); this.star(g, it.x, it.y + bob, 8); }
      else {
        const d = 7;
        g.fillStyle(c, 1); fillP(g, [{ x: it.x, y: it.y + bob - d }, { x: it.x + d, y: it.y + bob }, { x: it.x, y: it.y + bob + d }, { x: it.x - d, y: it.y + bob }], true);
        g.lineStyle(1, 0x000000, 0.45); strokeP(g, [{ x: it.x, y: it.y + bob - d }, { x: it.x + d, y: it.y + bob }, { x: it.x, y: it.y + bob + d }, { x: it.x - d, y: it.y + bob }], true);
      }
    }
    // enemies
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const { x, y } = EP(e);
      const sc = e.falling ? Math.max(0.05, 1 - e.falling / 0.6) : 1, r = e.r * sc;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(x + 2, y + r * 0.7, r * 2, r * 0.9);
      if (e.kind === 'bunny') {
        g.fillStyle(e.hitT > 0 ? 0xffffff : 0x8d8f96, 1);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = r + (i % 2 ? 2 : -1) * sc; g.fillCircle(x + Math.cos(a) * rr * 0.5, y + Math.sin(a) * rr * 0.5, r * 0.6); }
        g.fillStyle(0x1d2226, 1); g.fillCircle(x - 4 * sc, y - 2 * sc, 2.2 * sc); g.fillCircle(x + 4 * sc, y - 2 * sc, 2.2 * sc);
      } else {
        g.fillStyle(e.hitT > 0 ? 0xffffff : 0x7c8794, 1); g.fillCircle(x, y, r);
        g.fillStyle(0x4d5763, 1); g.fillRect(x - r, y - 4 * sc, r * 2, 8 * sc);
        g.fillStyle(0x111111, 1); g.fillRect(x - 10 * sc, y - 2 * sc, 20 * sc, 3 * sc);
        g.fillStyle(0xc94b3a, 1); g.fillRect(x - 2 * sc, y - r - 6 * sc, 4 * sc, 8 * sc);
      }
      if (!e.falling) {
        if (e.stun > 0) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; g.fillStyle(0xf2c230, 1); this.star(g, x + Math.cos(a) * e.r, y - e.r - 6 + Math.sin(a) * 3, 3); }
        if (e.hp < e.max) { g.fillStyle(0x000000, 1); g.fillRect(x - e.r, y + e.r + 6, e.r * 2, 4); g.fillStyle(0xe05a47, 1); g.fillRect(x - e.r, y + e.r + 6, e.r * 2 * Math.max(0, e.hp / e.max), 4); }
      }
    }
    // rope
    const leash = sim.kit.leashDef;
    const rp = sim.rope.points.map((p, i) => prev?.rope.length ? { x: lerp(prev.rope[i * 2]!, p.x, alpha), y: lerp(prev.rope[i * 2 + 1]!, p.y, alpha) } : { x: p.x, y: p.y });
    if (sim.leashAttached) rp[0] = { x: P.x, y: P.y };
    rp[rp.length - 1] = { x: G.x, y: G.y };
    const smooth = smoothRope(rp);
    g.lineStyle(leash.heavy ? 4 : 3, hex(leash.ropeColor), 1);
    if (leash.heavy) dashed(g, smooth, 5, 3); else strokeP(g, smooth, false);
    if (Math.hypot(G.x - P.x, G.y - P.y) > sim.leashLen() * 0.97) { g.lineStyle(1, 0xf2c230, 0.5); strokeP(g, smooth, false); }

    // the player (gray-box)
    const pl = sim.player;
    if (!(pl.inv > 0 && Math.floor(time * 16) % 2)) {
      const lift = pl.air ? 8 : 0, fx = pl.fx, fy = pl.fy;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(P.x + 2, P.y + 11, 26, 12);
      g.fillStyle(0x3d6fb3, 1); g.fillCircle(P.x, P.y - lift, pl.r);
      g.fillStyle(0xe9c9a0, 1); g.fillCircle(P.x + fx * 4, P.y - lift - 4 + fy * 2, 7);
      g.fillStyle(0x2b4f82, 1); g.fillRect(P.x - 8 + fx * 4, P.y - lift - 12, 16, 5);
      g.lineStyle(3, 0x8b6a3e, 1); g.lineBetween(P.x - fy * 12, P.y - lift + fx * 12, P.x - fy * 12 - fx * 14, P.y - lift + fx * 12 + 18);
      g.fillStyle(0xddd5be, 1); g.fillCircle(P.x - fy * 12 - fx * 14, P.y - lift + fx * 12 + 20, 4);
    }
    this.drawGoose(sim, G);

    // effects
    for (const f of this.fx) {
      const k = f.t / 0.7;
      if (f.kind === 'honk' && f.a !== undefined) {
        g.lineStyle(4, 0xf2c230, 1 - k);
        for (let i = 0; i < 3; i++) { const r = k * (f.range ?? 150) + i * 18; if (r < 8) continue; g.beginPath(); g.arc(f.x, f.y, r, f.a - (f.cone ?? 0.6), f.a + (f.cone ?? 0.6)); g.strokePath(); }
        if (k < 0.5) this.text('display', 'HONK', f.x + Math.cos(f.a) * 40, f.y + Math.sin(f.a) * 40 - 18 - k * 20, 22, '#f2c230', 1 - k * 2);
      }
      if (f.kind === 'chomp') this.text('display', 'CHOMP', f.x, f.y - 20 - k * 20, 14, '#f08a24', 1 - k);
      if (f.kind === 'boing') this.text('display', 'BOING', f.x, f.y - 16 - k * 16, 13, '#c9a46a', 1 - k);
      if (f.kind === 'pick' && f.text) this.text('mono', f.text, f.x, f.y - k * 24, 11, '#e9e4d6', 1 - k, 'center', true);
      if (f.kind === 'snap') this.text('display', 'SNAP!', f.x, f.y - 10 - k * 30, 30, '#e05a47', 1 - k);
      if (f.kind === 'bread') { g.fillStyle(0xc98a3c, 1 - k); for (let i = 0; i < 5; i++) { const a = i * 1.26 + k * 2; g.fillCircle(f.x + Math.cos(a) * (10 + k * 20), f.y - 10 + Math.sin(a) * (10 + k * 20), 3); } }
      if (f.kind === 'poof') { g.fillStyle(0xc8c8c8, 0.6 * (1 - k)); for (let i = 0; i < 6; i++) { const a = i * 1.05; g.fillCircle(f.x + Math.cos(a) * k * 30, f.y + Math.sin(a) * k * 30, 6 * (1 - k) + 2); } }
      if (f.kind === 'ring') { g.lineStyle(3, 0x9fe0a8, 1 - k); g.strokeCircle(f.x, f.y, 10 + k * 70); }
    }

    // reticle
    if (showReticle && !sim.won) {
      const held = sim.goose.state === 'held';
      g.lineStyle(2, held ? 0xf2c230 : 0xe9e4d6, held ? 0.9 : 0.35);
      g.strokeCircle(aim.x, aim.y, 9); g.lineBetween(aim.x - 14, aim.y, aim.x - 5, aim.y); g.lineBetween(aim.x + 5, aim.y, aim.x + 14, aim.y);
    }

    this.hud(sim);
    for (const p of Object.values(this.pools)) p.end();
  }

  private drawGoose(sim: Sim, G: Vec): void {
    const g = this.world, go = sim.goose, f = go.face, time = this.time;
    const furious = go.furious > 0, feral = go.feral;
    const bob = go.state === 'held' || go.state === 'returning' || go.state === 'loose' ? Math.sin(time * 14) * 1.5 : 0;
    const lift = go.state === 'flying' ? 10 : 0, x = G.x, y = G.y - lift + bob;
    const body = furious ? 0xffd9cf : 0xf4f1e8, belly = furious ? 0xf0c0b3 : 0xd9d4c6;
    g.fillStyle(0x000000, 0.35); g.fillEllipse(G.x + 2, G.y + 9, 24, 10);
    g.fillStyle(body, 1); g.fillEllipse(x, y, 26, 20);
    g.fillStyle(belly, 1); g.fillEllipse(x - f * 4, y + 1, 14, 12);
    if (go.state === 'flying') { const w = Math.sin(time * 40) * 6; g.fillStyle(0xe6e1d3, 1); g.fillEllipse(x, y - 6 - w, 20, 8); }
    // neck as a short curve
    const neck = [0, 0.25, 0.5, 0.75, 1].map(t => quad({ x: x + f * 7, y: y - 3 }, { x: x + f * 12, y: y - 10 }, { x: x + f * 11, y: y - 16 }, t));
    g.lineStyle(6, body, 1); strokeP(g, neck, false);
    g.fillStyle(body, 1); g.fillCircle(x + f * 11, y - 17, 6);
    g.fillStyle(0xf08a24, 1); g.fillTriangle(x + f * 15, y - 19, x + f * 24, y - 16, x + f * 15, y - 14);
    g.fillStyle(feral ? 0xff2a1a : 0x111111, 1); g.fillCircle(x + f * 12, y - 19, feral ? 2.6 : 1.8);
    g.lineStyle(1.6, 0x111111, 1); g.lineBetween(x + f * 9, y - 23, x + f * 15, y - 21);
    if (furious) for (let i = 0; i < 2; i++) { const a = time * 3 + i * 3; g.fillStyle(0xe05a47, 0.6); g.fillCircle(x - f * 2 + Math.sin(a) * 4, y - 28 - ((time * 30 + i * 12) % 16), 3); }
    if (go.state === 'loose' || go.state === 'returning') {
      const label = go.state === 'loose' ? (feral ? 'FERAL' : 'RAMPAGE') : '…';
      this.text('display', label, x, y - 34, feral ? 14 : 11, feral ? '#ff2a1a' : '#f08a24');
    }
  }

  private hud(sim: Sim): void {
    const g = this.top, time = this.time, W = sim.room.def.width, H = sim.room.def.height, go = sim.goose;
    // hearts
    for (let i = 0; i < 5; i++) this.heart(g, 40 + i * 24, 40, 9, i < sim.player.hp ? 0xe05a47 : 0x3a444b);
    // fury
    const fx0 = W / 2 - 120, fy = 30;
    g.fillStyle(0x0b0d0e, 1); g.fillRect(fx0, fy, 240, 14);
    const v = go.furious > 0 ? go.furious / (5 * sim.kit.stat('furyDur')) : go.fury / 100;
    g.fillStyle(go.furious > 0 ? (Math.floor(time * 8) % 2 ? 0xe05a47 : 0xf08a24) : 0xf2c230, 1); g.fillRect(fx0 + 2, fy + 2, 236 * Math.min(1, v), 10);
    this.text('mono', go.furious > 0 ? 'FURIOUS' : 'GOOSE FURY', W / 2, fy - 6, 11, go.furious > 0 ? '#e05a47' : '#9aa3a6', 1, 'center', true);
    // strain
    const sy = fy + 22;
    g.fillStyle(0x0b0d0e, 1); g.fillRect(fx0, sy, 240, 8);
    g.fillStyle(go.strain > 0.7 && Math.floor(time * 10) % 2 ? 0xe05a47 : 0xc9a46a, 1); g.fillRect(fx0 + 2, sy + 2, 236 * Math.min(1, go.strain), 4);
    this.text('mono', `STRAIN · POWER ${sim.tuning.power} vs LEASH ${sim.str()}`, fx0, sy + 20, 10, sim.gap() > 0 ? '#e05a47' : '#9aa3a6', 1, 'left', true);
    this.text('mono', sim.kit.leashDef.name.toUpperCase() + (sim.buff.bagel > 0 ? ' +BAGEL' : ''), fx0, sy + 34, 10, '#9aa3a6', 1, 'left', true);
    // bread + buffs
    g.fillStyle(0xc98a3c, 1); g.fillEllipse(42, 72, 20, 12);
    const ab = BREADS.find(b => b.id === sim.kit.active)!;
    this.text('mono', `${ab.name} ×${sim.kit.bread[ab.id]}  [F] [C]`, 58, 77, 13, '#e9c9a0', 1, 'left', true);
    const bf: string[] = [];
    if (sim.buff.noFury > 0) bf.push(`ZEN ${Math.ceil(sim.buff.noFury)}s`);
    if (sim.buff.mega > 0) bf.push(`MEGA HONK ×${sim.buff.mega}`);
    if (bf.length) this.text('mono', bf.join(' · '), 32, 97, 13, '#8cc3e8', 1, 'left', true);
    this.text('mono', '[B] RECIPE BOOK', 32, H - 30, 11, '#9aa3a6', 1, 'left', true);
    // goose state + counters
    const names: Record<string, string> = { held: go.furious > 0 ? 'On leash (straining)' : 'On leash', flying: 'Airborne',
      latched: go.target && 'post' in go.target ? 'Latched: post' : 'Biting', loose: go.feral ? 'FERAL' : 'Rampaging', returning: 'Waddling back' };
    this.text('mono', `GOOSE: ${names[go.state]!.toUpperCase()}`, W - 40, 36, 12, '#9aa3a6', 1, 'right', true);
    this.text('mono', `PESTS HANDLED: ${sim.handled}   TIME: ${sim.time.toFixed(1)}`, W - 40, 52, 12, '#9aa3a6', 1, 'right', true);
    // quips
    this.quips.forEach((q, i) => {
      const a = Math.min(1, q.life / 0.5), y = H - 40 - (this.quips.length - 1 - i) * 22;
      const t = this.text('body', q.text, W / 2, y, 15, '#e9e4d6', a, 'center', true);
      const w = t.width + 20;
      g.fillStyle(0x0b0d0e, 0.75 * a); g.fillRect(W / 2 - w / 2, y - 15, w, 21);
    });
    if (sim.won) {
      g.fillStyle(0x0b0d0e, 0.78); g.fillRect(0, 0, W, H);
      this.text('display', 'ROOM CLEAR', W / 2, H / 2 - 20, 56, '#f2c230');
      this.text('body', `${sim.clearT.toFixed(1)}s · ${sim.handled} pests handled · ${sim.kit.leashDef.name} · press R to replay`, W / 2, H / 2 + 30, 16, '#e9c9a0', 1, 'center', true);
    }
  }

  private text(face: Face, s: string, x: number, y: number, size: number, color: string, alpha = 1, align: 'center' | 'left' | 'right' = 'center', bold = false) {
    return this.pools[face].get(s, x, y, size, color, alpha, align, bold);
  }

  private stripes(x: number, y: number, w: number, h: number): void {
    const g = this.world;
    g.fillStyle(0xf2c230, 1); g.fillRect(x, y, w, h);
    g.fillStyle(0x111111, 1);
    for (let i = 0; i < h + w; i += 16) {
      const ys = [y + i, y + i - w, y + i - w + 8, y + i + 8].map(v => Math.max(y, Math.min(y + h, v)));
      fillP(g, [{ x, y: ys[0]! }, { x: x + w, y: ys[1]! }, { x: x + w, y: ys[2]! }, { x, y: ys[3]! }], true);
    }
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const pts: Vec[] = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); }
    fillP(g, pts, true);
  }

  private heart(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    g.fillStyle(color, 1);
    g.fillCircle(x - r * 0.5, y - r * 0.35, r * 0.6); g.fillCircle(x + r * 0.5, y - r * 0.35, r * 0.6);
    g.fillTriangle(x - r * 1.08, y - r * 0.15, x + r * 1.08, y - r * 0.15, x, y + r);
  }
}

/** Phaser types points as Vector2, but only reads .x/.y. */
export function fillP(g: Phaser.GameObjects.Graphics, pts: Vec[], close = true): void { g.fillPoints(pts as unknown as Phaser.Math.Vector2[], close); }
export function strokeP(g: Phaser.GameObjects.Graphics, pts: Vec[], close = false): void { g.strokePoints(pts as unknown as Phaser.Math.Vector2[], close); }

export function quad(a: Vec, c: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Same smoothing as the prototype: quadratic curves through segment midpoints. */
export function smoothRope(pts: Vec[]): Vec[] {
  const out: Vec[] = [pts[0]!];
  let start = pts[0]!;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]!, n = pts[i + 1]!;
    const mid = i < pts.length - 2 ? { x: (c.x + n.x) / 2, y: (c.y + n.y) / 2 } : n;
    for (let s = 1; s <= 3; s++) out.push(quad(start, c, mid, s / 3));
    start = mid;
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function dashed(g: Phaser.GameObjects.Graphics, pts: Vec[], on: number, off: number): void {
  let draw = true, left = on;
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i]!; const b = pts[i + 1]!;
    let segLen = Math.hypot(b.x - a.x, b.y - a.y);
    while (segLen > 1e-6) {
      const step = Math.min(left, segLen), t = step / segLen;
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (draw) g.lineBetween(a.x, a.y, m.x, m.y);
      a = m; segLen -= step; left -= step;
      if (left <= 1e-6) { draw = !draw; left = draw ? on : off; }
    }
  }
}

export const _forTests = { smoothRope, dashed };
