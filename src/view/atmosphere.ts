/**
 * Atmosphere: the Death's Door pass. A multiplied lightmap (the world sits in cool moonlit dark and real
 * light comes from things: Bimbo's glow in the pack, lanterns, springs, spore rings, the red eyes of
 * entranced critters), an additive bloom layer over the brightest sources, two drifting fog layers,
 * floating motes (dust, fireflies, falling leaves), lightning in storms, and a graded, vignetted camera.
 *
 * Everything here is view-only: it reads the sim and never writes to it.
 */
import Phaser from 'phaser';
import type { Enemy, Sim } from '../core/sim';
import type { Vec } from '../core/math';
import type { RoomDef } from '../data/rooms';

const LM = 4;                         // lightmap texels per world pixel (1/LM resolution: soft and cheap)
type Biome = 'pond' | 'marsh' | 'woods' | 'wharf' | 'tide';

interface Look { ambient: number; fog: number; fogA: number; motes: 'fireflies' | 'leaves'; dust: number }
const LOOKS: Record<Biome, Look> = {
  pond: { ambient: 0xccc2e4, fog: 0xb0a0c8, fogA: 0.16, motes: 'fireflies', dust: 0xd8d0ff },
  marsh: { ambient: 0xc6d4e2, fog: 0xa8c0c8, fogA: 0.2, motes: 'fireflies', dust: 0xd0e8e0 },
  woods: { ambient: 0xcad6da, fog: 0x98b0a8, fogA: 0.14, motes: 'leaves', dust: 0xe0f0c8 },
  tide: { ambient: 0xb8c8e8, fog: 0x98b8d0, fogA: 0.18, motes: 'fireflies', dust: 0xd0f0ff },   // cave damp, moonlit cove
  wharf: { ambient: 0xc2d2e8, fog: 0xa8c4d8, fogA: 0.22, motes: 'fireflies', dust: 0xe0f4ff },   // sea mist, salt spray
};
const STORM_AMBIENT = 0x8a98b0;

/** `a` lifts the dark (multiplied); `bloom` is a tight additive core; `wash` an additive coloured pool. */
interface Light { x: number; y: number; r: number; c: number; a: number; bloom?: number; wash?: number }
interface Mote { x: number; y: number; vx: number; vy: number; ph: number; kind: 'dust' | 'fly' | 'leaf'; c: number }

/** Eye height above the feet, for the glowing red eyes of entranced critters. */
const EYES: Record<string, [number, number]> = {
  frog: [12, 0.8], crab: [12, 0.8], eel: [30, 0.9], gull: [22, 0.8], gullbeard: [58, 1.4], snapper: [14, 1], heron: [62, 1.3], squirrel: [16, 0.7], badger: [18, 1], king: [46, 1.8], knight: [22, 1],
};

export function biomeOf(def: RoomDef): Biome {
  if (def.biome) return def.biome;
  return def.id.startsWith('reedmarsh') ? 'marsh' : 'pond';
}

export class Atmosphere {
  private lm: Phaser.GameObjects.RenderTexture;
  private bloom: Phaser.GameObjects.RenderTexture;
  private fogA: Phaser.GameObjects.TileSprite;
  private fogB: Phaser.GameObjects.TileSprite;
  private motesG: Phaser.GameObjects.Graphics;
  private motes: Mote[] = [];
  private beams: { x: number; w: number; ph: number }[] = [];
  private look: Look = LOOKS.marsh;
  private lightning = 0;
  private nextBolt = 4;
  private honks: { x: number; y: number; t: number; c: number; r: number }[] = [];
  enabled = true;
  /** 0..1: the night before the blood moon (the prologue fades it out). */
  calm = 0;
  private cm!: Phaser.Filters.ColorMatrix;
  private vig!: Phaser.Filters.Vignette;
  private gradeKey = '';
  /** A hit just landed on the pack: the edges flash red and fade. */
  hurtFlash = 0;

