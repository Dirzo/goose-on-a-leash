/**
 * The prologue's films, drawn side-on from the layers in art/movie/intro.py (src/assets/movie).
 *
 *  'intro' (~27 s): the night sky and pale moon; Rocco fishing off the dock end, his geese asleep on the
 *     bank; down through the surface past little fish to the glowing Moon Koi nosing the bait; on into the
 *     depths where the Blood Shark glides past and opens one red eye; back up to the moon; the title.
 *  'catch' (~12 s): Rocco reels, the rod bent double; the koi fights up through the water and bursts out,
 *     and the moment it leaves the water the moon turns red. It lands flapping on the dock. The camera
 *     plunges to the depths, where the Blood Shark opens its eye and smiles.
 *
 * Drawn on the HUD layer over everything at 2x (the film is 640 wide, the HUD 1280). Esc skips.
 */
import Phaser from 'phaser';
import { MOVIE } from './assets';
import { FONTS } from './render';

export type MovieKind = 'intro' | 'catch';
const S = 2;                                   // art px -> HUD px
const LENS: Record<MovieKind, number> = { intro: 27, catch: 12 };
type Key = [number, number];
const CAMS: Record<MovieKind, Key[]> = {
  intro: [[0, 0], [2.5, 0], [8, 170], [9, 170], [13.5, 330], [14.5, 330], [19.5, 540], [21, 540], [22.5, 330], [24.5, 40], [27, 40]],
  catch: [[0, 200], [3.4, 200], [4.4, 120], [6.4, 140], [7.6, 545], [12, 545]],
};
const CAPTIONS: Record<MovieKind, [number, number, string][]> = {
  intro: [
    [0.8, 4.2, 'Willowmere Pond. A peaceful night.'],
    [4.6, 8.4, 'Rocco fished here every night, with his geese for company.'],
    [9.8, 13.6, 'Beneath the water swam a legend: the Moon Koi.'],
    [15.2, 20.2, 'And far below, something old was waiting... for the Koi to leave the water.'],
  ],
  catch: [
    [4.8, 7.4, 'The Moon Koi left the water... and the moon turned red.'],
  ],
};
const ease = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
function camAt(keys: Key[], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, y1] = keys[i]!, [t0, y0] = keys[i - 1]!;
    if (t <= t1) return y0 + (y1 - y0) * ease(clamp01((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1]![1];
}

/** Little silhouette fish in the background: [depth y, speed (+right/-left), phase, size, alpha]. */
const SCHOOLS: [number, number, number, number, number][] = [
  [410, 14, 0, 1, 0.5], [438, -10, 200, 0.8, 0.4], [520, 9, 380, 1.2, 0.35], [580, -7, 90, 0.9, 0.3], [470, 18, 520, 0.7, 0.45], [630, 6, 300, 1.3, 0.25],
];

export class Movie {
  t = 0;
  private done = false;
  private len: number;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private img: Record<string, Phaser.GameObjects.Image> = {};
  private rocco: Phaser.GameObjects.Sprite;
  private koi: Phaser.GameObjects.Sprite;
  private shark: Phaser.GameObjects.Sprite;
  private back: Phaser.GameObjects.Graphics;    // background fish
  private sky: Phaser.GameObjects.Graphics;     // the red moon and the sky's red cast
  private fx: Phaser.GameObjects.Graphics;      // line, bubbles, bugs, spray
  private glow: Phaser.GameObjects.Graphics;    // additive: koi light, shark eye
  private top: Phaser.GameObjects.Graphics;     // darkness, letterbox, fades
  private cap: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private skipT: Phaser.GameObjects.Text;
  onEnd: () => void = () => {};
  /** Sounds to play, drained by the scene. */
  sounds: string[] = [];
  private cued = new Set<string>();

  constructor(scene: Phaser.Scene, screen: <T extends Phaser.GameObjects.GameObject>(o: T) => T, res: number, readonly kind: MovieKind = 'intro') {
    this.len = LENS[kind];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T, depth: number): T => { (o as unknown as { setDepth(d: number): void }).setDepth(depth); this.objs.push(o); return screen(o); };
    const image = (k: string, d: number) => (this.img[k] = add(scene.add.image(0, 0, `mv_${k}`).setOrigin(0, 0).setScale(S), d));
    add(scene.add.rectangle(0, 0, 1280, 720, 0x03070c).setOrigin(0, 0), 9980);
    image('sky', 9981);
    this.sky = add(scene.add.graphics(), 9981.5);
    image('far', 9982); image('water', 9983);
    this.back = add(scene.add.graphics(), 9983.5);
    this.shark = add(scene.add.sprite(0, 0, 'mv_shark', 0).setOrigin(0, 0).setScale(S), 9984);
    this.glow = add(scene.add.graphics(), 9985); this.glow.setBlendMode(Phaser.BlendModes.ADD);
    this.koi = add(scene.add.sprite(0, 0, 'mv_koi', 0).setOrigin(0.5, 0.5).setScale(S), 9986);
    image('near', 9987);
    this.rocco = add(scene.add.sprite(0, 0, 'mv_rocco', 0).setOrigin(0, 0).setScale(S), 9988);
    this.fx = add(scene.add.graphics(), 9989);
    image('weeds', 9990);
    this.top = add(scene.add.graphics(), 9991);
    const font = (size: number, color: string, family: string = FONTS.body) => ({ fontFamily: family, fontSize: `${size}px`, color, resolution: res });
    this.cap = add(scene.add.text(640, 690, '', font(22, '#e9e4d6')).setOrigin(0.5), 9995);
    this.title = add(scene.add.text(640, 300, 'GOOSE ON A LEASH', font(76, '#f6f1e6', FONTS.display)).setOrigin(0.5), 9995);
    this.sub = add(scene.add.text(640, 372, 'a noobscrub game', font(18, '#c9a46a')).setOrigin(0.5), 9995);
    this.skipT = add(scene.add.text(1260, 24, 'Esc  skip', font(12, '#6a6478', FONTS.mono)).setOrigin(1, 0.5), 9995);
    this.title.setAlpha(0); this.sub.setAlpha(0);
  }

  get active(): boolean { return !this.done; }
  skip(): void { if (!this.done) this.t = this.len; }
  private cue(id: string, at: number, sound: string): void { if (this.t >= at && !this.cued.has(id)) { this.cued.add(id); this.sounds.push(sound); } }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t >= this.len) { this.finish(); return; }
    const t = this.t, kind = this.kind;
    const cy = camAt(CAMS[kind], t) + (kind === 'catch' && t > 3.6 && t < 4.3 ? Math.sin(t * 90) * 3 : 0);   // the jolt as it breaks the surface
    const at = (layer: string, k = 1) => this.img[layer]!.setPosition(0, -cy * k * S);
    at('sky', 0.55); at('far', 0.8); at('water'); at('near');
    this.img.weeds!.setPosition(Math.sin(t * 0.7) * 3 * S, -cy * 1.08 * S);
    const Y = (y: number) => (y - cy) * S;                                   // art y -> screen y
    const surf = MOVIE.surface, [rx, ry] = MOVIE.rocco.at;
    const f = this.fx, g = this.glow, bk = this.back, sk = this.sky, tp = this.top;
    f.clear(); g.clear(); bk.clear(); sk.clear(); tp.clear();

    this.drawSchools(bk, t, Y);
    this.drawBugs(f, t, Y);

    let red = 0;                                                             // 0..1 the moon has turned
    let koiX = -100, koiY = 0, koiRot = 0, koiFace = 1, koiOn = true;
    let sharkX = 0, sharkY = 0, sharkFrame = 0, sharkScale = S, sharkA = 0.4, eye = 0;
    let tip = { x: rx + MOVIE.rocco.rodTip[0], y: ry + MOVIE.rocco.rodTip[1] };
    let line: 'slack' | 'taut' | 'none' = 'slack';
    const hook = { x: 286, y: 470 + Math.sin(t * 1.3) * 2 };

    if (kind === 'intro') {
      const twitch = t > 11.5 && t < 13 && Math.sin(t * 9) > 0.6;
      this.rocco.setFrame(twitch ? 2 : Math.floor(t * 1.2) % 2);
      // the koi drifts in from the left to the bait, then circles it
      const kxAt = (tt: number) => { const u = clamp01((tt - 8.6) / 4); return -40 + (hook.x - 30 + 40) * ease(u) + (u >= 1 ? Math.cos((tt - 12.6) * 1.1) * 26 : 0); };
      koiX = kxAt(t); koiY = 470 + Math.sin(t * 1.6) * 6 + (t > 12.6 ? Math.sin((t - 12.6) * 1.1) * 10 : 0);
      if (t > 18.5 && t < 21.5) koiX += Math.sin((t - 18.5) * 18) * 3;   // it senses the thing below
      koiFace = kxAt(t + 0.05) >= kxAt(t) ? 1 : -1;
      sharkX = 520 - (t - 13) * 18; sharkY = 650 + Math.sin(t * 0.6) * 6;
      eye = clamp01((t - 16.2) / 0.8); sharkA = 0.35 + 0.35 * eye;
      const flush = t > 23.6 && t < 25.6 ? Math.sin(((t - 23.6) / 2) * Math.PI) * 0.6 : 0;
      red = flush;
      const ta = t > 24.2 ? clamp01((t - 24.2) / 0.8) * (1 - clamp01((t - (this.len - 1.4)) / 1.4)) : 0;
      this.title.setAlpha(ta); this.sub.setAlpha(ta * 0.9);
      this.cue('eye', 16.2, 'growl');
    } else {
      // reeling: the rod pumps; the koi fights up through the water toward the dock
      const reeling = t < 3.6;
      this.rocco.setFrame(reeling ? (Math.floor(t * 4) % 2 ? 3 : 0) : t < 5.2 ? 0 : Math.floor(t * 1.2) % 2);
      if (reeling) { tip = { x: rx + MOVIE.rocco.reelTip[0], y: ry + MOVIE.rocco.reelTip[1] }; line = 'taut'; }
      else line = 'none';
      if (t < 3.6) {
        const u = t / 3.6;
        koiX = 250 + Math.sin(t * 7) * 22 * (1 - u) + u * 40; koiY = 540 - ease(u) * 180; koiRot = Math.sin(t * 12) * 0.4;
        koiFace = Math.cos(t * 7) > 0 ? 1 : -1;
      } else if (t < 5) {
        const u = (t - 3.6) / 1.4;                                            // the leap: out, up and over onto the dock
        koiX = 290 + u * 100; koiY = surf - Math.sin(u * Math.PI) * 120 + u * (330 - surf); koiRot = u * Math.PI * 2.2; koiFace = 1;
      } else {
        const hop = Math.abs(Math.sin((t - 5) * 9)) * Math.max(0, 1 - (t - 5) / 2) * 10;   // flapping on the planks
        koiX = 392; koiY = 328 - hop; koiRot = Math.sin(t * 14) * 0.3; koiFace = 1;
      }
      red = clamp01((t - 3.6) / 0.6);
      sharkFrame = t > 9.4 ? 2 : Math.floor(t * 1.4) % 2;
      const push = clamp01((t - 7.6) / 4);
      sharkScale = S * (1.25 + push * 0.25);
      sharkX = 300 - push * 70 - 80; sharkY = 598 - push * 14;
      eye = clamp01((t - 8.4) / 0.6); sharkA = 0.45 + 0.5 * clamp01((t - 7.6) / 1.5);
      if (t > 3.6 && t < 4.2) {                                               // spray where it broke the surface
        for (let i = 0; i < 16; i++) { const a = -Math.PI * (i / 15), r = (t - 3.6) * 160; f.fillStyle(0xcfefff, 1 - (t - 3.6) / 0.6); f.fillRect((290 + Math.cos(a) * r * 0.6) * S, Y(surf + Math.sin(a) * r * 0.5), 3, 3); }
      }
      this.cue('splash', 3.6, 'splash'); this.cue('moon', 3.7, 'wake'); this.cue('eye', 8.4, 'growl'); this.cue('grin', 9.4, 'hiss');
      this.title.setAlpha(0); this.sub.setAlpha(0);
    }
    this.rocco.setPosition(rx * S, Y(ry));

    // ---- the koi
    this.koi.setVisible(koiOn).setFrame(Math.floor(t * (kind === 'catch' && t < 3.6 ? 18 : 8)) % 6)
      .setPosition(koiX * S, Y(koiY)).setFlipX(koiFace > 0).setRotation(koiRot);
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    for (let r = 5; r >= 1; r--) { g.fillStyle(0xbfe8ff, 0.05 * pulse); g.fillCircle(koiX * S, Y(koiY), r * 12); }

    // ---- the line
    if (line !== 'none') {
      const end = kind === 'catch' ? { x: koiX + 18 * -koiFace * -1, y: koiY } : hook;
      const entry = { x: (tip.x + end.x) / 2 + (line === 'taut' ? 0 : 6), y: surf };
      if (line === 'taut') { f.lineStyle(1, 0xf2f6f8, 0.9); f.lineBetween(tip.x * S, Y(tip.y), end.x * S, Y(end.y)); }
      else {
        f.lineStyle(1, 0xd8ecf4, 0.7); f.lineBetween(tip.x * S, Y(tip.y), (hook.x + 6) * S, Y(surf));
        f.lineStyle(1, 0xd8ecf4, 0.35); f.lineBetween((hook.x + 6) * S, Y(surf), hook.x * S, Y(hook.y));
        f.fillStyle(0xe05a47, 1); f.fillRect((hook.x + 4) * S, Y(surf) - 4, 4, 4);
        f.fillStyle(0xc8a060, 1); f.fillRect(hook.x * S - 2, Y(hook.y) - 2, 4, 4);
        for (let i = 0; i < 3; i++) { const r = ((t * 0.6 + i / 3) % 1); f.lineStyle(1, 0x9ad0e0, (1 - r) * 0.6); f.strokeEllipse((hook.x + 6) * S, Y(surf) + 2, (6 + r * 30) * S, (2 + r * 6) * S); }
      }
      void entry;
    }
    for (let i = 0; i < 14; i++) {                                           // bubbles rising
      const bx = (i * 47) % 640, cyc = (t * (10 + (i % 4) * 4) + i * 37) % 480, by = 840 - cyc;
      if (by > surf + 4) { f.fillStyle(0x9ad0e0, 0.35); f.fillCircle(bx * S + Math.sin(t * 2 + i) * 4, Y(by), 1.5 + (i % 3)); }
    }

    // ---- the Blood Shark
    this.shark.setFrame(sharkFrame).setScale(sharkScale).setPosition(sharkX * S, Y(sharkY)).setAlpha(sharkA);
    if (eye > 0) {
      const k = sharkScale / S;
      const ex = (sharkX + MOVIE.shark.eye[0] * k) * S, ey = Y(sharkY + MOVIE.shark.eye[1] * k);
      for (let r = 5; r >= 1; r--) { g.fillStyle(0xff2020, 0.07 * eye * (0.8 + 0.2 * Math.sin(t * 5))); g.fillCircle(ex, ey, r * 9 * k); }
      const narrow = sharkFrame === 2 ? 0.45 : 1;                            // it narrows as it smiles
      g.fillStyle(0xff5040, eye); g.fillRect(ex - 4 * k, ey - 2 * eye * narrow * k, 8 * k, 4 * eye * narrow * k);
    }

    // ---- the moon turning red
    if (red > 0) {
      const [mx, my, mr] = MOVIE.moon, sy = (my - cy * 0.55) * S;
      sk.fillStyle(0x7a0c10, 0.28 * red); sk.fillRect(0, 0, 1280, Math.max(0, Y(surf)));
      for (let r = 4; r >= 1; r--) { sk.fillStyle(0xd02020, 0.12 * red); sk.fillCircle(mx * S, sy, (mr + r * 12) * S); }
      sk.fillStyle(0xb81818, 0.85 * red); sk.fillCircle(mx * S, sy, mr * S);
      sk.fillStyle(0xe03030, 0.6 * red); sk.fillCircle(mx * S - 10, sy - 10, mr * S * 0.8);
      if (kind === 'catch' && t > 3.6 && t < 4.1) { tp.fillStyle(0xffd0c0, 0.5 * (1 - (t - 3.6) / 0.5)); tp.fillRect(0, 0, 1280, 720); }
    }

    // ---- darkness of the depths, letterbox, fades
    const deep = clamp01((cy - 250) / 290);
    if (deep > 0) { tp.fillStyle(0x020408, 0.45 * deep); tp.fillRect(0, 0, 1280, 720); }
    const redDeep = kind === 'intro' ? (t > 15 && t < 22 ? Math.min(1, (t - 15) / 2, (22 - t) / 1.5) : 0) : clamp01((t - 7) / 2);
    if (redDeep > 0) { tp.fillStyle(0x500808, 0.2 * redDeep); tp.fillRect(0, 440, 1280, 280); }
    tp.fillStyle(0x03050a, 1); tp.fillRect(0, 0, 1280, 64); tp.fillRect(0, 656, 1280, 64);
    const fadeIn = kind === 'intro' ? Math.max(0, 1 - t / 2.2) : Math.max(0, 1 - t / 0.6);
    const fadeOut = clamp01((t - (this.len - 1.4)) / 1.4);
    const fade = Math.max(fadeIn, fadeOut);
    if (fade > 0) { tp.fillStyle(0x000000, fade); tp.fillRect(0, 0, 1280, 720); }

    const c = CAPTIONS[kind].find(([a, b]) => t >= a && t <= b);
    if (c) this.cap.setText(c[2]).setAlpha(Math.min(1, (t - c[0]) / 0.6, (c[1] - t) / 0.6)); else this.cap.setAlpha(0);
    this.skipT.setAlpha(t < this.len - 2 ? 0.8 : 0);
  }

  /** Little dark fish drifting in schools at different depths. */
  private drawSchools(g: Phaser.GameObjects.Graphics, t: number, Y: (y: number) => number): void {
    for (const [depth, sp, ph, size, a] of SCHOOLS) {
      const span = 760, base = ((ph + t * sp) % span + span) % span - 60;
      for (let i = 0; i < 6; i++) {
        const x = base + (i % 3) * 14 * size + Math.sin(t * 1.3 + i) * 3, y = depth + Math.floor(i / 3) * 8 * size + Math.sin(t * 0.9 + i * 1.7) * 3;
        const dir = sp > 0 ? 1 : -1, sx = x * S, sy = Y(y), L = 7 * size * S;
        g.fillStyle(0x0a2230, a); g.fillEllipse(sx, sy, L, L * 0.38);
        g.fillTriangle(sx - dir * L * 0.45, sy, sx - dir * L * 0.8, sy - L * 0.25, sx - dir * L * 0.8, sy + L * 0.25);
      }
    }
  }

  /** Bugs: fireflies over the bank, gnat clouds over the water, moths round Rocco, dragonflies darting. */
  private drawBugs(f: Phaser.GameObjects.Graphics, t: number, Y: (y: number) => number): void {
    for (let i = 0; i < 16; i++) {                                           // fireflies
      const x = 60 + ((i * 97) % 560) + Math.sin(t * 0.7 + i) * 14, y = 250 + ((i * 53) % 90) + Math.cos(t * 0.5 + i * 1.3) * 8;
      const a = Math.max(0, Math.sin(t * 1.8 + i * 2.1));
      f.fillStyle(0xd8ff8a, a); f.fillRect(x * S, Y(y), 2, 2);
      if (a > 0.6) { f.fillStyle(0xd8ff8a, (a - 0.6) * 0.4); f.fillCircle(x * S, Y(y), 6); }
    }
    for (const [cx, cy] of [[120, 330], [250, 322], [470, 318]] as [number, number][]) {   // gnat clouds
      for (let i = 0; i < 12; i++) {
        const x = cx + Math.sin(t * 7 + i * 2.3) * 9 + Math.sin(t * 1.3 + i) * 4, y = cy + Math.cos(t * 6 + i * 1.7) * 6;
        f.fillStyle(0xc8c8b8, 0.7); f.fillRect(x * S, Y(y), 1, 1);
      }
    }
    for (let i = 0; i < 3; i++) {                                            // moths round Rocco's hat
      const [rx, ry] = MOVIE.rocco.at;
      const x = rx + 44 + Math.sin(t * 2.1 + i * 2) * 22, y = ry + 6 + Math.cos(t * 2.9 + i) * 12, flap = Math.sin(t * 30 + i) > 0;
      f.fillStyle(0xe8e0c8, 0.85); f.fillRect(x * S - (flap ? 3 : 1), Y(y), flap ? 6 : 2, 2); f.fillRect(x * S, Y(y) - 1, 1, 3);
    }
    for (let i = 0; i < 2; i++) {                                            // dragonflies: dart, hover, dart
      const seg = Math.floor(t / 1.6 + i * 0.5), u = ease(clamp01(((t / 1.6 + i * 0.5) % 1) * 2.5));
      const p0 = { x: 80 + ((seg * 137 + i * 211) % 420), y: 300 + ((seg * 61 + i * 37) % 40) };
      const p1 = { x: 80 + (((seg + 1) * 137 + i * 211) % 420), y: 300 + (((seg + 1) * 61 + i * 37) % 40) };
      const x = p0.x + (p1.x - p0.x) * u, y = p0.y + (p1.y - p0.y) * u, wing = Math.sin(t * 50 + i) > 0 ? 4 : 2;
      f.fillStyle(0x6ad0c8, 1); f.fillRect(x * S - 5, Y(y), 10, 2);
      f.fillStyle(0xd8f0ff, 0.55); f.fillRect(x * S - 2, Y(y) - wing, 4, wing); f.fillRect(x * S - 2, Y(y) + 2, 4, wing);
    }
  }

  private finish(): void {
    this.done = true;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.onEnd();
  }
}
