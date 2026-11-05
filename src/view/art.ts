/**
 * The art renderer: the painted room, animated sprites, the fishing line from Rocco's rod tip,
 * and a screen-space HUD. The world is drawn at 640x360 native pixels (camera zoom 2 on a
 * 1280x720 canvas) and follows Rocco; the HUD has its own camera at 1280x720 so text stays sharp.
 */
import Phaser from 'phaser';
import { BREADS, ITEMS, MATERIALS, isCatalyst, type ItemId } from '../data/recipes';
import type { Enemy, Sim, SimEvent } from '../core/sim';
import type { Vec } from '../core/math';
import { SPRITES } from './assets';
import { TextPool, fillP, smoothRope, dashed, type Face, type Snapshot } from './render';

export const SCREEN_W = 1280, SCREEN_H = 720, ZOOM = 2;

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface ViewFx { kind: string; x: number; y: number; t: number; a?: number; cone?: number; range?: number; text?: string }
interface Quip { text: string; life: number }
interface Drip { x: number; y: number; z: number; vz: number; life: number }

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

/** A sprite strip's attachment point, relative to its anchor, mirrored when the sprite faces left. */
function point(strip: string, name: string, flip: boolean): Vec {
  const s = SPRITES[strip]!, p = s.points[name] ?? s.anchor;
  const x = p[0] - s.anchor[0], y = p[1] - s.anchor[1];
  return { x: flip ? -x : x, y };
}

export class ArtRenderer {
  private hudCam: Phaser.Cameras.Scene2D.Camera;
  private floor: Phaser.GameObjects.Graphics;      // shadows, water glints, items, props: under the sprites
  private line: Phaser.GameObjects.Graphics;       // the leash, over the sprites
  private fxg: Phaser.GameObjects.Graphics;
  private hud: Phaser.GameObjects.Graphics;
  private rocco: Phaser.GameObjects.Sprite;
  private biscuit: Phaser.GameObjects.Sprite;
  private foes = new Map<number, Phaser.GameObjects.Sprite>();
  private wtext: TextPool;
  private htext: Record<Face, TextPool>;
  private fx: ViewFx[] = [];
  private quips: Quip[] = [];
  private drips: Drip[] = [];
  private puddles: { x: number; y: number; life: number }[] = [];
  private glints: { x: number; y: number; ph: number; len: number }[] = [];
  private time = 0;
  private dripAcc = 0;
  private faceL = false;
  private banner = 3.5;
  private flash = 0;
  private bellSwing = 0;
  private cam: Vec | null = null;

  constructor(private scene: Phaser.Scene, sim: Sim) {
    const main = scene.cameras.main;
    main.setZoom(ZOOM).setBounds(0, 0, sim.room.def.width, sim.room.def.height).setRoundPixels(false);
    this.hudCam = scene.cameras.add(0, 0, SCREEN_W, SCREEN_H, false, 'hud');
    const world = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.hudCam.ignore(o); return o; };
    const screen = <T extends Phaser.GameObjects.GameObject>(o: T): T => { main.ignore(o); return o; };

    this.bg = world(scene.add.image(0, 0, `room_${sim.room.def.id}`).setOrigin(0, 0).setDepth(-1000));
    this.floor = world(scene.add.graphics().setDepth(-500));
    this.line = world(scene.add.graphics().setDepth(5000));
    this.fxg = world(scene.add.graphics().setDepth(5100));
    this.hud = screen(scene.add.graphics().setDepth(9000));
    this.rocco = world(scene.add.sprite(0, 0, 'rocco_idle'));
    this.biscuit = world(scene.add.sprite(0, 0, 'biscuit_idle'));
    this.setOrigin(this.rocco, 'rocco_idle'); this.setOrigin(this.biscuit, 'biscuit_idle');
    this.wtext = new TextPool(scene, 'display', 5200, t => world(t), ZOOM);
    this.htext = {
      display: new TextPool(scene, 'display', 9100, t => screen(t)),
      mono: new TextPool(scene, 'mono', 9100, t => screen(t)),
      body: new TextPool(scene, 'body', 9100, t => screen(t)),
    };
    this.worldIgnore = world;