  /**
   * The world closes in as Bimbo dries out: the colour drains, the edges darken and pull in, and they pulse
   * with the heartbeat. A hit flashes them red.
   */
  grade(water: number, time: number, dt: number, focus?: Vec): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    const dry = water < 0.35 ? (0.35 - water) / 0.35 : 0;
    const beat = dry > 0 ? Math.pow(Math.max(0, Math.sin(time * (4 + dry * 4))), 8) * dry : 0;
    // the vignette centres on Rocco (tunnel vision when he's in trouble), not on the screen
    if (focus) {
      const v = this.scene.cameras.main.worldView;
      const tx = Math.min(0.8, Math.max(0.2, (focus.x - v.x) / v.width)), ty = Math.min(0.8, Math.max(0.2, (focus.y - v.y) / v.height));
      this.vig.x += (tx - this.vig.x) * Math.min(1, dt * 4); this.vig.y += (ty - this.vig.y) * Math.min(1, dt * 4);
    }
    this.vig.radius = 0.9 - dry * 0.22 - beat * 0.05 - this.hurtFlash * 0.12;
    this.vig.strength = 0.36 + dry * 0.4 + this.hurtFlash * 0.35;
    const r = Math.round(7 + this.hurtFlash * 120 + dry * 10), gcol = 5, b2 = 12;
    this.vig.color.setTo(r, gcol, b2);
    const key = `${Math.round(dry * 20)}`;
    if (key !== this.gradeKey) { this.gradeKey = key; this.cm.colorMatrix.reset().contrast(0.08 + dry * 0.1).saturate(-0.06 - dry * 0.55, true); }
  }
  /** Dark out-of-focus silhouettes close to the camera (parallax > 1): reeds, branches, leaves. */
  private fg: Phaser.GameObjects.Image[] = [];
  private world: <T extends Phaser.GameObjects.GameObject>(o: T) => T;

  constructor(private scene: Phaser.Scene, world: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    makeTextures(scene);
    this.world = world;
    this.fogA = world(scene.add.tileSprite(0, 0, 16, 16, 'atmo_fog').setOrigin(0, 0).setDepth(-400));   // ground fog: under the characters
    this.fogB = world(scene.add.tileSprite(0, 0, 16, 16, 'atmo_fog').setOrigin(0, 0).setDepth(-399).setTileScale(2.2, 1.6));
    this.lm = world(scene.add.renderTexture(0, 0, 16, 16).setOrigin(0, 0).setDepth(4900).setScale(LM).setBlendMode(Phaser.BlendModes.MULTIPLY));
    this.bloom = world(scene.add.renderTexture(0, 0, 16, 16).setOrigin(0, 0).setDepth(4950).setScale(LM).setBlendMode(Phaser.BlendModes.ADD));
    this.lm.setRenderMode('all'); this.bloom.setRenderMode('all');
    this.motesG = world(scene.add.graphics().setDepth(4960));
    for (const o of [this.lm, this.bloom]) o.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const k of ['atmo_light', 'atmo_glow', 'atmo_fog', 'atmo_beam', 'fg_reeds', 'fg_leaves', 'fg_branch']) scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);

    // grade the world camera: a touch more contrast, a little less saturation, dark edges
    const cam = scene.cameras.main;
    this.cm = cam.filters.external.addColorMatrix();
    this.cm.colorMatrix.contrast(0.08).saturate(-0.06, true);
    this.vig = cam.filters.external.addVignette(0.5, 0.5, 0.9, 0.36, 0x07050c);
  }

  setRoom(def: RoomDef): void {
    const b = biomeOf(def);
    this.look = LOOKS[b];
    const w = Math.ceil(def.width / LM), h = Math.ceil(def.height / LM);
    this.lm.resize(w, h); this.bloom.resize(w, h);
    for (const f of [this.fogA, this.fogB]) f.setSize(def.width, def.height).setTint(this.look.fog);
    this.fogA.setAlpha(this.look.fogA); this.fogB.setAlpha(this.look.fogA * 0.7);
    // motes are scattered over the whole room; cheap enough at these counts
    const area = def.width * def.height / 1e5;
    this.motes = [];
    const rnd = (a: number, b2: number) => a + Math.random() * (b2 - a);
    for (let i = 0; i < Math.round(area * 4); i++) this.motes.push({ x: rnd(0, def.width), y: rnd(0, def.height), vx: rnd(-3, 3), vy: rnd(-6, -2), ph: rnd(0, 6.3), kind: 'dust', c: this.look.dust });
    const n = Math.round(area * (this.look.motes === 'leaves' ? 1.6 : 2.2));
    for (let i = 0; i < n; i++) {
      this.motes.push(this.look.motes === 'leaves'
        ? { x: rnd(0, def.width), y: rnd(0, def.height), vx: rnd(4, 10), vy: rnd(10, 18), ph: rnd(0, 6.3), kind: 'leaf', c: [0xb86a2a, 0x8a4a22, 0xc89a3a, 0x6a7a3a][i % 4]! }
        : { x: rnd(0, def.width), y: rnd(0, def.height), vx: 0, vy: 0, ph: rnd(0, 6.3), kind: 'fly', c: i % 3 ? 0xd8ff8a : 0xffe08a });
    }
    this.honks = [];
    this.placeForeground(def, b);
    // a few slanted shafts of moonlight through the canopy, drifting slowly
    const nb = Math.max(2, Math.round(def.width / 380));
    this.beams = Array.from({ length: nb }, (_, i) => ({ x: (i + 0.3 + Math.random() * 0.4) * def.width / nb, w: 50 + Math.random() * 70, ph: Math.random() * 6.3 }));
  }

  private placeForeground(def: RoomDef, b: Biome): void {
    for (const o of this.fg) o.destroy();
    this.fg = [];
    const cam = this.scene.cameras.main, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    let seed = def.width * 7 + def.height; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const keys = b === 'woods' ? ['fg_branch', 'fg_leaves'] : b === 'wharf' || b === 'tide' ? ['fg_reeds'] : b === 'marsh' ? ['fg_reeds', 'fg_reeds', 'fg_leaves'] : ['fg_reeds', 'fg_leaves'];
    const S = 1.3;   // scroll factor: nearer the camera than the world
    const add = (X: number, Y: number, flipY: boolean) => {
      const k = keys[Math.floor(rnd() * keys.length)]!;
      // where the camera will be when it looks at (X, Y), so the silhouette shows up there
      const sx = Math.min(Math.max(X - vw / 2, 0), Math.max(0, def.width - vw)), sy = Math.min(Math.max(Y - vh / 2, 0), Math.max(0, def.height - vh));
      const o = this.world(this.scene.add.image(X + (S - 1) * sx, Y + (S - 1) * sy, k))
        .setScrollFactor(S).setDepth(6000).setTint(0x06080c).setAlpha(0.94)
        .setScale((0.8 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1), (0.8 + rnd() * 0.5) * (flipY ? -1 : 1))
        .setOrigin(0.5, flipY ? 0 : 1);
      this.fg.push(o);
    };
    for (let x = 60 + rnd() * 200; x < def.width; x += 260 + rnd() * 360) add(x, def.height + 30, false);       // along the bottom
    if (b !== 'marsh') for (let x = 160 + rnd() * 300; x < def.width; x += 420 + rnd() * 420) add(x, -20, true);  // hanging in at the top
  }

  /** A burst of light from an event (honk, splash, slam...). */
  flashAt(kind: string, x: number, y: number): void {
    const m: Record<string, [number, number]> = { honk: [0xfff0c8, 150], chomp: [0xffe0b0, 60], splash: [0x8ad8ff, 70], slam: [0xffd8a0, 120],
      spores: [0x9affc8, 160], ring: [0xffe070, 140], wake: [0xffb8d0, 110], pick: [0xfff0b0, 70], patch: [0xffc8d8, 60], chest: [0xffe080, 150], snap: [0xffffff, 200], parry: [0xfff0c0, 110], block: [0xfff0c0, 50] };
    const v = m[kind];
    if (v) this.honks.push({ x, y, t: 0, c: v[0], r: v[1] });
  }

  draw(sim: Sim, P: Vec, EP: (e: Enemy) => Vec, dt: number, time: number): void {
    const def = sim.room.def, room = sim.room, cam = this.scene.cameras.main;
    const vis = [this.lm, this.bloom, this.fogA, this.fogB, this.motesG, ...this.fg];
    for (const o of vis) o.setVisible(this.enabled);
    if (!this.enabled) return;

    // ---- foreground silhouettes fade when Rocco is behind one
    for (const o of this.fg) {
      const sx = cam.scrollX * (o.scrollFactorX - 1), sy = cam.scrollY * (o.scrollFactorY - 1);
      const ax = o.x - sx, ay = o.y - sy, w = Math.abs(o.displayWidth) / 2, h = Math.abs(o.displayHeight);
      const top = o.scaleY < 0 ? ay : ay - h, under = P.x > ax - w && P.x < ax + w && P.y > top - 10 && P.y < top + h + 10;
      o.setAlpha(Phaser.Math.Linear(o.alpha, under ? 0.35 : 0.94, Math.min(1, dt * 6)));
    }

    // ---- fog drifts
    this.fogA.tilePositionX = time * 6; this.fogA.tilePositionY = Math.sin(time * 0.05) * 20;
    this.fogB.tilePositionX = -time * 3.5; this.fogB.tilePositionY = time * 1.2;

    // ---- storm lightning
    let ambient = sim.storming ? STORM_AMBIENT : this.look.ambient;
    if (this.calm > 0) ambient = mix(ambient, 0xc4d4f0, this.calm);     // before the moon turns: a pale, quiet night
    if (sim.storming) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.lightning = 1; this.nextBolt = 5 + Math.random() * 7; }
    }
    if (this.lightning > 0) {
      const k = this.lightning > 0.7 || (this.lightning > 0.4 && this.lightning < 0.5) ? 0.75 : 0.15;
      ambient = mix(ambient, 0xdde8ff, k);
      this.lightning = Math.max(0, this.lightning - dt * 2.2);
    }

    // ---- collect lights
    const L: Light[] = [];
    const flick = (s: number) => 0.92 + 0.05 * Math.sin(time * 9 + s) + 0.03 * Math.sin(time * 23 + s * 3);
    // Rocco is always readable: a soft personal light, and Bimbo's moon glow from the pack
    L.push({ x: P.x, y: P.y - 14, r: 170, c: 0xe8dcc8, a: 0.55 });
    if (sim.pack.enabled && !sim.player.dead) {
      const bp = sim.packPoint(10), bx = P.x + (bp.x - sim.player.x), by = P.y + (bp.y - sim.player.y) - 22;
      const w = sim.pack.water, pulse = 0.9 + 0.1 * Math.sin(time * 2.4);
      L.push({ x: bx, y: by, r: 60 + 60 * w, c: 0x8ad8ff, a: (0.2 + 0.3 * w) * pulse });
      L.push({ x: bx, y: by + 4, r: 14 + 6 * w, c: 0x9ae8ff, a: 0, bloom: 0.5 * w * pulse });   // the glow through the pack's mesh
    }
    (def.lanterns ?? (def.lantern ? [def.lantern] : [])).forEach((ln, i) => L.push({ x: ln.x, y: ln.y - 20, r: 210, c: 0xffa04a, a: 1.0 * flick(1 + i), bloom: 0.55, wash: 0.28 * flick(2 + i) }));
    for (const r of def.refills ?? []) L.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.max(r.w, r.h) * 0.85, c: 0x4a9ad8, a: sim.storming ? 0.25 : 0.45, wash: 0.07 });
    (def.barrels ?? []).forEach((b, i) => { if ((sim.barrelWater[i] ?? 0) > 0) L.push({ x: b.x, y: b.y - 12, r: 46, c: 0x4a9ad8, a: 0.35 }); });
    (def.shrooms ?? []).forEach((m, i) => {
      const ready = sim.shroomCd[i] ? 0.35 : 1;
      L.push({ x: m.x, y: m.y, r: 120, c: i % 2 ? 0x9a7aff : 0x5ae0a8, a: (0.5 + 0.2 * Math.sin(time * 2.2 + i)) * ready, bloom: 0.3 * ready, wash: 0.16 * ready });
    });
    if (def.bell && room.gateClosed) L.push({ x: def.bell.x, y: def.bell.y, r: 60, c: 0xffc850, a: 0.5, bloom: 0.2 });
    if (def.chest && !sim.chestOpen()) L.push({ x: def.chest.x, y: def.chest.y - 6, r: 70, c: 0xffd070, a: 0.55, bloom: 0.15 });
    (def.kits ?? []).forEach((k, i) => { if (!sim.kitsGot[i]) L.push({ x: k.x, y: k.y, r: 55, c: 0xff8aa8, a: 0.55, bloom: 0.2, wash: 0.1 }); });
    (def.spools ?? []).forEach((k, i) => { if (!sim.spoolsGot[i]) L.push({ x: k.x, y: k.y, r: 40, c: 0xffd0a0, a: 0.4 }); });
    (def.feathers ?? []).forEach((k, i) => { if (!sim.feathersGot[i]) L.push({ x: k.x, y: k.y, r: 60, c: 0xffd860, a: 0.6, bloom: 0.3 }); });
    if (def.ferry) L.push({ x: def.ferry.x + 14, y: def.ferry.y - 38, r: 110, c: 0xffc060, a: sim.ferryReady() && sim.kit.ferries.has(def.id) ? 0.8 : 0.2, bloom: 0.3, wash: 0.12 });
    (def.nests ?? []).forEach((n, i) => { if (!sim.nestsDown[i] && n.drop === 'feather') L.push({ x: n.x, y: n.y, r: 34, c: 0xffd860, a: 0.3, bloom: 0.15 }); });
    if (def.shrine) L.push({ x: def.shrine.x, y: def.shrine.y - 16, r: 120, c: 0xffe090, a: 0.7, bloom: 0.3, wash: 0.14 });
    // grapple posts are always findable; rock pillars and islands catch the moon
    for (const p of def.posts) L.push({ x: p.x, y: p.y - 10, r: 56, c: 0xf0d8a8, a: 0.55, bloom: 0.12 });
    for (const b of def.bridges ?? []) {
      const kind = (b as { kind?: string }).kind ?? 'dock';
      if (kind === 'pillar' || kind === 'island') L.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) * 0.8, c: 0xb8d0f0, a: 0.5 });
    }
    for (const d of def.doors ?? []) {
      if (d.gated && room.gateClosed) continue;
      L.push({ x: d.x + d.w / 2, y: d.y + d.h / 2, r: 90, c: 0xb8e8c0, a: 0.4 });
    }
    for (const e of sim.enemies) {
      if (e.falling || (e as { air?: number }).air! > 30 || e.mode === 'tunnel') continue;
      const p = EP(e), eye = EYES[e.kind] ?? [14, 1];
      if (e.woke > 0) { L.push({ x: p.x, y: p.y - eye[0], r: 40 * eye[1], c: 0xffb8d0, a: 0.25 }); continue; }
      const wind = e.mode === 'wind' ? 1.6 : 1;
      L.push({ x: p.x, y: p.y - eye[0], r: 34 * eye[1] * wind, c: 0xff3a3a, a: 0.55, bloom: 0.45 * wind });
    }
    for (const h of this.honks) {
      h.t += dt;
      const k = 1 - h.t / 0.45;
      if (k > 0) L.push({ x: h.x, y: h.y, r: h.r * (0.7 + 0.3 * (1 - k)), c: h.c, a: k * 0.9, bloom: k * 0.4 });
    }
    this.honks = this.honks.filter(h => h.t < 0.45);
    for (const m of this.motes) if (m.kind === 'fly') {
      const blink = Math.max(0, Math.sin(time * 1.7 + m.ph * 3));
      if (blink > 0.2) L.push({ x: m.x, y: m.y, r: 22, c: m.c, a: blink * 0.5, bloom: blink * 0.35 });
    }

    // ---- lightmap: ambient, plus each light added on top (only those near the view)
    const v = cam.worldView, pad = 220;
    const near = (l: Light) => l.x > v.x - pad && l.x < v.right + pad && l.y > v.y - pad && l.y < v.bottom + pad;
    this.lm.clear().fill(ambient, 1);
    this.bloom.clear();
    for (const l of L) {
      if (!near(l)) continue;
      this.lm.stamp('atmo_light', undefined, l.x / LM, l.y / LM, { scale: (l.r * 2) / LM / 128, tint: l.c, alpha: Math.min(1, l.a), blendMode: Phaser.BlendModes.ADD });
      if (l.wash) this.bloom.stamp('atmo_light', undefined, l.x / LM, l.y / LM, { scale: (l.r * 1.7) / LM / 128, tint: l.c, alpha: Math.min(1, l.wash), blendMode: Phaser.BlendModes.ADD });
      if (l.bloom) this.bloom.stamp('atmo_glow', undefined, l.x / LM, l.y / LM, { scale: (l.r * 1.1) / LM / 64, tint: l.c, alpha: Math.min(1, l.bloom), blendMode: Phaser.BlendModes.ADD });
    }

    // ---- moon shafts: long soft slanted bands, added on top
    if (!sim.storming) for (const b of this.beams) {
      const a = 0.07 + 0.04 * Math.sin(time * 0.35 + b.ph), x = b.x + Math.sin(time * 0.05 + b.ph) * 30;
      this.lm.stamp('atmo_beam', undefined, x / LM, def.height / 2 / LM, { scaleX: b.w / LM / 32, scaleY: (def.height * 1.5) / LM / 128, rotation: 0.42, tint: 0xc8d8ff, alpha: a * 2.2, blendMode: Phaser.BlendModes.ADD });
    }

    // ---- motes
    const g = this.motesG; g.clear();
    const W = def.width, H = def.height;
    for (const m of this.motes) {
      if (m.kind === 'dust') {
        m.x += (m.vx + Math.sin(time * 0.6 + m.ph) * 4) * dt; m.y += m.vy * dt;
      } else if (m.kind === 'fly') {
        m.x += Math.sin(time * 0.7 + m.ph) * 14 * dt + Math.cos(time * 1.9 + m.ph * 2) * 6 * dt;
        m.y += Math.cos(time * 0.5 + m.ph * 1.3) * 10 * dt;
      } else {
        m.x += (m.vx + Math.sin(time * 1.5 + m.ph) * 16) * dt; m.y += m.vy * dt;
      }
      if (m.y < -10) m.y = H + 10; if (m.y > H + 10) m.y = -10;
      if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
      if (m.x < v.x - 10 || m.x > v.right + 10 || m.y < v.y - 10 || m.y > v.bottom + 10) continue;
      if (m.kind === 'dust') {
        g.fillStyle(m.c, 0.18 + 0.18 * Math.sin(time * 1.3 + m.ph)); g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
      } else if (m.kind === 'fly') {
        const blink = Math.max(0, Math.sin(time * 1.7 + m.ph * 3));
        if (blink > 0.1) { g.fillStyle(m.c, blink); g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1); }
      } else {
        const flip = Math.sin(time * 3 + m.ph) > 0;
        g.fillStyle(m.c, 0.85); g.fillRect(Math.round(m.x), Math.round(m.y), flip ? 2 : 1, flip ? 1 : 2);
      }
    }
  }
}

