/**
 * The art renderer: the painted room, animated sprites, the fishing line from Rocco's rod tip,
 * and a screen-space HUD. The world is drawn at 640x360 native pixels (camera zoom 2 on a
 * 1280x720 canvas) and follows Rocco; the HUD has its own camera at 1280x720 so text stays sharp.
 */
import Phaser from 'phaser';
import { BREADS, ITEMS, MATERIALS, isCatalyst, type ItemId } from '../data/recipes';
import { C } from '../core/config';
import type { Enemy, Sim, SimEvent } from '../core/sim';
import type { Vec } from '../core/math';
import { SPRITES } from './assets';
import { Atmosphere } from './atmosphere';
import { TextPool, fillP, smoothRope, dashed, type Face, type Snapshot } from './render';

/** HUD layout space (the HUD is laid out at 1280x720 and scaled up by HUD_SCALE). */
export const SCREEN_W = 1280, SCREEN_H = 720, ZOOM = 2;
/** The canvas: 1920x1080 at world zoom 2 shows 960x540 world pixels, crisp, a wider view of the world. */
export const HUD_SCALE = 1.5, CANVAS_W = SCREEN_W * HUD_SCALE, CANVAS_H = SCREEN_H * HUD_SCALE;

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
  /** Screen-space rain for storm rooms. */
  private rain: Phaser.GameObjects.Graphics;
  private rocco: Phaser.GameObjects.Sprite;
  private biscuit: Phaser.GameObjects.Sprite;
  private foes = new Map<number, Phaser.GameObjects.Sprite>();
  private wtext: TextPool;
  private htext: Record<Face, TextPool>;
  /** Text on the backpack screen, above its dimmer. */
  private utext!: Record<Face, TextPool>;
  private fx: ViewFx[] = [];
  private quips: Quip[] = [];
  private drips: Drip[] = [];
  private puddles: { x: number; y: number; life: number }[] = [];
  private glints: { x: number; y: number; ph: number; len: number }[] = [];
  private time = 0;
  private dripAcc = 0;
  private faceL = false;
  private banner = 3.5;
  private zone = ''; private zoneBanner = 0; private zoneName = '';
  private flash = 0;
  private bellSwing = 0;
  private cam: Vec | null = null;
  private lead: Vec = { x: 0, y: 0 };
  /** Squash-and-stretch springs (0 = rest). */
  private sqB = 0; private sqR = 0; private wasAir = false; private snapFlash = 0; private power = 2;

  constructor(private scene: Phaser.Scene, sim: Sim) {
    const main = scene.cameras.main;
    main.setZoom(ZOOM).setBounds(0, 0, sim.room.def.width, sim.room.def.height).setRoundPixels(false);
    this.hudCam = scene.cameras.add(0, 0, CANVAS_W, CANVAS_H, false, 'hud').setOrigin(0, 0).setZoom(HUD_SCALE);
    const world = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.hudCam.ignore(o); return o; };
    const screen = <T extends Phaser.GameObjects.GameObject>(o: T): T => { main.ignore(o); return o; };

    this.bg = world(scene.add.image(0, 0, `room_${sim.room.def.id}`).setOrigin(0, 0).setDepth(-1000));
    this.floor = world(scene.add.graphics().setDepth(-500));
    this.line = world(scene.add.graphics().setDepth(5000));
    this.fxg = world(scene.add.graphics().setDepth(5100));
    this.hud = screen(scene.add.graphics().setDepth(9000));
    this.rain = screen(scene.add.graphics().setDepth(8000));
    this.rocco = world(scene.add.sprite(0, 0, 'rocco_idle'));
    this.biscuit = world(scene.add.sprite(0, 0, 'biscuit_idle'));
    this.setOrigin(this.rocco, 'rocco_idle'); this.setOrigin(this.biscuit, 'biscuit_idle');
    this.wtext = new TextPool(scene, 'display', 5200, t => world(t), ZOOM);
    this.htext = {
      display: new TextPool(scene, 'display', 9100, t => screen(t), HUD_SCALE),
      mono: new TextPool(scene, 'mono', 9100, t => screen(t), HUD_SCALE),
      body: new TextPool(scene, 'body', 9100, t => screen(t), HUD_SCALE),
    };
    this.utext = {
      display: new TextPool(scene, 'display', 9500, t => screen(t), HUD_SCALE),
      mono: new TextPool(scene, 'mono', 9500, t => screen(t), HUD_SCALE),
      body: new TextPool(scene, 'body', 9500, t => screen(t), HUD_SCALE),
    };
    this.worldIgnore = world;
    this.atmo = new Atmosphere(scene, world);
    this.buildPackUi(screen);

    this.setRoom(sim);
  }

  private bg: Phaser.GameObjects.Image;
  atmo: Atmosphere;
  private trees: Phaser.GameObjects.Sprite[] = [];
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
    this.cam = null; this.banner = 3.5; this.drips = []; this.puddles = []; this.zone = ''; this.zoneBanner = 0;
    this.atmo.setRoom(def);
    for (const t of this.trees) t.destroy();
    this.trees = def.walls.filter(w => (w as { kind?: string }).kind === 'tree').map((w, i) => {
      const t = this.worldIgnore(this.scene.add.sprite(w.x + w.w / 2, w.y + w.h - 4, 'tree', i % 3));
      this.setOrigin(t, 'tree'); t.setDepth(w.y + w.h - 4);
      return t;
    });
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
        this.atmo.flashAt(e.kind, e.x, e.y);
        const cam = this.scene.cameras.main;
        if (e.kind === 'snap') { cam.shake(320, 0.009); this.snapFlash = 1; }
        if (e.kind === 'chomp') { this.sqB = 1; cam.shake(70, 0.0012 * this.power); }
        if (e.kind === 'tear' || e.kind === 'splash') this.sqR = Math.max(this.sqR, e.kind === 'tear' ? 1 : 0.5);
        if (e.kind === 'tear') cam.shake(120, 0.003);
        if (e.kind === 'ring') this.bellSwing = 1;
        if (e.kind === 'faint') this.flash = 1;
        if (e.kind === 'slam') cam.shake(300, 0.008);
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
    this.power = sim.power();
    this.sqB = Math.max(0, this.sqB - dt * 5); this.sqR = Math.max(0, this.sqR - dt * 4); this.snapFlash = Math.max(0, this.snapFlash - dt * 3);
    this.banner -= dt; this.flash = Math.max(0, this.flash - dt * 0.8); this.bellSwing = Math.max(0, this.bellSwing - dt * 0.7);
    this.wtext.begin(); this.beginExtra(); for (const p of [...Object.values(this.htext), ...Object.values(this.utext)]) p.begin();
    if (sim.room.def.id !== this.roomId) this.setRoom(sim);
    const g = this.floor, room = sim.room, def = room.def, pl = sim.player, go = sim.goose, pk = sim.pack;
    g.clear(); this.line.clear(); this.fxg.clear(); this.hud.clear();

    const P = prev ? { x: lerp(prev.px, pl.x, alpha), y: lerp(prev.py, pl.y, alpha) } : { x: pl.x, y: pl.y };
    const G = prev ? { x: lerp(prev.gx, go.x, alpha), y: lerp(prev.gy, go.y, alpha) } : { x: go.x, y: go.y };
    const EP = (e: Enemy): Vec => { const o = prev?.enemies.get(e.id); return o ? { x: lerp(o.x, e.x, alpha), y: lerp(o.y, e.y, alpha) } : e; };

    // camera: follow Rocco, leaning a little toward Biscuit, eased
    // look ahead where Rocco is heading and a little toward the aim, so there is room to see what's coming
    this.lead.x += (Math.max(-70, Math.min(70, pl.vx * 0.45)) - this.lead.x) * Math.min(1, dt * 2.5);
    this.lead.y += (Math.max(-45, Math.min(45, pl.vy * 0.35)) - this.lead.y) * Math.min(1, dt * 2.5);
    const want = { x: P.x + (G.x - P.x) * 0.2 + (aim.x - P.x) * 0.08 + this.lead.x, y: P.y - 18 + (G.y - P.y) * 0.2 + (aim.y - P.y) * 0.08 + this.lead.y };
    if (!this.cam) this.cam = { ...want };
    const k = 1 - Math.exp(-dt * 5);
    this.cam.x += (want.x - this.cam.x) * k; this.cam.y += (want.y - this.cam.y) * k;
    this.scene.cameras.main.centerOn(this.cam.x, this.cam.y);
    this.atmo.draw(sim, P, EP, dt, time);
    // walking into another part of a big area names it
    const z = def.zones?.find(q => P.x >= q.x && P.x < q.x + q.w && P.y >= q.y && P.y < q.y + q.h);
    if (z && z.name !== this.zone) {
      if (this.zone && z.name !== def.name) { this.zoneBanner = 2.6; this.zoneName = z.name; }
      this.zone = z.name;
    }
    this.zoneBanner = Math.max(0, this.zoneBanner - dt);

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
    // rain puddles: dark water that slows Rocco, pocked by drops
    for (const q of sim.puddles) {
      if (q.r < 2) continue;
      g.fillStyle(0x0e2230, 0.75); g.fillEllipse(q.x, q.y, q.r * 2, q.r * 1.25);
      g.fillStyle(0x2c5560, 0.6); g.fillEllipse(q.x - q.r * 0.2, q.y - q.r * 0.15, q.r * 1.1, q.r * 0.5);
      if (sim.storming) for (let k2 = 0; k2 < 2; k2++) {
        const t2 = (time * 1.7 + q.x * 0.013 + k2 * 0.5) % 1, ox = Math.sin(q.x + k2 * 7 + Math.floor(time * 1.7)) * q.r * 0.6;
        g.lineStyle(1, 0x9ae0ff, 0.6 * (1 - t2)); g.strokeEllipse(q.x + ox, q.y, 3 + t2 * 10, 1.5 + t2 * 5);
      }
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
    // sewing kits (a little tin with a needle) and twine spools: the finds that keep Bimbo alive
    (def.kits ?? []).forEach((k2, i) => {
      if (sim.kitsGot[i]) return;
      const x = k2.x, y = Math.round(k2.y + Math.sin(time * 3 + k2.x) * 1.5), glow = 0.25 + 0.15 * Math.sin(time * 4);
      g.fillStyle(0xff8aa8, glow); g.fillCircle(x, y, 13);
      g.fillStyle(0x000000, 0.3); g.fillEllipse(k2.x + 1, k2.y + 8, 20, 6);
      g.fillStyle(0x1a1522, 1); g.fillRect(x - 9, y - 6, 18, 12);
      g.fillStyle(0xc05a6a, 1); g.fillRect(x - 8, y - 5, 16, 10);
      g.fillStyle(0xe88aa0, 1); g.fillRect(x - 8, y - 5, 16, 3);
      g.fillStyle(0xf6f1e6, 1); g.fillRect(x - 3, y - 1, 6, 1); g.fillRect(x - 1, y - 3, 1, 5);   // stitch cross
      g.lineStyle(1, 0xd8dce4, 1); g.lineBetween(x + 6, y - 10, x + 11, y - 2);                  // needle
      g.fillStyle(0xd8dce4, 1); g.fillRect(x + 6, y - 11, 2, 2);
      if (sim.pack.holes > 0) this.wt('Sewing kit', x, y - 18, 7, '#ff8aa8', 0.7 + 0.3 * Math.sin(time * 6), 'mono');
    });
    (def.spools ?? []).forEach((k2, i) => {
      if (sim.spoolsGot[i]) return;
      const x = k2.x, y = Math.round(k2.y + Math.sin(time * 3 + k2.y) * 1.5);
      g.fillStyle(0x000000, 0.3); g.fillEllipse(k2.x + 1, k2.y + 7, 16, 5);
      g.fillStyle(0x1a1522, 1); g.fillRect(x - 6, y - 7, 12, 14);
      g.fillStyle(0x86582f, 1); g.fillRect(x - 5, y - 6, 10, 2); g.fillRect(x - 5, y + 4, 10, 2);
      g.fillStyle(0xd9c08a, 1); g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle(0xb09460, 1); for (let yy2 = y - 3; yy2 < y + 4; yy2 += 2) g.fillRect(x - 4, yy2, 8, 1);
    });
    // bramble bushes (chew through with Biscuit), rain barrels, mushroom rings
    (def.bushes ?? []).forEach((b, i) => {
      if (!room.bushAlive[i]) { g.fillStyle(0x2a1a14, 0.7); g.fillEllipse(b.x, b.y + 6, b.r * 1.6, b.r * 0.6); return; }
      g.fillStyle(0x000000, 0.35); g.fillEllipse(b.x + 3, b.y + b.r * 0.7, b.r * 2.2, b.r * 0.8);
      g.fillStyle(0x0e180e, 1); g.fillCircle(b.x, b.y, b.r + 1);
      g.fillStyle(0x1e3020, 1); g.fillCircle(b.x, b.y, b.r);
      for (let k2 = 0; k2 < 9; k2++) {
        const a = k2 * 0.7 + b.x, rr = b.r * (0.3 + (k2 % 3) * 0.22);
        g.fillStyle(k2 % 2 ? 0x2c4a2e : 0x442030, 1); g.fillCircle(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr * 0.8, 5);
      }
      for (let k2 = 0; k2 < 12; k2++) { const a = k2 * 0.52; g.fillStyle(0xd8c8b8, 1); g.fillRect(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r * 0.85, 1, 2); }
      if (Math.hypot(sim.player.x - b.x, sim.player.y - b.y) < 160) this.wt('Fling Biscuit to chew through', b.x, b.y - b.r - 10, 6, '#c8e0a0', 0.75, 'mono');
    });
    (def.barrels ?? []).forEach((b, i) => {
      const left = sim.barrelWater[i] ?? 0;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(b.x + 2, b.y + 12, 26, 8);
      g.fillStyle(0x1a1522, 1); g.fillRect(b.x - 11, b.y - 16, 22, 28);
      g.fillStyle(0x6a4a2c, 1); g.fillRect(b.x - 10, b.y - 15, 20, 26);
      g.fillStyle(0x86603a, 1); g.fillRect(b.x - 10, b.y - 15, 4, 26);
      g.fillStyle(0x3a3a46, 1); g.fillRect(b.x - 11, b.y - 9, 22, 2); g.fillRect(b.x - 11, b.y + 5, 22, 2);
      g.fillStyle(0x1a1522, 1); g.fillEllipse(b.x, b.y - 15, 20, 7);
      g.fillStyle(left > 0 ? 0x2f7fb0 : 0x2a2219, 1); g.fillEllipse(b.x, b.y - 15, 17, 5);
      if (left > 0) { g.fillStyle(0x9ae0ff, 0.8); g.fillRect(b.x - 4, b.y - 16, 4, 1); }
      g.fillStyle(0x1a1522, 0.9); g.fillRect(b.x + 12, b.y - 14, 3, 24);          // gauge
      g.fillStyle(0x4ab0e0, 1); g.fillRect(b.x + 12, b.y + 10 - 24 * (left / 0.6), 3, 24 * (left / 0.6));
      if (left > 0 && sim.pack.water < 0.9 && Math.hypot(sim.player.x - b.x, sim.player.y - b.y) < 140) this.wt('Rain barrel', b.x, b.y - 26, 7, '#9ae0ff', 0.8, 'mono');
    });
    (def.shrooms ?? []).forEach((m, i) => {
      const ready = sim.shroomCd[i] ? 0.35 : 1;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + i);
      g.fillStyle(0x9affc8, 0.08 + 0.1 * pulse * ready); g.fillCircle(m.x, m.y, 40);
      for (let k2 = 0; k2 < 7; k2++) {
        const a = k2 * 0.9 + i, rr = 10 + (k2 % 3) * 7, x = m.x + Math.cos(a) * rr, y = m.y + Math.sin(a) * rr * 0.6;
        g.fillStyle(0xe8e0d0, 1); g.fillRect(x - 1, y - 2, 2, 5);
        g.fillStyle(k2 % 2 ? 0x8a6aff : 0x5ad8a8, ready); g.fillEllipse(x, y - 3, 8, 5);
        g.fillStyle(0xffffff, 0.7 * ready); g.fillRect(x - 2, y - 4, 1, 1);
      }
      if (ready === 1 && Math.hypot(sim.player.x - m.x, sim.player.y - m.y) < 220) this.wt('Honk for sleep spores', m.x, m.y - 26, 6, '#9affc8', 0.7, 'mono');
    });
    // Golden Feathers: hidden, glinting
    const feather = (gfx: Phaser.GameObjects.Graphics, x: number, y: number) => {
      gfx.fillStyle(0x1a1522, 1); gfx.fillTriangle(x - 4, y + 7, x, y - 9, x + 4, y + 7);
      gfx.fillStyle(0xffd860, 1); gfx.fillTriangle(x - 3, y + 6, x, y - 8, x + 3, y + 6);
      gfx.fillStyle(0xfff4c0, 1); gfx.fillRect(x, y - 6, 1, 12);
    };
    (def.feathers ?? []).forEach((k2, i) => {
      if (sim.feathersGot[i]) return;
      const y = Math.round(k2.y + Math.sin(time * 2.5 + k2.x) * 2);
      g.fillStyle(0xffd860, 0.18 + 0.1 * Math.sin(time * 5)); g.fillCircle(k2.x, y, 12);
      feather(g, k2.x, y);
      if (Math.floor(time * 3 + k2.x) % 4 === 0) { g.fillStyle(0xffffff, 1); g.fillRect(k2.x + 5, y - 9, 1, 3); g.fillRect(k2.x + 4, y - 8, 3, 1); }
    });
    // Biscuit's shrine: a mossy stone with a golden feather floating over it
    const sh = def.shrine;
    if (sh) {
      g.fillStyle(0x000000, 0.35); g.fillEllipse(sh.x + 2, sh.y + 12, 40, 10);
      g.fillStyle(0x1a1522, 1); g.fillRect(sh.x - 15, sh.y - 14, 30, 26);
      g.fillStyle(0x565666, 1); g.fillRect(sh.x - 14, sh.y - 13, 28, 24);
      g.fillStyle(0x7a7a8c, 1); g.fillRect(sh.x - 14, sh.y - 13, 28, 5);
      g.fillStyle(0x4c7454, 1); g.fillRect(sh.x - 14, sh.y - 13, 10, 3); g.fillRect(sh.x + 6, sh.y + 6, 8, 3);
      g.fillStyle(0xf6f1e6, 0.85); g.fillEllipse(sh.x - 2, sh.y + 2, 12, 8); g.fillRect(sh.x + 2, sh.y - 6, 3, 8); g.fillCircle(sh.x + 4, sh.y - 7, 2.5);   // goose carving
      g.fillStyle(0xf08a24, 0.9); g.fillRect(sh.x + 6, sh.y - 8, 3, 2);
      const fy = sh.y - 30 + Math.round(Math.sin(time * 2) * 3);
      g.fillStyle(0xffd860, 0.2 + 0.12 * Math.sin(time * 3)); g.fillCircle(sh.x, fy, 14);
      feather(g, sh.x, fy);
      this.wt("Biscuit's Shrine", sh.x, sh.y - 48, 7, '#ffd860', 0.75 + 0.25 * Math.sin(time * 2), 'mono');
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
    if (this.wasAir && !pl.air) this.sqR = 1;           // landing from a yank
    this.wasAir = pl.air;
    const sr = Math.sin(this.sqR * Math.PI) * 0.18;
    this.rocco.setScale(1 + sr, pl.air ? 1.08 : 1 - sr);
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
    const sb = Math.sin(this.sqB * Math.PI) * 0.22, stretch = go.state === 'flying' ? 0.1 : 0;
    this.biscuit.setScale(1 + sb + stretch, 1 - sb - stretch * 0.6);
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

    for (const t of this.trees) {
      const behind = P.y < t.y && P.y > t.y - 120 && Math.abs(P.x - t.x) < 40;
      t.setAlpha(behind ? 0.45 : 1);
    }
    // ---- enemies
    const alive = new Set<number>();
    for (const e of sim.enemies) {
      if (e.dead) continue;
      alive.add(e.id);
      let s = this.foes.get(e.id);
      if (!s) { s = this.worldIgnore(this.scene.add.sprite(0, 0, ({ snapper: 'snapper', heron: 'heron', squirrel: 'squirrel', badger: 'badger', king: 'king' } as Record<string, string>)[e.kind] ?? 'frog')); this.foes.set(e.id, s); }
      const { x, y } = EP(e);
      const awake = e.woke > 0 || (e.stun > 0 && e.kind !== 'snapper');
      const kind = e.kind === 'heron' ? (e.woke > 0 ? 'heron_awake' : 'heron')
        : e.kind === 'snapper' ? (e.woke > 0 ? 'snapper_awake' : 'snapper') : awake ? 'frog_awake' : 'frog';
      const blink = ((time * 1.1 + e.id * 0.37) % 3.2) < 0.14;
      if (e.kind === 'squirrel' || e.kind === 'badger' || e.kind === 'king') {
        this.drawWoodsCritter(sim, e, s, x, y, time);
        continue;
      }
      if (e.kind === 'heron') {
        const flying = e.air > 0 && !e.woke;
        const pecking = e.mode === 'grounded' && e.hit && e.attack === 'peck';
        const pose = e.woke > 0 ? (blink ? 1 : 0) : flying ? (Math.floor(time * 10) % 2 ? 4 : 2) : e.mode === 'spear' ? 3 : e.mode === 'gust' ? 4
          : pecking ? (e.grip2 < 0.35 ? 2 : 3) : e.mode === 'wind' ? (e.attack === 'gust' ? 4 : 2) : blink ? 1 : 0;
        this.show(s, kind, pose);
        s.setPosition(Math.round(x), Math.round(y + 8 - e.air)).setDepth(flying ? y + 2000 : y).setFlipX(sim.player.x < x).setAlpha(1)
          .setScale(1 + e.air / 600);
        if (flying) {
          // his shadow on the ground, and the landing mark hunting Bimbo
          g.fillStyle(0x000000, 0.25 + 0.15 * (1 - e.air / 120)); g.fillEllipse(x, y + 8, 50 - e.air * 0.15, 12 - e.air * 0.04);
          if (e.mode === 'fly' || e.mode === 'slam') {
            const k = Math.min(1, e.modeT / 1.2), r = 40 - k * 18;
            g.lineStyle(3, 0xff4a4a, 0.5 + 0.4 * Math.sin(time * 16)); g.strokeEllipse(e.tx, e.ty, r * 2.2, r * 1.1);
            g.lineStyle(1, 0xff4a4a, 0.6); g.lineBetween(e.tx - r, e.ty, e.tx + r, e.ty); g.lineBetween(e.tx, e.ty - r * 0.5, e.tx, e.ty + r * 0.5);
            this.wt('!', e.tx, e.ty - 30, 14, '#ff4a4a', 1);
          }
        }
        if (pecking && e.grip2 < 0.35) {
          g.lineStyle(2, 0xff4a4a, 0.5 + e.grip2); const l = Math.hypot(e.tx - x, e.ty - y) || 1;
          g.lineBetween(x, y - 4, x + ((e.tx - x) / l) * 100, y - 4 + ((e.ty - y) / l) * 100);
          this.wt('!', x, y - 100, 14, '#ff4a4a', 1);
        }
        const tell2 = e.mode === 'wind' && Math.floor(e.modeT * 14) % 2 === 0 && !e.woke;
        if (e.hitT > 0 || tell2) s.setTint(e.hitT > 0 ? 0xffffff : 0xffd0d0).setTintMode(Phaser.TintModes.FILL); else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        if (!flying) {
          g.fillStyle(0x000000, 0.35); g.fillEllipse(x, y + 8, 40, 9);
          if (sim.room.inPit(x, y, 2)) { g.lineStyle(1, 0x9ae0ff, 0.5); g.strokeEllipse(x, y + 8, 46 + Math.sin(time * 3) * 4, 10); }   // ripples round his legs
        }
        if (e.stun > 0) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; this.fxg.fillStyle(0xf2c230, 1); this.star(this.fxg, x + Math.cos(a) * 18, y - 84 + Math.sin(a) * 3, 3); }
        if (!e.woke && e.stun <= 0 && !flying) this.drawAttack(e, x, y, time);
        if (e.woke > 0 && e.woke < 6) this.wt('The Ferryman', x, y - 96, 9, '#9ae0ff', Math.min(1, 6 - e.woke));
        continue;
      }
      this.show(s, kind, blink ? 1 : 0);
      const sc = e.falling ? Math.max(0.05, 1 - e.falling / 0.6) : 1;
      const moving = e.woke > 0 || Math.hypot(e.vx, e.vy) > 15;
      let hop = e.kind !== 'snapper' && moving ? -Math.abs(Math.sin(time * 9 + e.id)) * 4 : 0;
      if (e.mode === 'leap') hop = -Math.sin(Math.min(1, e.modeT / 0.34) * Math.PI) * 16;     // arcs through the air
      if (e.mode === 'swim') {                     // low in the water, paddling, with a ripple
        hop = 6 + Math.round(Math.sin(time * 6 + e.id) * 1.5);
        g.lineStyle(1, 0x9ae0ff, 0.6); g.strokeEllipse(x, y + 6, e.heavy ? 50 : 24 + Math.sin(time * 5) * 3, e.heavy ? 12 : 7);
      }
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
      const tell = e.mode === 'wind' && Math.floor(e.modeT * 18) % 2 === 0;
      if (e.hitT > 0 || tell) s.setTint(e.hitT > 0 ? 0xffffff : 0xffe0e0).setTintMode(Phaser.TintModes.FILL); else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      s.setScale(sc, e.kind === 'snapper' && e.mode === 'wind' ? sc * (1 + Math.min(1, e.modeT / 0.5) * 0.18) : sc);   // Snapper rears up
      if (!e.falling && !e.woke && e.stun <= 0) this.drawAttack(e, x, y, time);
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
      if (f.kind === 'faint') this.wt('Bimbo fainted…', f.x, f.y - 10 - kk * 6, 9, '#9ae0ff', Math.min(1, 2 - kk * 1.25), 'body');
    }

    // feather darts: a red mark where each will land, the feather arcing down onto it
    for (const d of sim.darts) {
      const kind = d.kind ?? 'feather', u = Math.min(1, d.t / d.T), r = (kind === 'acorn' ? 4 : 6) + u * (kind === 'acorn' ? 6 : 10);
      this.floor.lineStyle(2, 0xff4a4a, 0.3 + 0.6 * u); this.floor.strokeEllipse(d.tx, d.ty, r * 2.2, r * 1.1);
      this.floor.fillStyle(0xff4a4a, 0.15 * u); this.floor.fillEllipse(d.tx, d.ty, r * 2.2, r * 1.1);
      const fx2 = d.x0 + (d.tx - d.x0) * u, fy2 = d.y0 + (d.ty - d.y0) * u - Math.sin(u * Math.PI) * (kind === 'acorn' ? 50 : 90);
      if (kind === 'feather') { f2.lineStyle(2, 0xe8eef2, 1); f2.lineBetween(fx2 - 3, fy2 - 6, fx2 + 3, fy2 + 6); f2.fillStyle(0x7890aa, 1); f2.fillRect(fx2 - 2, fy2 - 6, 3, 6); }
      else if (kind === 'acorn') { f2.fillStyle(0x1a1522, 1); f2.fillEllipse(fx2, fy2, 7, 8); f2.fillStyle(0x8a5a2a, 1); f2.fillEllipse(fx2, fy2 + 1, 5, 5); f2.fillStyle(0x5e3e20, 1); f2.fillRect(fx2 - 3, fy2 - 3, 6, 2); }
      else { f2.fillStyle(0x1a1522, 1); f2.fillCircle(fx2, fy2, 6); f2.fillStyle(0x6a6458, 1); f2.fillCircle(fx2, fy2, 5); f2.fillStyle(0x8a8474, 1); f2.fillCircle(fx2 - 1.5, fy2 - 1.5, 2); }
    }
    for (const fx3 of this.fx) {
      const kk = fx3.t / 0.8;
      if (fx3.kind === 'dust' || fx3.kind === 'thud') for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + kk, rr = 6 + kk * (fx3.kind === 'dust' ? 40 : 18);
        f2.fillStyle(0x7a6040, 0.7 * (1 - kk)); f2.fillCircle(fx3.x + Math.cos(a) * rr, fx3.y + Math.sin(a) * rr * 0.5, 3 * (1 - kk) + 1);
      }
      if (fx3.kind === 'spores') for (let i = 0; i < 18; i++) {
        const a = i * 0.35 + kk * 2, rr = 10 + kk * 110 * ((i % 3) + 1) / 3;
        f2.fillStyle(i % 2 ? 0xc8a0ff : 0x9affc8, 0.7 * (1 - kk)); f2.fillCircle(fx3.x + Math.cos(a) * rr, fx3.y - 10 + Math.sin(a) * rr * 0.6 - kk * 20, 2.5);
      }
      if (fx3.kind === 'bush') for (let i = 0; i < 10; i++) {
        const a = i * 0.63, rr = 8 + kk * 34;
        f2.fillStyle(i % 2 ? 0x24402a : 0x6a3a48, 1 - kk); f2.fillRect(fx3.x + Math.cos(a) * rr, fx3.y + Math.sin(a) * rr * 0.7 - kk * 10, 3, 2);
      }
    }
    for (const fx3 of this.fx) if (fx3.kind === 'slam') {
      const kk = fx3.t / 0.8;
      f2.lineStyle(3, 0xe8eef2, 0.8 * (1 - kk)); f2.strokeEllipse(fx3.x, fx3.y + 6, 30 + kk * 160, 12 + kk * 60);
      f2.lineStyle(2, 0x9ae0ff, 0.6 * (1 - kk)); f2.strokeEllipse(fx3.x, fx3.y + 6, 20 + kk * 110, 8 + kk * 40);
    }
    for (const fx3 of this.fx) if (fx3.kind === 'gust' && fx3.a !== undefined) {
      const kk = fx3.t / 0.8;
      for (let i = 0; i < 6; i++) {
        const a = fx3.a + (i - 2.5) * 0.18, r0 = 30 + kk * 260 + (i % 2) * 20;
        f2.lineStyle(2, 0xe8eef2, 0.6 * (1 - kk));
        f2.lineBetween(fx3.x + Math.cos(a) * r0, fx3.y - 40 + Math.sin(a) * r0, fx3.x + Math.cos(a) * (r0 + 26), fx3.y - 40 + Math.sin(a) * (r0 + 26));
      }
    }

    // reticle
    if (showReticle && !sim.won && pl.dead <= 0) {
      const held = go.state === 'held', ax = Math.round(aim.x), ay = Math.round(aim.y);
      f2.lineStyle(1, held ? 0xf2c230 : 0xe9e4d6, held ? 0.9 : 0.4);
      f2.strokeCircle(ax, ay, 6); f2.lineBetween(ax - 10, ay, ax - 4, ay); f2.lineBetween(ax + 4, ay, ax + 10, ay); f2.lineBetween(ax, ay - 10, ax, ay - 4); f2.lineBetween(ax, ay + 4, ax, ay + 10);
    }

    this.drawHud(sim);
    this.wtext.end(); this.endExtra(); for (const p of [...Object.values(this.htext), ...Object.values(this.utext)]) p.end();
  }

  // ------------------------------------------------------------------ HUD (screen pixels, 1280x720)
  private drawRain(sim: Sim): void {
    const r = this.rain; r.clear();
    if (!sim.storming) return;
    const t = performance.now() / 1000, cam = this.scene.cameras.main;
    r.fillStyle(0x0a1424, 0.22); r.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // flashes of lightning now and then
    const bolt = Math.sin(t * 0.7) > 0.995 || Math.sin(t * 1.3 + 2) > 0.997;
    if (bolt) { r.fillStyle(0xe8eef2, 0.25); r.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    r.lineStyle(2, 0x9ab8d0, 0.45);
    for (let i = 0; i < 220; i++) {
      const sx = (i * 97.13 + cam.scrollX * ZOOM * 0.3) % SCREEN_W, speed = 900 + (i % 7) * 90;
      const sy = ((i * 53.7 + t * speed) % (SCREEN_H + 60)) - 30;
      const x = (sx + sy * 0.25 + SCREEN_W) % SCREEN_W;
      r.lineBetween(x, sy, x - 5, sy - 22);
    }
    r.fillStyle(0x9ae0ff, 0.5);
    for (let i = 0; i < 26; i++) {             // drops splashing on the ground
      const k = (t * 3 + i * 0.37) % 1, x = (i * 211.7) % SCREEN_W, y = (i * 131.3 + Math.floor(t * 3 + i * 0.37) * 77) % SCREEN_H;
      r.fillRect(x - k * 6, y, 2, 1); r.fillRect(x + k * 6, y, 2, 1);
    }
  }

  private drawHud(sim: Sim): void {
    this.drawRain(sim);
    const g = this.hud, time = this.time, go = sim.goose, pk = sim.pack, W = SCREEN_W, H = SCREEN_H;
    const panel = (x: number, y: number, w: number, h: number) => { g.fillStyle(0x0b0a10, 0.72); g.fillRect(x, y, w, h); g.lineStyle(2, 0x2a2838, 1); g.strokeRect(x, y, w, h); };

    // Bimbo's water: the life bar in world rooms. Hearts only in the gray-box Room 01.
    if (pk.enabled) this.waterHud(sim);
    else {
      panel(16, 16, 300, 52);
      for (let i = 0; i < 5; i++) this.pixelHeart(30 + i * 36, 28, 4, i < sim.player.hp ? 0xe05a47 : 0x2a2838, i < sim.player.hp ? 0xff8a72 : 0x3e3a52);
    }
    this.hudBimbo.setVisible(pk.enabled && !this.packOpen);

    // fury + strain, top centre
    const fx0 = W / 2 - 160, fy = 30;
    panel(fx0 - 14, 12, 348, 92);
    this.ht('mono', go.furious > 0 ? 'FURIOUS' : 'GOOSE FURY', W / 2, fy + 4, 12, go.furious > 0 ? '#e05a47' : '#9aa3a6', 1, 'center', true);
    g.fillStyle(0x1a1522, 1); g.fillRect(fx0, fy + 10, 320, 14);
    const v = go.furious > 0 ? go.furious / sim.furyTime() : go.fury / 100;
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

    // boss health
    const boss = sim.enemies.find(e => (e.kind === 'heron' || e.kind === 'king') && !e.woke);
    if (boss) {
      const bw2 = 520, bx2 = W / 2 - bw2 / 2, by2 = 150, angry = boss.hp < boss.max / 2;
      g.fillStyle(0x0b0a10, 0.8); g.fillRect(bx2 - 12, by2 - 30, bw2 + 24, 52);
      this.ht('display', boss.kind === 'king' ? 'THE BURROW KING' : 'THE HERON FERRYMAN', W / 2, by2 - 8, 16, angry ? '#ff8a8a' : '#e9e4d6');
      g.fillStyle(0x1a1522, 1); g.fillRect(bx2, by2, bw2, 12);
      g.fillStyle(angry ? 0xe05a47 : 0xc94b3a, 1); g.fillRect(bx2 + 2, by2 + 2, (bw2 - 4) * Math.max(0, boss.hp / boss.max), 8);
      g.fillStyle(0xe9e4d6, 0.5); g.fillRect(bx2 + bw2 / 2, by2, 1, 12);
    }

    // room banner
    if (this.banner > 0) {
      const a = Math.min(1, this.banner / 0.8, (3.5 - this.banner) / 0.4);
      this.ht('display', sim.room.def.name.toUpperCase(), W / 2, 200, 44, '#f6f1e6', a);
      if (sim.room.def.subtitle) this.ht('body', sim.room.def.subtitle, W / 2, 234, 18, '#c9a46a', a, 'center', true);
    }
    if (this.zoneBanner > 0 && this.banner <= 0) {
      const a = Math.min(1, this.zoneBanner / 0.6, (2.6 - this.zoneBanner) / 0.4);
      this.ht('display', this.zoneName.toUpperCase(), W / 2, 150, 26, '#e9e4d6', a * 0.9);
      g.fillStyle(0xc9a46a, a * 0.7); g.fillRect(W / 2 - 40, 162, 80, 1);
    }
    if (this.flash > 0) { g.fillStyle(0x05040a, Math.min(0.85, this.flash)); g.fillRect(0, 0, W, H); }
    if (this.snapFlash > 0) { g.fillStyle(0xffffff, this.snapFlash * 0.5); g.fillRect(0, 0, W, H); }
    if (this.packOpen && sim.pack.enabled) this.drawPackUi(sim); else this.showPackUi(false);
    if (sim.won) {
      g.fillStyle(0x0b0a10, 0.78); g.fillRect(0, 0, W, H);
      this.ht('display', 'END OF THE PLAYTEST', W / 2, H / 2 - 30, 52, '#f2c230');
      this.ht('body', sim.room.def.winText ?? 'The path is open.', W / 2, H / 2 + 24, 18, '#e9c9a0', 1, 'center', true);
      this.ht('mono', `${sim.kit.leashDef.name} · ${Object.values(sim.world).filter(m => m.chest).length} chest opened · press R to go back into the room`, W / 2, H / 2 + 56, 13, '#9aa3a6', 1, 'center', true);
    }
  }

  /** Water bar (with a lag chunk showing what a hit just knocked out), leak rate, supplies, Bimbo's face. */
  private waterHud(sim: Sim): void {
    const g = this.hud, pk = sim.pack, time = this.time;
    const dt = Math.max(0, time - this.lagT); this.lagT = time;
    if (pk.water > this.lag) this.lag = pk.water; else this.lag = Math.max(pk.water, this.lag - dt * 0.25);
    const low = pk.water < 0.3, flash = low && Math.floor(time * 5) % 2 === 0;
    g.fillStyle(0x0b0a10, 0.75); g.fillRect(16, 16, 420, 118); g.lineStyle(2, low ? 0x8a3a3a : 0x2a2838, 1); g.strokeRect(16, 16, 420, 118);
    // Bimbo's face reacts to the water
    const mood = pk.water > 0.6 ? 0 : pk.water > 0.3 ? 2 : 4, blink = ((time * 0.9) % 3.4) < 0.12 ? 1 : 0;
    this.hudBimbo.setFrame(mood + blink).setPosition(60, 82 + Math.round(Math.sin(time * 3) * 2)).setScale(1);
    this.ht('display', 'BIMBO', 112, 40, 16, low ? '#ff8a8a' : '#f6f1e6', 1, 'left');
    this.ht('mono', `${Math.ceil(pk.water * 100)}%`, 420, 40, 14, low ? '#ff8a8a' : '#9ae0ff', 1, 'right', true);
    const bx = 110, by = 48, bw = 312, bh = 22;
    g.fillStyle(0x1a1522, 1); g.fillRect(bx, by, bw, bh);
    g.fillStyle(0xf6f1e6, 0.8); g.fillRect(bx + 2, by + 2, (bw - 4) * this.lag, bh - 4);              // just-lost water
    g.fillStyle(low ? (flash ? 0xe05a47 : 0x8a3a3a) : 0x2f7fb0, 1); g.fillRect(bx + 2, by + 2, (bw - 4) * pk.water, bh - 4);
    g.fillStyle(low ? 0xff8a8a : 0x4ab0e0, 1); g.fillRect(bx + 2, by + 2, (bw - 4) * pk.water, 7);
    g.fillStyle(0x9ae0ff, low ? 0 : 0.9); g.fillRect(bx + 2, by + 3, (bw - 4) * pk.water, 2);
    for (let k = 1; k < 10; k++) { g.fillStyle(0x1a1522, 0.6); g.fillRect(bx + 2 + ((bw - 4) * k) / 10, by + 2, 1, bh - 4); }
    // leak rate under the bar
    const leak = sim.leakRate() * 100, secs = pk.water / Math.max(1e-6, sim.leakRate());
    const state = pk.refilling ? 'REFILLING' : low ? 'GASPING! FIND WATER' : pk.holes ? `${pk.holes} TEAR${pk.holes > 1 ? 'S' : ''}` : 'PACK SOUND';
    this.ht('mono', `LEAK −${leak.toFixed(1)}%/s`, bx, by + 42, 13, pk.holes ? '#ff9a7a' : '#9aa3a6', 1, 'left', true);
    this.ht('mono', pk.refilling ? state : `${state} · dry in ${secs >= 600 ? '10m+' : Math.ceil(secs) + 's'}`, bx + 160, by + 42, 12,
      pk.refilling ? '#9ae0ff' : low ? '#ff8a8a' : '#9aa3a6', 1, 'left', true);
    for (let h = 0; h < pk.holes; h++) {                 // a rip mark per tear, dripping
      const x = bx + 132 + h * 6; g.fillStyle(0xe05a47, 1); g.fillRect(x, by + 32, 4, 6);
      if (Math.floor(time * 4 + h) % 2) { g.fillStyle(0x9ae0ff, 1); g.fillRect(x + 1, by + 40, 2, 2); }
    }
    // supplies
    const needleCol = pk.needles ? '#e9e4d6' : '#ff8a8a', twine = sim.kit.mats.fluff;
    this.ht('mono', `NEEDLE ×${pk.needles}`, bx, by + 68, 12, needleCol, 1, 'left', true);
    this.ht('mono', `TWINE ×${twine}`, bx + 104, by + 68, 12, twine ? '#e0c890' : '#ff8a8a', 1, 'left', true);
    const canPatch = pk.holes > 0 && pk.needles > 0 && twine > 0;
    this.ht('mono', canPatch ? '[P] PATCH' : pk.holes && !pk.needles ? 'FIND A SEWING KIT!' : '[I] BACKPACK', bx + 196, by + 68, 12,
      canPatch ? (Math.floor(time * 3) % 2 ? '#f2c230' : '#e9e4d6') : pk.holes && !pk.needles ? '#ff8a8a' : '#9aa3a6', 1, 'left', true);
  }

  // ------------------------------------------------------------------ backpack screen
  packOpen = false;
  private lag = 1;
  private lagT = 0;
  private hudBimbo!: Phaser.GameObjects.Sprite;
  private ui!: { dim: Phaser.GameObjects.Graphics; pack: Phaser.GameObjects.Image; bimbo: Phaser.GameObjects.Sprite;
    patches: Phaser.GameObjects.Sprite[]; tears: Phaser.GameObjects.Sprite[]; water: Phaser.GameObjects.Graphics };

  private buildPackUi(screen: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const sc = this.scene, slots = Object.keys(SPRITES.pack_ui!.points).filter(k => k.startsWith('slot')).length;
    this.hudBimbo = screen(sc.add.sprite(0, 0, 'bimbo').setDepth(9050));
    this.setOrigin(this.hudBimbo, 'bimbo');
    this.ui = {
      dim: screen(sc.add.graphics().setDepth(9400)),
      pack: screen(sc.add.image(0, 0, 'pack_ui').setOrigin(0, 0).setScale(3).setDepth(9410)),
      water: screen(sc.add.graphics().setDepth(9411)),
      patches: Array.from({ length: slots }, (_, i) => screen(sc.add.sprite(0, 0, 'patch', i % 4).setScale(3).setDepth(9412))),
      tears: Array.from({ length: slots }, () => screen(sc.add.sprite(0, 0, 'tear').setScale(3).setDepth(9413))),
      bimbo: screen(sc.add.sprite(0, 0, 'bimbo').setScale(3).setDepth(9420)),
    };
    this.setOrigin(this.ui.bimbo, 'bimbo');
    for (const k of ['patch', 'tear'] as const) for (const s2 of this.ui[k === 'patch' ? 'patches' : 'tears']) this.setOrigin(s2, k);
    this.showPackUi(false);
  }

  private showPackUi(on: boolean): void {
    const u = this.ui;
    for (const o of [u.dim, u.pack, u.water, u.bimbo, ...u.patches, ...u.tears]) o.setVisible(on);
  }

  private drawPackUi(sim: Sim): void {
    // the game is paused while this is open, so animate on the wall clock
    const u = this.ui, pk = sim.pack, time = performance.now() / 1000, P0 = { x: 150, y: 170 }, S3 = 3;
    const pts = SPRITES.pack_ui!.points as unknown as Record<string, number[]>;
    this.showPackUi(true);
    u.dim.clear(); u.dim.fillStyle(0x0b0a10, 0.86); u.dim.fillRect(0, 0, SCREEN_W, SCREEN_H);
    u.dim.fillStyle(0x1b1a26, 1); u.dim.fillRect(110, 90, 1060, 560); u.dim.lineStyle(3, 0x3e3a52, 1); u.dim.strokeRect(110, 90, 1060, 560);
    u.pack.setPosition(P0.x, P0.y);
    // water level in the clear window
    const [wx, wy, ww, wh] = pts.window!;
    const lvl = Math.max(0, Math.min(1, pk.water)), low = lvl < 0.3;
    u.water.clear();
    u.water.fillStyle(low ? 0xc05a5a : 0x2f7fb0, 1);
    u.water.fillRect(P0.x + wx! * S3, P0.y + (wy! + wh! * (1 - lvl)) * S3, ww! * S3, wh! * lvl * S3);
    u.water.fillStyle(0x9ae0ff, 0.9); u.water.fillRect(P0.x + wx! * S3, P0.y + (wy! + wh! * (1 - lvl)) * S3, ww! * S3, 3);
    // patches sewn so far, then the open tears on the next slots
    const slots = u.patches.length;
    u.patches.forEach((s2, i) => {
      const at = pts[`slot${i}`]!;
      s2.setVisible(i < pk.patches).setPosition(P0.x + at[0]! * S3, P0.y + at[1]! * S3);
    });
    u.tears.forEach((s2, i) => {
      const at = pts[`slot${(Math.min(pk.patches, slots) + i) % slots}`]!;
      s2.setVisible(i < pk.holes).setFrame(Math.floor(time * 3 + i) % 2).setPosition(P0.x + at[0]! * S3 + 4, P0.y + at[1]! * S3 + 4);
    });
    const mood = lvl > 0.6 ? 0 : lvl > 0.3 ? 2 : 4, blink = ((time * 0.8) % 3.1) < 0.12 ? 1 : 0;
    const [bx, by] = pts.bimbo!;
    u.bimbo.setFrame(mood + blink).setPosition(P0.x + bx! * S3, P0.y + by! * S3 + Math.round(Math.sin(time * 2.4) * 4) + (low ? 10 : 0))
      .setAngle(Math.sin(time * 1.7) * (low ? 2 : 5));
    // the words
    const X = 620, k = sim.kit;
    this.ut('display', 'BACKPACK', X, 150, 40, '#f6f1e6', 1, 'left');
    const moodText = lvl > 0.6 ? 'Bimbo is happy. Splashy, even.' : lvl > 0.3 ? 'Bimbo is getting thirsty…' : 'Bimbo is GASPING. Water, now!';
    this.ut('body', moodText, X, 186, 20, lvl > 0.3 ? '#9ae0ff' : '#ff8a8a', 1, 'left', true);
    const rows: [string, string, string][] = [
      ['Water', `${Math.ceil(lvl * 100)}%`, low ? '#ff8a8a' : '#9ae0ff'],
      ['Leak rate', `−${(sim.leakRate() * 100).toFixed(1)}% per second`, pk.holes ? '#ff9a7a' : '#9aa3a6'],
      ['Open tears', `${pk.holes}`, pk.holes ? '#ff9a7a' : '#9aa3a6'],
      ['Patches sewn', `${pk.patches}`, '#e0c890'],
      ['Needle uses', `${pk.needles}  (sewing kits give ${C.kitNeedles})`, pk.needles ? '#e9e4d6' : '#ff8a8a'],
      ['Twine', `${k.mats.fluff}  (one per patch)`, k.mats.fluff ? '#e0c890' : '#ff8a8a'],
    ];
    rows.forEach(([a, b, c], i) => {
      this.ut('mono', a.toUpperCase(), X, 236 + i * 30, 13, '#9aa3a6', 1, 'left', true);
      this.ut('mono', b, X + 170, 236 + i * 30, 15, c, 1, 'left', true);
    });
    const sup = (Object.keys(MATERIALS) as ItemId[]).filter(id => id !== 'fluff').map(id => `${ITEMS[id].name} ${k.mats[id]}`).join(' · ');
    const breads = BREADS.filter(b => k.bread[b.id] > 0).map(b => `${b.name} ×${k.bread[b.id]}`).join(' · ') || 'no bread';
    this.ut('mono', 'SUPPLIES', X, 430, 13, '#9aa3a6', 1, 'left', true);
    this.ut('body', sup, X, 458, 15, '#e9e4d6', 1, 'left');
    this.ut('body', breads, X, 482, 15, '#e9c9a0', 1, 'left');
    this.ut('body', `Leash: ${k.leashDef.name}`, X, 506, 15, '#c9a46a', 1, 'left');
    const canPatch = pk.holes > 0 && pk.needles > 0 && k.mats.fluff > 0;
    this.ut('mono', canPatch ? '[P] PATCH A TEAR' : pk.holes ? (pk.needles ? 'NEED TWINE TO PATCH' : 'NEED A SEWING KIT TO PATCH') : 'NO TEARS TO PATCH', X, 570, 15,
      canPatch ? '#f2c230' : pk.holes ? '#ff8a8a' : '#7cc48a', 1, 'left', true);
    this.ut('mono', '[I] / [ESC] CLOSE', X, 600, 12, '#9aa3a6', 1, 'left', true);
  }

  /** Squirrels, badgers and the Burrow King: poses, tunnelling mounds, telegraphs, dazed stars. */
  private drawWoodsCritter(sim: Sim, e: Enemy, s: Phaser.GameObjects.Sprite, x: number, y: number, time: number): void {
    const g = this.floor, f = this.fxg, awake = e.woke > 0, king = e.kind === 'king';
    const strip = `${e.kind}${awake ? '_awake' : ''}`;
    const blink = ((time * 1.1 + e.id * 0.37) % 3.2) < 0.14;
    const under = e.mode === 'tunnel';
    let frame = blink ? 1 : 0;
    if (!awake) {
      if (e.kind === 'squirrel' && e.mode === 'wind') frame = 2;
      if (e.kind === 'badger' && (e.mode === 'wind' || e.mode === 'surface')) frame = 2;
      if (king) frame = e.mode === 'wind' ? (e.attack === 'charge' ? 3 : 2) : e.mode === 'charge' ? 3 : e.mode === 'dazed' ? 4 : frame;
    }
    this.show(s, strip, frame);
    const hop = e.kind === 'squirrel' && Math.hypot(e.vx, e.vy) + (e.mode === 'stalk' ? 30 : 0) > 20 ? -Math.abs(Math.sin(time * 12 + e.id)) * 3 : 0;
    const flip = e.mode === 'charge' ? e.hx < 0 : sim.player.x < x;
    s.setVisible(!under).setPosition(Math.round(x), Math.round(y + hop)).setDepth(y).setFlipX(flip)
      .setAlpha(awake && !king ? Math.min(1, (1.6 - e.woke) / 0.5) : 1);
    const tell = e.mode === 'wind' && Math.floor(e.modeT * 16) % 2 === 0;
    if (e.hitT > 0 || tell) s.setTint(e.hitT > 0 ? 0xffffff : 0xffd0d0).setTintMode(Phaser.TintModes.FILL); else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    if (under) {                                       // a moving mound of earth
      const w = king ? 60 : 34;
      g.fillStyle(0x3a2a1a, 1); g.fillEllipse(x, y, w, w * 0.4);
      g.fillStyle(0x5a4630, 1); g.fillEllipse(x - 2, y - 2, w * 0.7, w * 0.25);
      if (Math.floor(time * 20) % 2) { f.fillStyle(0x7a6040, 0.8); f.fillCircle(x + (Math.random() - 0.5) * w, y - 4, 2); }
      return;
    }
    g.fillStyle(0x000000, 0.35); g.fillEllipse(x, y + 2, king ? 90 : e.kind === 'badger' ? 44 : 18, king ? 18 : 8);
    if (awake) {
      if (king && e.woke < 6) this.wt('The Burrow King', x, y - 84, 9, '#c8e0a0', Math.min(1, 6 - e.woke));
      if (!king) for (let i = 0; i < 2; i++) { const t = (e.woke * 1.3 + i * 0.5) % 1; f.fillStyle(0xff8aa8, 1 - t); f.fillRect(Math.round(x + (i ? 5 : -5)), Math.round(y - 30 - t * 14), 3, 2); }
      return;
    }
    if (e.stun > 0 || e.mode === 'dazed') for (let i = 0; i < 3; i++) {
      const a = time * 5 + i * 2.1, top = king ? 80 : e.kind === 'badger' ? 34 : 28;
      f.fillStyle(0xf2c230, 1); this.star(f, x + Math.cos(a) * (king ? 26 : 12), y - top + Math.sin(a) * 3, king ? 4 : 2.5);
    }
    if (e.mode === 'wind') this.wt('!', x, y - (king ? 92 : e.kind === 'badger' ? 40 : 32), king ? 16 : 11, '#ff4a4a', 1);
    if (e.mode === 'surface') {                        // where he'll burst out
      const k = Math.min(1, e.modeT / (king ? 0.6 : 0.45)), r = (king ? 64 : 46) * (1.1 - k * 0.3);
      g.lineStyle(3, 0xff4a4a, 0.5 + 0.4 * Math.sin(time * 18)); g.strokeEllipse(x, y, r * 2, r);
      g.fillStyle(0x5a4630, 1); g.fillEllipse(x + Math.sin(time * 40) * 2, y, king ? 60 : 34, king ? 22 : 12);
      this.wt('!', x, y - 30, 14, '#ff4a4a', 1);
    }
    if (king && e.mode === 'wind' && e.attack === 'charge') {
      const l = Math.hypot(e.tx - x, e.ty - y) || 1;
      g.lineStyle(4, 0xff4a4a, 0.3 + 0.4 * Math.sin(time * 14)); g.lineBetween(x, y, x + ((e.tx - x) / l) * 420, y + ((e.ty - y) / l) * 420);
    }
    if (king && e.mode === 'charge' && Math.floor(time * 30) % 2 === 0) { g.fillStyle(0x7a6040, 0.6); g.fillCircle(x - e.hx * 30, y + 6, 5); }
    if (!king && e.hp < e.max) { f.fillStyle(0x0b0a10, 1); f.fillRect(x - e.r, y + 6, e.r * 2, 3); f.fillStyle(0xe05a47, 1); f.fillRect(x - e.r, y + 6, e.r * 2 * Math.max(0, e.hp / e.max), 3); }
  }

  /** Telegraphs and strikes: a target marker on the ground while winding up, the tongue, charge dust. */
  private drawAttack(e: Enemy, x: number, y: number, time: number): void {
    const f = this.fxg, g = this.floor;
    if (e.kind === 'heron') {
      if (e.mode === 'wind') {
        this.wt('!', x, y - 100 - Math.round(Math.sin(time * 20)), 16, '#ff4a4a', 1);
        if (e.attack === 'spear') {
          const k = Math.min(1, e.modeT / 0.6), [ux, uy] = [e.tx - x, e.ty - y], l = Math.hypot(ux, uy) || 1;
          g.lineStyle(3, 0xff4a4a, 0.25 + 0.5 * k); g.lineBetween(x, y - 4, x + (ux / l) * 150, y - 4 + (uy / l) * 150);
        }
      } else if (e.mode === 'spear') {
        const l = Math.hypot(e.tx - x, e.ty - y) || 1, k = Math.min(1, e.modeT / 0.08);
        f.lineStyle(4, 0xffd860, 1 - e.modeT / 0.3); f.lineBetween(x, y - 30, x + ((e.tx - x) / l) * 150 * k, y - 4 + ((e.ty - y) / l) * 150 * k);
      }
      return;
    }
    if (e.mode === 'wind') {
      const k = Math.min(1, e.modeT / (e.heavy ? 0.7 : 0.4)), r = 6 + k * 6;
      g.lineStyle(2, 0xff4a4a, 0.4 + 0.5 * k); g.strokeEllipse(e.tx, e.ty + 2, r * 2.2, r * 1.1);
      g.lineStyle(1, 0xff4a4a, 0.6 * k); g.lineBetween(x, y, e.tx, e.ty);
      this.wt('!', x, y - (e.heavy ? 34 : 22) - Math.round(Math.sin(time * 20)), e.heavy ? 14 : 11, '#ff4a4a', 1);
    } else if (e.mode === 'lash') {
      const t = e.modeT / 0.22, out = t < 0.5 ? t * 2 : (1 - t) * 2;
      const ex = x + (e.tx - x) * out, ey = y - 8 + (e.ty - (y - 8)) * out;
      f.lineStyle(3, 0xff7a9a, 1); f.lineBetween(x, y - 8, ex, ey);
      f.fillStyle(0xff4a7a, 1); f.fillCircle(ex, ey, 3);
    } else if (e.mode === 'charge' && Math.floor(time * 30) % 2 === 0) {
      g.fillStyle(0x8a7a60, 0.5); g.fillCircle(x - e.vx * 0.05 + (Math.random() - 0.5) * 10, y + 4, 3 + Math.random() * 3);
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
  private ut(face: Face, s: string, x: number, y: number, size: number, color: string, alpha = 1, align: 'center' | 'left' | 'right' = 'center', bold = false) {
    return this.utext[face].get(s, x, y, size, color, alpha, align, bold);
  }
  private ht(face: Face, s: string, x: number, y: number, size: number, color: string, alpha = 1, align: 'center' | 'left' | 'right' = 'center', bold = false) {
    return this.htext[face].get(s, x, y, size, color, alpha, align, bold);
  }

  /** Called at the start of each frame for the lazily created world pools. */
  beginExtra(): void { for (const p of Object.values(this.worldPools)) p.begin(); }
  endExtra(): void { for (const p of Object.values(this.worldPools)) p.end(); }
}