    this.setRoom(sim);
  }

  private bg: Phaser.GameObjects.Image;
  private roomId = '';

  /** Point the background, camera bounds and water glints at the sim's current room. */
  private setRoom(sim: Sim): void {
    const room = sim.room, def = room.def;
    this.roomId = def.id;
    this.bg.setTexture(`room_${def.id}`);
    this.scene.cameras.main.setBounds(0, 0, def.width, def.height);
    for (const s of this.foes.values()) s.destroy();
    this.foes.clear();
    this.glints = [];
    const want = Math.round((def.width * def.height) / 8000);
    let tries = 0;
    while (this.glints.length < want && tries++ < 6000) {
      const x = 20 + Math.random() * (def.width - 40), y = 20 + Math.random() * (def.height - 40);
      if (room.inPit(x, y, 18)) this.glints.push({ x: Math.round(x), y: Math.round(y), ph: Math.random() * 6.28, len: 2 + Math.floor(Math.random() * 4) });
    }
    this.cam = null; this.banner = 3.5; this.drips = []; this.puddles = [];
  }

  private worldIgnore: <T extends Phaser.GameObjects.GameObject>(o: T) => T;

  private setOrigin(s: Phaser.GameObjects.Sprite, strip: string): void {
    const d = SPRITES[strip]!;
    s.setOrigin(d.anchor[0] / d.w, d.anchor[1] / d.h);
  }

  private show(s: Phaser.GameObjects.Sprite, strip: string, frame: number): void {
    if (s.texture.key !== strip) { s.setTexture(strip); this.setOrigin(s, strip); }
    s.setFrame(frame % SPRITES[strip]!.frames);
  }

  consume(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'say') this.quips.push({ text: e.text, life: 2.6 });
      else if (e.type === 'fx') {
        this.fx.push({ kind: e.kind, x: e.x, y: e.y, t: 0, a: e.a, cone: e.cone, range: e.range, text: e.text });
        const cam = this.scene.cameras.main;
        if (e.kind === 'snap') cam.shake(260, 0.006);
        if (e.kind === 'tear') cam.shake(120, 0.003);
        if (e.kind === 'ring') this.bellSwing = 1;
        if (e.kind === 'faint') this.flash = 1;
      } else if (e.type === 'reset') { this.fx = []; this.drips = []; this.puddles = []; this.cam = null; }
      else if (e.type === 'room') this.flash = Math.max(this.flash, 0.45);
    }
    this.quips = this.quips.slice(-3);
  }

  draw(sim: Sim, prev: Snapshot | null, alpha: number, dt: number, aim: Vec, showReticle: boolean): void {
    this.time += dt;
    const time = this.time;
    for (const q of this.quips) q.life -= dt;
    this.quips = this.quips.filter(q => q.life > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < (f.kind === 'faint' ? 1.6 : 0.8));
    this.banner -= dt; this.flash = Math.max(0, this.flash - dt * 0.8); this.bellSwing = Math.max(0, this.bellSwing - dt * 0.7);
    this.wtext.begin(); this.beginExtra(); for (const p of Object.values(this.htext)) p.begin();
    if (sim.room.def.id !== this.roomId) this.setRoom(sim);
    const g = this.floor, room = sim.room, def = room.def, pl = sim.player, go = sim.goose, pk = sim.pack;
    g.clear(); this.line.clear(); this.fxg.clear(); this.hud.clear();

    const P = prev ? { x: lerp(prev.px, pl.x, alpha), y: lerp(prev.py, pl.y, alpha) } : { x: pl.x, y: pl.y };
    const G = prev ? { x: lerp(prev.gx, go.x, alpha), y: lerp(prev.gy, go.y, alpha) } : { x: go.x, y: go.y };
    const EP = (e: Enemy): Vec => { const o = prev?.enemies.get(e.id); return o ? { x: lerp(o.x, e.x, alpha), y: lerp(o.y, e.y, alpha) } : e; };

    // camera: follow Rocco, leaning a little toward Biscuit, eased
    const want = { x: P.x + (G.x - P.x) * 0.25, y: P.y - 18 + (G.y - P.y) * 0.25 };
    if (!this.cam) this.cam = { ...want };
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (want.x - this.cam.x) * k; this.cam.y += (want.y - this.cam.y) * k;
    this.scene.cameras.main.centerOn(this.cam.x, this.cam.y);

    // water glints
    for (const w of this.glints) {
      const a = Math.sin(time * 1.6 + w.ph);
      if (a < 0.35) continue;
      g.fillStyle(0x5a8ea8, (a - 0.35) * 0.9); g.fillRect(w.x + Math.round(Math.sin(time * 0.7 + w.ph) * 2), w.y, w.len, 1);
    }
    // shoreline refill hint while Rocco stands in it
    if (pk.enabled && pk.refilling) for (let i = 0; i < 4; i++) {
      const r = ((time * 18 + i * 7) % 28);
      g.lineStyle(1, 0x9ae0ff, 0.6 * (1 - r / 28)); g.strokeEllipse(P.x, P.y + 2, r * 2, r * 0.8);
    }

    // doors: a label and an arrow pointing out of the room
    for (const d of def.doors ?? []) {
      const shut = d.gated && room.gateClosed;
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      const ox = d.x === 0 ? 1 : d.x + d.w >= def.width ? -1 : 0, oy = d.y === 0 ? 1 : d.y + d.h >= def.height ? -1 : 0;
      const ax = cx + ox * 30, ay = cy + oy * 30, a = 0.3 + 0.2 * Math.sin(time * 3);
      if (!shut) {
        g.fillStyle(0x9fe0a8, a);
        if (ox) g.fillTriangle(ax - ox * 6, ay, ax + ox * 4, ay - 7, ax + ox * 4, ay + 7);
        else g.fillTriangle(ax, ay - oy * 6, ax - 7, ay + oy * 4, ax + 7, ay + oy * 4);
      }
      if (d.label) this.wt(shut ? `${d.label} · shut` : d.label, cx + ox * 26, cy + oy * 40 + (ox ? -d.h / 2 - 4 : 0), 7, shut ? '#9aa3a6' : '#9fe0a8', 0.85, 'mono');
    }
    // legacy exit (Room 01 style)
    const ex = def.doors ? null : def.exit;
    if (ex && !room.gateClosed) {
      const a = 0.25 + 0.15 * Math.sin(time * 3);
      g.fillStyle(0x9fe0a8, a); g.fillTriangle(ex.x + ex.w / 2, ex.y + 10, ex.x + ex.w / 2 - 8, ex.y + 20, ex.x + ex.w / 2 + 8, ex.y + 20);
      this.wt(def.exitLabel ?? 'Exit', ex.x + ex.w / 2, ex.y + ex.h - 4, 8, '#9fe0a8', 0.9);
    }
    const gate = def.gate;
    if (gate && gate.h > gate.w) {
      // vertical gate across an east or west doorway
      if (room.gateClosed) {
        g.fillStyle(0x3a2512, 1); g.fillRect(gate.x + 2, gate.y + 6, 3, gate.h - 12); g.fillRect(gate.x + 8, gate.y + 6, 3, gate.h - 12);
        for (let y = gate.y + 4; y < gate.y + gate.h - 4; y += 7) { g.fillStyle(0x86582f, 1); g.fillRect(gate.x - 4, y, gate.w + 8, 4); g.fillStyle(0xb48250, 1); g.fillRect(gate.x - 4, y, gate.w + 8, 1); }
      } else {
        g.fillStyle(0x5e3e20, 1); g.fillRect(gate.x - 30, gate.y - 2, 34, 4);
        g.fillStyle(0x86582f, 1); for (let x = gate.x - 28; x < gate.x; x += 7) g.fillRect(x, gate.y - 4, 4, 8);
      }
    } else if (gate) {
      if (room.gateClosed) {
        g.fillStyle(0x3a2512, 1); g.fillRect(gate.x + 8, gate.y + 2, gate.w - 16, 3); g.fillRect(gate.x + 8, gate.y + 8, gate.w - 16, 3);
        for (let x = gate.x + 10; x < gate.x + gate.w - 10; x += 7) { g.fillStyle(0x86582f, 1); g.fillRect(x, gate.y - 6, 4, gate.h + 6); g.fillStyle(0xb48250, 1); g.fillRect(x, gate.y - 6, 4, 1); }
      } else {
        g.fillStyle(0x5e3e20, 1); g.fillRect(gate.x + 8, gate.y - 34, 4, 38);   // swung open against the post
        g.fillStyle(0x86582f, 1); for (let y = gate.y - 32; y < gate.y; y += 7) g.fillRect(gate.x + 6, y, 8, 4);
      }
    }
    // the fishing bell, hanging from its baked post
    const bell = def.bell;
    if (bell) {
      const sw = Math.sin(time * 14) * this.bellSwing * 0.5;
      const bx = bell.x + Math.sin(sw) * 6, by = bell.y;
      g.lineStyle(1, 0x2a2219, 1); g.lineBetween(bell.x, bell.y - 26, bx, by - 10);
      const lit = room.gateClosed;
      g.fillStyle(0x1a1522, 1); fillP(g, [{ x: bx - 11, y: by + 9 }, { x: bx - 8, y: by - 8 }, { x: bx, y: by - 12 }, { x: bx + 8, y: by - 8 }, { x: bx + 11, y: by + 9 }], true);
      g.fillStyle(lit ? 0xd8a830 : 0x6b6b5a, 1); fillP(g, [{ x: bx - 10, y: by + 8 }, { x: bx - 7, y: by - 7 }, { x: bx, y: by - 11 }, { x: bx + 7, y: by - 7 }, { x: bx + 10, y: by + 8 }], true);
      g.fillStyle(lit ? 0xffe27a : 0x8a8a78, 1); g.fillRect(bx - 5, by - 6, 3, 10);
      g.fillStyle(0x1a1522, 1); g.fillRect(bx - 10, by + 7, 20, 2); g.fillRect(bx - 1, by + 9, 3, 3);
      if (lit) this.wt('HONK ME', bell.x - 2, bell.y + 26, 7, '#f2c230', 0.6 + 0.4 * Math.sin(time * 4));
    }
    // tackle box (restocks Fishing Line)
    const bk = def.bucket;
    if (bk) {
      const ready = sim.bucketCd <= 0;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(bk.x + 2, bk.y + 9, 30, 8);
      g.fillStyle(0x1a1522, 1); g.fillRect(bk.x - 13, bk.y - 9, 26, 18);
      g.fillStyle(ready ? 0x3f7a52 : 0x2c4436, 1); g.fillRect(bk.x - 12, bk.y - 8, 24, 16);
      g.fillStyle(ready ? 0x5ea672 : 0x3a5a48, 1); g.fillRect(bk.x - 12, bk.y - 8, 24, 5);
      g.fillStyle(0xb8b0a0, 1); g.fillRect(bk.x - 2, bk.y - 4, 4, 3);
      g.lineStyle(2, 0x8a8a90, 1); g.beginPath(); g.arc(bk.x, bk.y - 9, 6, Math.PI, 0); g.strokePath();
      if (ready && Math.floor(time * 2) % 3 === 0) { g.fillStyle(0xfff4c0, 1); g.fillRect(bk.x + 8, bk.y - 12, 1, 3); g.fillRect(bk.x + 7, bk.y - 11, 3, 1); }
      if (!ready) this.wt(`${Math.ceil(sim.bucketCd)}s`, bk.x, bk.y + 20, 7, '#9aa3a6', 1, 'mono');
    }
    // tackle chest
    const chest = def.chest;
    if (chest) {
      const open = sim.chestOpen(), x = chest.x, y = chest.y;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(x + 2, y + 9, 30, 8);
      g.fillStyle(0x1a1522, 1); g.fillRect(x - 13, y - 8, 26, 17);
      g.fillStyle(0x5e3e20, 1); g.fillRect(x - 12, y - 7, 24, 15);
      g.fillStyle(0x86582f, 1); for (let k2 = -10; k2 < 12; k2 += 6) g.fillRect(x + k2, y - 7, 1, 15);
      g.fillStyle(0xd8a830, 1); g.fillRect(x - 12, y - 2, 24, 2); g.fillRect(x - 2, y - 3, 4, 5);
      if (open) {
        g.fillStyle(0x1a1522, 1); g.fillRect(x - 13, y - 17, 26, 9);
        g.fillStyle(0x4a3020, 1); g.fillRect(x - 12, y - 16, 24, 7);
      } else {
        g.fillStyle(0x1a1522, 1); g.fillRect(x - 13, y - 13, 26, 6);
        g.fillStyle(0x86582f, 1); g.fillRect(x - 12, y - 12, 24, 4);
        const tw = 0.4 + 0.4 * Math.sin(time * 4);
        g.fillStyle(0xfff4c0, tw); g.fillRect(x + 9, y - 18, 1, 4); g.fillRect(x + 8, y - 17, 3, 1);
        this.wt('Tackle chest', x, y - 26, 7, '#e0c890', 0.8, 'mono');
      }
    }
    // bread loaves
    def.breadSpots.forEach((b, i) => {
      if (sim.breadGot[i]) return;
      const y = Math.round(b.y + Math.sin(time * 3 + b.x) * 1.5);
      g.fillStyle(0x000000, 0.3); g.fillEllipse(b.x + 1, b.y + 7, 18, 6);
      g.fillStyle(0x1a1522, 1); g.fillEllipse(b.x, y, 20, 12);
      g.fillStyle(0xc98a3c, 1); g.fillEllipse(b.x, y, 18, 10);
      g.fillStyle(0xe8b86a, 1); g.fillEllipse(b.x - 1, y - 2, 12, 4);
      for (let k2 = -1; k2 <= 1; k2++) { g.fillStyle(0x8a5a24, 1); g.fillRect(b.x + k2 * 4, y - 3, 1, 4); }
    });
    // dropped materials
    for (const it of sim.items) {
      const bob = Math.round(Math.sin(time * 6 + it.x) * 1.5), c = hex(ITEMS[it.mat].color), x = Math.round(it.x), y = Math.round(it.y) + bob;
      g.fillStyle(0x000000, 0.3); g.fillEllipse(it.x, it.y + 6, 10, 4);
      if (isCatalyst(it.mat)) { g.fillStyle(0xf2c230, 0.25 + 0.1 * Math.sin(time * 8)); g.fillCircle(x, y, 9); g.fillStyle(c, 1); this.star(g, x, y, 6); }
      else {
        g.fillStyle(0x1a1522, 1); fillP(g, [{ x, y: y - 6 }, { x: x + 6, y }, { x, y: y + 6 }, { x: x - 6, y }], true);
        g.fillStyle(c, 1); fillP(g, [{ x, y: y - 5 }, { x: x + 5, y }, { x, y: y + 5 }, { x: x - 5, y }], true);
        g.fillStyle(0xffffff, 0.5); g.fillRect(x - 1, y - 3, 2, 2);
      }
    }
    // puddles and drips from a leaking pack
    for (const p of this.puddles) { p.life -= dt; g.fillStyle(0x4ab0e0, Math.max(0, p.life) * 0.35); g.fillEllipse(p.x, p.y, 6, 2); }
    this.puddles = this.puddles.filter(p => p.life > 0);

    // ---- Rocco
    const moving = Math.hypot(pl.vx, pl.vy) > 20;
    if (Math.abs(pl.fx) > 0.25) this.faceL = pl.fx < 0;
    const strip = `rocco_${moving ? 'walk' : 'idle'}${pk.enabled && pk.holes > 0 ? '_leak' : ''}${pk.enabled && pk.water < 0.3 ? '_dry' : ''}`;
    this.show(this.rocco, strip, Math.floor(time * (moving ? 10 : 6)));
    const lift = pl.air ? 8 : 0;
    this.rocco.setFlipX(this.faceL).setPosition(Math.round(P.x), Math.round(P.y - lift)).setDepth(P.y);
    this.rocco.setAlpha(pl.inv > 0 && Math.floor(time * 16) % 2 ? 0.35 : 1);
    this.rocco.setAngle(pl.dead > 0 ? (this.faceL ? 90 : -90) : 0);
    g.fillStyle(0x000000, 0.35); g.fillEllipse(P.x + 1, P.y + 1, 24, 7);
    const tip = point(strip, 'rodTip', this.faceL), koi = point(strip, 'koi', this.faceL);
    const tipW = { x: Math.round(P.x) + tip.x, y: Math.round(P.y - lift) + tip.y };
    // leak: drips fall from the pack, puddles where they land
    if (pk.enabled && pk.holes > 0 && pl.dead <= 0) {
      this.dripAcc += dt * pk.holes * 7;
      while (this.dripAcc >= 1) {
        this.dripAcc -= 1;
        this.drips.push({ x: P.x + koi.x + (Math.random() * 6 - 3), y: P.y, z: -koi.y - 4 + Math.random() * 6, vz: 0, life: 1 });
      }
    }
    for (const d of this.drips) { d.vz += 260 * dt; d.z -= d.vz * dt; if (d.z <= 0) { d.life = 0; this.puddles.push({ x: d.x, y: d.y, life: 1.1 }); } }
    this.drips = this.drips.filter(d => d.life > 0);
    for (const d of this.drips) { this.fxg.fillStyle(0x9ae0ff, 1); this.fxg.fillRect(Math.round(d.x), Math.round(d.y - d.z), 1, 2); }

    // ---- Biscuit
    const flying = go.state === 'flying' || go.state === 'latched';
    const bstrip = flying ? 'biscuit_fling' : 'biscuit_idle';
    const bflip = go.face < 0;
    const waddle = go.state === 'loose' || go.state === 'returning';
    this.show(this.biscuit, bstrip, Math.floor(time * (flying ? 16 : waddle ? 12 : 6)));
    const glift = go.state === 'flying' ? 10 : 0;
    this.biscuit.setFlipX(bflip).setPosition(Math.round(G.x), Math.round(G.y - glift)).setDepth(G.y);
    const furious = go.furious > 0;
    if (go.feral) this.biscuit.setTint(Math.floor(time * 8) % 2 ? 0xff6a5a : 0xff9a8a);
    else if (furious) this.biscuit.setTint(0xffc4b8);
    else this.biscuit.clearTint();
    g.fillStyle(0x000000, glift ? 0.22 : 0.35); g.fillEllipse(G.x, G.y + (flying ? 6 : 1), 22, 6);
    const neck = point(bstrip, 'neck', bflip);
    const neckW = { x: Math.round(G.x) + neck.x, y: Math.round(G.y - glift) + neck.y };
    if (furious || go.feral) for (let i = 0; i < 2; i++) {
      const a = time * 3 + i * 3;
      this.fxg.fillStyle(0xe05a47, 0.7); this.fxg.fillRect(Math.round(G.x - 4 + Math.sin(a) * 4 + i * 6), Math.round(G.y - 64 - ((time * 26 + i * 11) % 14)), 2, 2);
    }
    if (go.state === 'loose' || go.state === 'returning') {
      this.wt(go.state === 'loose' ? (go.feral ? 'FERAL' : 'RAMPAGE') : '...', G.x, G.y - 72, go.feral ? 10 : 8, go.feral ? '#ff2a1a' : '#f08a24');
    }

    // ---- enemies
    const alive = new Set<number>();
    for (const e of sim.enemies) {
      if (e.dead) continue;
      alive.add(e.id);
      let s = this.foes.get(e.id);
      if (!s) { s = this.worldIgnore(this.scene.add.sprite(0, 0, e.kind === 'snapper' ? 'snapper' : 'frog')); this.foes.set(e.id, s); }
      const { x, y } = EP(e);
      const awake = e.woke > 0 || (e.stun > 0 && e.kind !== 'snapper');
      const kind = e.kind === 'snapper' ? (e.woke > 0 ? 'snapper_awake' : 'snapper') : awake ? 'frog_awake' : 'frog';
      const blink = ((time * 1.1 + e.id * 0.37) % 3.2) < 0.14;
      this.show(s, kind, blink ? 1 : 0);
      const sc = e.falling ? Math.max(0.05, 1 - e.falling / 0.6) : 1;
      const moving = e.woke > 0 || Math.hypot(e.vx, e.vy) > 15;
      const hop = e.kind !== 'snapper' && moving ? -Math.abs(Math.sin(time * 9 + e.id)) * 4 : 0;
      const pdx = sim.player.x - x;
      s.setPosition(Math.round(x), Math.round(y + hop)).setScale(sc).setDepth(y)
        .setFlipX(e.kind === 'snapper' ? (e.woke > 0 ? pdx > 0 : e.vx < -5 || pdx < -10) : false);
      s.setAlpha(e.falling ? sc : e.woke > 0 ? Math.min(1, (1.6 - e.woke) / 0.5) : 1);
      if (e.woke > 0) {
        // little hearts float up: thank you, Rocco
        for (let i = 0; i < 2; i++) {
          const t = (e.woke * 1.3 + i * 0.5) % 1;
          this.fxg.fillStyle(0xff8aa8, 1 - t);
          const hx2 = Math.round(x + (i ? 5 : -5)), hy2 = Math.round(y - 22 - t * 16);
          this.fxg.fillRect(hx2 - 1, hy2, 1, 1); this.fxg.fillRect(hx2 + 1, hy2, 1, 1); this.fxg.fillRect(hx2 - 1, hy2 + 1, 3, 1); this.fxg.fillRect(hx2, hy2 + 2, 1, 1);
        }
        continue;
      }
      if (e.hitT > 0) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      if (!e.falling) {
        const w = kind === 'snapper' ? 46 : 18;
        g.fillStyle(0x000000, 0.35); g.fillEllipse(x, y + 2, w, w * 0.3);
        if (e.stun > 0) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; this.fxg.fillStyle(0xf2c230, 1); this.star(this.fxg, x + Math.cos(a) * e.r, y - e.r - 14 + Math.sin(a) * 2, 2.5); }
        if (e.hp < e.max) { this.fxg.fillStyle(0x0b0a10, 1); this.fxg.fillRect(x - e.r, y + 6, e.r * 2, 3); this.fxg.fillStyle(0xe05a47, 1); this.fxg.fillRect(x - e.r, y + 6, e.r * 2 * Math.max(0, e.hp / e.max), 3); }
      } else if (Math.floor(time * 20) % 3 === 0) { this.fxg.fillStyle(0x9ae0ff, 0.8); this.fxg.fillRect(Math.round(x + Math.random() * 10 - 5), Math.round(y - 4), 1, 1); }
    }
    for (const [id, s] of this.foes) if (!alive.has(id)) { s.destroy(); this.foes.delete(id); }

    // ---- the line, from the rod tip to Biscuit's neck
    const leash = sim.kit.leashDef;
    const rp = sim.rope.points.map((p, i) => prev?.rope.length ? { x: lerp(prev.rope[i * 2]!, p.x, alpha), y: lerp(prev.rope[i * 2 + 1]!, p.y, alpha) } : { x: p.x, y: p.y });
    const n = rp.length - 1;
    const d0 = sim.leashAttached ? { x: tipW.x - rp[0]!.x, y: tipW.y - rp[0]!.y } : { x: 0, y: 0 };
    const d1 = { x: neckW.x - rp[n]!.x, y: neckW.y - rp[n]!.y };
    for (let i = 0; i <= n; i++) { const u = i / n; rp[i] = { x: rp[i]!.x + d0.x * (1 - u) + d1.x * u, y: rp[i]!.y + d0.y * (1 - u) + d1.y * u }; }
    const smooth = smoothRope(rp);
    const taut = Math.hypot(G.x - P.x, G.y - P.y) > sim.leashLen() * 0.97;
    this.line.lineStyle(leash.heavy ? 2 : 1, hex(leash.ropeColor), 1);
    if (leash.heavy) dashed(this.line, smooth, 4, 2); else this.line.strokePoints(smooth as unknown as Phaser.Math.Vector2[], false);
    if (taut || go.strain > 0.7) { this.line.lineStyle(1, 0xf2c230, 0.4 + 0.4 * Math.sin(time * 20)); this.line.strokePoints(smooth as unknown as Phaser.Math.Vector2[], false); }
    if (sim.leashAttached) { this.line.fillStyle(0xd8ecf4, 1); this.line.fillRect(tipW.x - 1, tipW.y - 1, 2, 2); }

    // ---- effects
    const f2 = this.fxg;
    for (const f of this.fx) {
      const kk = f.t / 0.8;
      if (f.kind === 'honk' && f.a !== undefined) {
        f2.lineStyle(2, 0xf2c230, 1 - kk);
        for (let i = 0; i < 3; i++) { const r = kk * (f.range ?? 150) + i * 14; if (r < 8) continue; f2.beginPath(); f2.arc(f.x, f.y - 30, r, f.a - (f.cone ?? 0.6), f.a + (f.cone ?? 0.6)); f2.strokePath(); }
        if (kk < 0.5) this.wt('HONK', f.x + Math.cos(f.a) * 30, f.y - 50 + Math.sin(f.a) * 30 - kk * 16, 14, '#f2c230', 1 - kk * 2);
      }
      if (f.kind === 'chomp') this.wt('CHOMP', f.x, f.y - 26 - kk * 16, 10, '#f08a24', 1 - kk);
      if (f.kind === 'boing') this.wt('BOING', f.x, f.y - 30 - kk * 12, 9, '#c9a46a', 1 - kk);
      if (f.kind === 'pick' && f.text) this.wt(f.text, f.x, f.y - 40 - kk * 18, 7, '#e9e4d6', 1 - kk, 'mono');
      if (f.kind === 'snap') this.wt('SNAP!', f.x, f.y - 20 - kk * 24, 20, '#e05a47', 1 - kk);
      if (f.kind === 'bread') { f2.fillStyle(0xc98a3c, 1 - kk); for (let i = 0; i < 6; i++) { const a = i * 1.05 + kk * 2; f2.fillRect(Math.round(f.x + Math.cos(a) * (8 + kk * 16)), Math.round(f.y - 30 + Math.sin(a) * (8 + kk * 16)), 2, 2); } }
      if (f.kind === 'poof') { f2.fillStyle(0xc8c8c8, 0.6 * (1 - kk)); for (let i = 0; i < 6; i++) { const a = i * 1.05; f2.fillCircle(f.x + Math.cos(a) * kk * 22, f.y - 6 + Math.sin(a) * kk * 14, 4 * (1 - kk) + 1); } }
      if (f.kind === 'ring') { f2.lineStyle(2, 0x9fe0a8, 1 - kk); f2.strokeCircle(f.x, f.y, 8 + kk * 50); }
      if (f.kind === 'splash' || f.kind === 'tear') {
        const n2 = f.kind === 'tear' ? 8 : 12;
        for (let i = 0; i < n2; i++) {
          const a = -Math.PI / 2 + (i / (n2 - 1) - 0.5) * 2.4, sp = 26 + (i % 3) * 10;
          const x = f.x + Math.cos(a) * sp * kk, y = f.y + Math.sin(a) * sp * kk + 60 * kk * kk;
          f2.fillStyle(i % 2 ? 0x9ae0ff : 0x4ab0e0, 1 - kk); f2.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
        if (f.kind === 'tear' && kk < 0.6) this.wt('RIP!', f.x, f.y - 14 - kk * 10, 9, '#9ae0ff', 1 - kk);
      }
      if (f.kind === 'patch') { for (let i = 0; i < 5; i++) { f2.fillStyle(0x8db07a, 1 - kk); f2.fillRect(Math.round(f.x - 6 + i * 3), Math.round(f.y + (i % 2 ? -2 : 2) - kk * 8), 2, 1); } if (kk < 0.7) this.wt('PATCHED', f.x, f.y - 14 - kk * 10, 8, '#cfe3c4', 1 - kk); }
      if (f.kind === 'faint') this.wt('the koi fainted…', f.x, f.y - 10 - kk * 6, 9, '#9ae0ff', Math.min(1, 2 - kk * 1.25), 'body');
    }

    // reticle
    if (showReticle && !sim.won && pl.dead <= 0) {
      const held = go.state === 'held', ax = Math.round(aim.x), ay = Math.round(aim.y);
      f2.lineStyle(1, held ? 0xf2c230 : 0xe9e4d6, held ? 0.9 : 0.4);
      f2.strokeCircle(ax, ay, 6); f2.lineBetween(ax - 10, ay, ax - 4, ay); f2.lineBetween(ax + 4, ay, ax + 10, ay); f2.lineBetween(ax, ay - 10, ax, ay - 4); f2.lineBetween(ax, ay + 4, ax, ay + 10);
    }

    this.drawHud(sim);
    this.wtext.end(); this.endExtra(); for (const p of Object.values(this.htext)) p.end();
  }

  // ------------------------------------------------------------------ HUD (screen pixels, 1280x720)
  private drawHud(sim: Sim): void {
    const g = this.hud, time = this.time, go = sim.goose, pk = sim.pack, W = SCREEN_W, H = SCREEN_H;
    const panel = (x: number, y: number, w: number, h: number) => { g.fillStyle(0x0b0a10, 0.72); g.fillRect(x, y, w, h); g.lineStyle(2, 0x2a2838, 1); g.strokeRect(x, y, w, h); };

    // hearts + backpack water
    panel(16, 16, 300, pk.enabled ? 104 : 52);
    for (let i = 0; i < 5; i++) this.pixelHeart(30 + i * 36, 28, 4, i < sim.player.hp ? 0xe05a47 : 0x2a2838, i < sim.player.hp ? 0xff8a72 : 0x3e3a52);
    if (pk.enabled) {
      const dry = pk.water < 0.3, blink = dry && Math.floor(time * 4) % 2 === 0;
      this.koiIcon(30, 72, dry);
      const bx = 80, by = 76, bw = 220, bh = 18;
      g.fillStyle(0x1a1522, 1); g.fillRect(bx, by, bw, bh);
      const segs = 10, sw = (bw - 4) / segs;
      for (let s = 0; s < segs; s++) {
        const fill = Math.max(0, Math.min(1, pk.water * segs - s));
        if (fill <= 0) continue;
        g.fillStyle(dry ? (blink ? 0xe05a47 : 0x8a3a3a) : 0x4ab0e0, 1); g.fillRect(bx + 2 + s * sw + 1, by + 2 + (bh - 4) * (1 - fill), sw - 2, (bh - 4) * fill);
        g.fillStyle(0x9ae0ff, dry ? 0 : 0.8); g.fillRect(bx + 2 + s * sw + 1, by + 2 + (bh - 4) * (1 - fill), sw - 2, 2);
      }
      let label = pk.refilling ? 'REFILLING' : dry ? 'KOI DRYING OUT! FIND WATER' : 'MOON KOI';
      let col = pk.refilling ? '#9ae0ff' : dry ? '#e05a47' : '#9aa3a6';
      if (pk.holes > 0 && !pk.refilling && !dry) { label = `LEAKING ×${pk.holes}  [P] PATCH`; col = Math.floor(time * 3) % 2 ? '#9ae0ff' : '#e9e4d6'; }
      this.ht('mono', label, bx, by + 36, 13, col, 1, 'left', true);
      if (pk.holes > 0) for (let h = 0; h < pk.holes; h++) { g.fillStyle(0xe05a47, 1); g.fillRect(bx + bw - 14 - h * 14, by - 10, 8, 6); }
    }

    // fury + strain, top centre
    const fx0 = W / 2 - 160, fy = 30;
    panel(fx0 - 14, 12, 348, 92);
    this.ht('mono', go.furious > 0 ? 'FURIOUS' : 'GOOSE FURY', W / 2, fy + 4, 12, go.furious > 0 ? '#e05a47' : '#9aa3a6', 1, 'center', true);
    g.fillStyle(0x1a1522, 1); g.fillRect(fx0, fy + 10, 320, 14);
    const v = go.furious > 0 ? go.furious / (5 * sim.kit.stat('furyDur')) : go.fury / 100;
    g.fillStyle(go.furious > 0 ? (Math.floor(time * 8) % 2 ? 0xe05a47 : 0xf08a24) : 0xf2c230, 1); g.fillRect(fx0 + 2, fy + 12, 316 * Math.min(1, v), 10);
    g.fillStyle(0x1a1522, 1); g.fillRect(fx0, fy + 30, 320, 8);
    g.fillStyle(go.strain > 0.7 && Math.floor(time * 10) % 2 ? 0xe05a47 : 0xc9a46a, 1); g.fillRect(fx0 + 2, fy + 32, 316 * Math.min(1, go.strain), 4);
    this.ht('mono', `STRAIN · POWER ${sim.tuning.power} vs LEASH ${sim.str()}`, fx0, fy + 56, 11, sim.gap() > 0 ? '#e05a47' : '#9aa3a6', 1, 'left', true);
    this.ht('mono', sim.kit.leashDef.name.toUpperCase() + (sim.buff.bagel > 0 ? ' +BAGEL' : ''), fx0, fy + 70, 11, '#c9a46a', 1, 'left', true);

    // goose state, top right
    const names: Record<string, string> = { held: go.furious > 0 ? 'on the line (straining)' : 'on the line', flying: 'airborne',
      latched: go.target && 'post' in go.target ? 'latched to a post' : 'biting', loose: go.feral ? 'FERAL' : 'rampaging', returning: 'waddling back' };
    panel(W - 296, 16, 280, 52);
    this.ht('display', 'BISCUIT', W - 282, 44, 18, go.feral ? '#ff2a1a' : '#f6f1e6', 1, 'left');
    this.ht('mono', names[go.state]!.toUpperCase(), W - 282, 60, 11, go.feral ? '#ff2a1a' : '#9aa3a6', 1, 'left', true);

    // satchel: bread and materials, bottom left
    panel(16, H - 74, 470, 58);
    const ab = BREADS.find(b => b.id === sim.kit.active)!;
    g.fillStyle(0xc98a3c, 1); g.fillEllipse(38, H - 54, 22, 12); g.fillStyle(0xe8b86a, 1); g.fillEllipse(37, H - 56, 14, 4);
    this.ht('mono', `${ab.name} ×${sim.kit.bread[ab.id]}  [F] throw  [C] swap`, 56, H - 50, 12, '#e9c9a0', 1, 'left', true);
    let mx = 30;
    for (const id of Object.keys(MATERIALS) as ItemId[]) {
      const c = hex(ITEMS[id].color), y = H - 30;
      g.fillStyle(c, 1); fillP(g, [{ x: mx, y: y - 6 }, { x: mx + 6, y }, { x: mx, y: y + 6 }, { x: mx - 6, y }], true);
      const t = this.ht('mono', `${ITEMS[id].name.split(' ').pop()} ${sim.kit.mats[id]}`, mx + 10, y + 4, 11, '#9aa3a6', 1, 'left', true);
      mx += t.width + 26;
    }
    const bf: string[] = [];
    if (sim.buff.noFury > 0) bf.push(`ZEN ${Math.ceil(sim.buff.noFury)}s`);
    if (sim.buff.mega > 0) bf.push(`MEGA HONK ×${sim.buff.mega}`);
    if (bf.length) this.ht('mono', bf.join(' · '), 30, H - 84, 12, '#8cc3e8', 1, 'left', true);
    this.ht('mono', '[B] RECIPE BOOK', W - 24, H - 24, 11, '#9aa3a6', 0.8, 'right', true);

    // quips
    this.quips.forEach((q, i) => {
      const a = Math.min(1, q.life / 0.5), y = H - 110 - (this.quips.length - 1 - i) * 30;
      const t = this.ht('body', q.text, W / 2, y, 18, '#e9e4d6', a, 'center', true);
      g.fillStyle(0x0b0a10, 0.75 * a); g.fillRect(W / 2 - t.width / 2 - 12, y - 18, t.width + 24, 27);
    });

    // room banner
    if (this.banner > 0) {
      const a = Math.min(1, this.banner / 0.8, (3.5 - this.banner) / 0.4);
      this.ht('display', sim.room.def.name.toUpperCase(), W / 2, 200, 44, '#f6f1e6', a);
      if (sim.room.def.subtitle) this.ht('body', sim.room.def.subtitle, W / 2, 234, 18, '#c9a46a', a, 'center', true);
    }
    if (this.flash > 0) { g.fillStyle(0x05040a, Math.min(0.85, this.flash)); g.fillRect(0, 0, W, H); }
    if (sim.won) {
      g.fillStyle(0x0b0a10, 0.78); g.fillRect(0, 0, W, H);
      this.ht('display', 'END OF THE PLAYTEST', W / 2, H / 2 - 30, 52, '#f2c230');
      this.ht('body', sim.room.def.winText ?? 'The path is open.', W / 2, H / 2 + 24, 18, '#e9c9a0', 1, 'center', true);
      this.ht('mono', `${sim.kit.leashDef.name} · ${Object.values(sim.world).filter(m => m.chest).length} chest opened · press R to go back into the room`, W / 2, H / 2 + 56, 13, '#9aa3a6', 1, 'center', true);
    }
  }

  private pixelHeart(x: number, y: number, s: number, c: number, hi: number): void {
    const g = this.hud;
    HEART.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') { g.fillStyle(j === 1 && i === 1 ? hi : c, 1); g.fillRect(x + i * s, y + j * s, s, s); } });
  }

  private koiIcon(x: number, y: number, dry: boolean): void {
    const g = this.hud, s = 3;
    const rows = ['..WWWW...', '.WWWWWW.F', 'WWEWWWWFF', 'WWWWWWWFF', '.WWOWWW.F', '..WWWW...'];
    const col: Record<string, number> = { W: dry ? 0xd8d0c4 : 0xfffaf2, E: 0x15111c, F: 0xffbcc4, O: 0xf4c040 };
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]!; if (ch === '.') continue; g.fillStyle(col[ch]!, 1); g.fillRect(x + i * s, y + j * s, s, s); } });
    if (dry) { g.fillStyle(0x15111c, 1); g.fillRect(x + 1 * s, y + 1 * s, s, s); g.fillRect(x + 3 * s, y + 3 * s, s, s); }
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const pts: Vec[] = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); }
    fillP(g, pts, true);
  }

  /** World-space text (sharp at zoom 2). */
  private wt(s: string, x: number, y: number, size: number, color: string, alpha = 1, face: Face = 'display'): void {
    if (face === 'display') this.wtext.get(s, x, y, size, color, alpha, 'center');
    else this.htextWorld(s, x, y, size, color, alpha, face);
  }
  private worldPools: Partial<Record<Face, TextPool>> = {};
  private htextWorld(s: string, x: number, y: number, size: number, color: string, alpha: number, face: Face): void {
    let p = this.worldPools[face];
    if (!p) { p = this.worldPools[face] = new TextPool(this.scene, face, 5200, t => this.worldIgnore(t), ZOOM); }
    p.get(s, x, y, size, color, alpha, 'center', true);
  }
  private ht(face: Face, s: string, x: number, y: number, size: number, color: string, alpha = 1, align: 'center' | 'left' | 'right' = 'center', bold = false) {
    return this.htext[face].get(s, x, y, size, color, alpha, align, bold);
  }

  /** Called at the start of each frame for the lazily created world pools. */
  beginExtra(): void { for (const p of Object.values(this.worldPools)) p.begin(); }
  endExtra(): void { for (const p of Object.values(this.worldPools)) p.end(); }
}