function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const A = ch(a), B = ch(b);
  return A.map((x, i) => Math.round(x + (B[i]! - x) * k)).reduce((s, x) => (s << 8) | x, 0);
}

/** Soft radial light, a tighter bloom core, and a tileable fog noise, made once. */
function makeTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (!tx.exists('atmo_light')) {
    const c = tx.createCanvas('atmo_light', 128, 128)!, ctx = c.getContext();
    const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (let i = 0; i <= 10; i++) { const u = i / 10, a = Math.pow(1 - u, 1.8); gr.addColorStop(u, `rgba(255,255,255,${a.toFixed(3)})`); }
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128); c.refresh();
  }
  if (!tx.exists('atmo_glow')) {
    const c = tx.createCanvas('atmo_glow', 64, 64)!, ctx = c.getContext();
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (let i = 0; i <= 10; i++) { const u = i / 10, a = Math.pow(1 - u, 3); gr.addColorStop(u, `rgba(255,255,255,${a.toFixed(3)})`); }
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64); c.refresh();
  }
  const sil = (key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, r: () => number) => void) => {
    if (tx.exists(key)) return;
    const c = tx.createCanvas(key, w, h)!, ctx = c.getContext();
    let sd = key.length * 977; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    ctx.filter = 'blur(1.5px)'; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
    paint(ctx, r); c.refresh();
  };
  sil('fg_reeds', 180, 220, (ctx, r) => {
    for (let i = 0; i < 26; i++) {
      const x = 20 + r() * 140, hgt = 90 + r() * 120, lean = (r() - 0.5) * 50;
      ctx.lineWidth = 3 + r() * 4; ctx.beginPath(); ctx.moveTo(x, 220); ctx.quadraticCurveTo(x + lean * 0.3, 220 - hgt * 0.6, x + lean, 220 - hgt); ctx.stroke();
      if (r() < 0.3) { ctx.beginPath(); ctx.ellipse(x + lean, 220 - hgt - 10, 5, 16, lean * 0.01, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  sil('fg_leaves', 240, 160, (ctx, r) => {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI, d = r() * 100, x = 120 + Math.cos(a) * d * 1.1, y = 160 - Math.sin(a) * d * 1.2;
      ctx.beginPath(); ctx.ellipse(x, y, 10 + r() * 12, 5 + r() * 6, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  });
  sil('fg_branch', 300, 180, (ctx, r) => {
    ctx.lineCap = 'round';
    const limb = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (depth > 0) for (let k = 0; k < 2; k++) limb(x2, y2, a + (r() - 0.5) * 1.2, len * 0.65, w * 0.6, depth - 1);
      else for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(x2 + (r() - 0.5) * 30, y2 + (r() - 0.5) * 20, 9, 5, r() * 3, 0, Math.PI * 2); ctx.fill(); }
    };
    limb(150, 180, Math.PI / 2 + (r() - 0.5) * 0.6, 70, 14, 3);
  });
  if (!tx.exists('atmo_beam')) {
    const c = tx.createCanvas('atmo_beam', 32, 128)!, ctx = c.getContext();
    for (let y = 0; y < 128; y++) {
      const v = Math.sin((y / 127) * Math.PI);                    // fades out at both ends
      const gr = ctx.createLinearGradient(0, 0, 32, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${(v * v).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, y, 32, 1);
    }
    c.refresh();
  }
  if (!tx.exists('atmo_fog')) {
    const S = 256, c = tx.createCanvas('atmo_fog', S, S)!, ctx = c.getContext();
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 50, a = 0.05 + rnd() * 0.12;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r * 1.6);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r * 1.6, r, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    c.refresh();
  }
}
