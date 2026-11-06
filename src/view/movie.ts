/**
 * The opening film (about 26 seconds), played on a fresh game before the prologue. Willowmere Pond
 * side-on: the night sky and the pale moon, Rocco fishing off the end of the dock with his geese
 * asleep on the bank, then down through the surface to the Moon Koi drifting toward the bait, and on
 * into the depths where the Blood Shark opens one red eye. Back up past the koi to the moon, which
 * flushes red for a heartbeat, and the title.
 *
 * Layers and sprites come from art/movie/intro.py (src/assets/movie). Drawn on the HUD layer, over
 * everything, at 2x (the film is 640 wide, the HUD 1280). Esc / click skips.
 */
import Phaser from 'phaser';
import { MOVIE } from './assets';
import { FONTS } from './render';

const S = 2;                                   // art px -> HUD px
const VIEW_H = 360;                            // art px visible at once
const LEN = 27;

/** Camera height (art px from the top) over time: ease between keys. */
const CAM: [number, number][] = [[0, 0], [2.5, 0], [8, 170], [9, 170], [13.5, 330], [14.5, 330], [19.5, 540], [21, 540], [22.5, 330], [24.5, 40], [27, 40]];
const CAPTIONS: [number, number, string][] = [
  [0.8, 4.2, 'Willowmere Pond. A peaceful night.'],
  [4.6, 8.4, 'Rocco fished here every night, with his geese for company.'],
  [9.8, 13.6, 'Beneath the water swam a legend: the Moon Koi.'],
  [15.2, 20.2, 'And far below, something old was waiting... for the Koi to leave the water.'],
];
const ease = (u: number) => u * u * (3 - 2 * u);
function camAt(t: number): number {
  for (let i = 1; i < CAM.length; i++) {
    const [t1, y1] = CAM[i]!, [t0, y0] = CAM[i - 1]!;
    if (t <= t1) return y0 + (y1 - y0) * ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1))));
  }
  return CAM[CAM.length - 1]![1];
}

export class Movie {
  t = 0;
  private done = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private img: Record<string, Phaser.GameObjects.Image> = {};
  private rocco: Phaser.GameObjects.Sprite;
  private koi: Phaser.GameObjects.Sprite;
  private shark: Phaser.GameObjects.Sprite;
  private fx: Phaser.GameObjects.Graphics;      // line, bubbles, fireflies, glows (additive bits drawn here too)
  private glow: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;     // darkness, letterbox, fades
  private cap: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private skipT: Phaser.GameObjects.Text;
  onEnd: () => void = () => {};

  constructor(scene: Phaser.Scene, screen: <T extends Phaser.GameObjects.GameObject>(o: T) => T, res: number) {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T, depth: number): T => { (o as unknown as { setDepth(d: number): void }).setDepth(depth); this.objs.push(o); return screen(o); };
    const image = (k: string, d: number) => (this.img[k] = add(scene.add.image(0, 0, `mv_${k}`).setOrigin(0, 0).setScale(S), d));
    add(scene.add.rectangle(0, 0, 1280, 720, 0x03070c).setOrigin(0, 0), 9980);
    image('sky', 9981); image('far', 9982); image('water', 9983);
    this.shark = add(scene.add.sprite(0, 0, 'mv_shark', 0).setOrigin(0, 0).setScale(S), 9984);
    this.glow = add(scene.add.graphics(), 9985); this.glow.setBlendMode(Phaser.BlendModes.ADD);
    this.koi = add(scene.add.sprite(0, 0, 'mv_koi', 0).setOrigin(0.5, 0.5).setScale(S), 9986);
    image('near', 9987);
    this.rocco = add(scene.add.sprite(0, 0, 'mv_rocco', 0).setOrigin(0, 0).setScale(S), 9988);
    this.fx = add(scene.add.graphics(), 9989);
    image('weeds', 9990);
    this.top = add(scene.add.graphics(), 9991);
    const font = (size: number, color: string, family: string = FONTS.body) => ({ fontFamily: family, fontSize: `${size}px`, color, resolution: res });
    this.cap = add(scene.add.text(640, 642, '', font(22, '#e9e4d6')).setOrigin(0.5), 9995);
    this.title = add(scene.add.text(640, 300, 'GOOSE ON A LEASH', font(76, '#f6f1e6', FONTS.display)).setOrigin(0.5), 9995);
    this.sub = add(scene.add.text(640, 372, 'a noobscrub game', font(18, '#c9a46a')).setOrigin(0.5), 9995);
    this.skipT = add(scene.add.text(1260, 24, 'Esc  skip', font(12, '#6a6478', FONTS.mono)).setOrigin(1, 0.5), 9995);
  }

  get active(): boolean { return !this.done; }

  skip(): void { if (!this.done) { this.t = LEN; } }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    if (t >= LEN) { this.finish(); return; }
    const cy = camAt(t);
    const at = (layer: string, k = 1) => this.img[layer]!.setPosition(0, -cy * k * S);
    at('sky', 0.55); at('far', 0.8); at('water'); at('near');
    this.img.weeds!.setPosition(Math.sin(t * 0.7) * 3 * S, -cy * 1.08 * S);
    const Y = (y: number) => (y - cy) * S;                                    // art y -> screen y
    // Rocco: idle breathing; the rod twitches as the koi noses the bait
    const [rx, ry] = MOVIE.rocco.at;
    const twitch = t > 11.5 && t < 13 && Math.sin(t * 9) > 0.6;
    this.rocco.setFrame(twitch ? 2 : Math.floor(t * 1.2) % 2).setPosition(rx * S, Y(ry));
    const tip = { x: rx + MOVIE.rocco.rodTip[0], y: ry + MOVIE.rocco.rodTip[1] };
    const hook = { x: 286, y: 470 + Math.sin(t * 1.3) * 2 };
    // the Moon Koi drifts in from the left and circles the bait, curious
    const ku = Math.max(0, Math.min(1, (t - 8.6) / 4));
    const kx = -40 + (hook.x - 30 - -40) * ease(ku) + (ku >= 1 ? Math.cos((t - 12.6) * 1.1) * 26 : 0);
    const ky = 470 + Math.sin(t * 1.6) * 6 + (ku >= 1 ? Math.sin((t - 12.6) * 1.1) * 10 : 0);
    const startled = t > 18.5 && t < 21.5;                                    // it senses the thing below
    const kx2 = startled ? kx + Math.sin((t - 18.5) * 18) * 3 : kx;
    this.koi.setFrame(Math.floor(t * (startled ? 16 : 8)) % 6).setPosition(kx2 * S, Y(ky)).setFlipX(ku >= 1 && Math.sin((t - 12.6) * 1.1) < 0);
    // the Blood Shark: barely there, gliding slowly beneath; its eye opens
    const sx = 520 - (t - 13) * 18, syy = 650 + Math.sin(t * 0.6) * 6;
    const eyeOpen = Math.max(0, Math.min(1, (t - 16.2) / 0.8));
    this.shark.setFrame(Math.floor(t * 1.4) % 2).setPosition(sx * S, Y(syy)).setAlpha(0.35 + 0.35 * eyeOpen);

    // ---- line, bubbles, fireflies
    const f = this.fx; f.clear();
    const surf = MOVIE.surface;
    f.lineStyle(1, 0xd8ecf4, 0.7);
    f.lineBetween(tip.x * S, Y(tip.y), (hook.x + 6) * S, Y(surf));
    f.lineStyle(1, 0xd8ecf4, 0.35); f.lineBetween((hook.x + 6) * S, Y(surf), hook.x * S, Y(hook.y));
    f.fillStyle(0xe05a47, 1); f.fillRect((hook.x + 4) * S, Y(surf) - 4, 4, 4);                  // bobber
    f.fillStyle(0xc8a060, 1); f.fillRect(hook.x * S - 2, Y(hook.y) - 2, 4, 4);                   // bait
    for (let i = 0; i < 3; i++) { const r = ((t * 0.6 + i / 3) % 1); f.lineStyle(1, 0x9ad0e0, (1 - r) * 0.6); f.strokeEllipse((hook.x + 6) * S, Y(surf) + 2, (6 + r * 30) * S, (2 + r * 6) * S); }
    for (let i = 0; i < 14; i++) {                                           // bubbles rising
      const bx = (i * 47) % 640, cyc = (t * (10 + (i % 4) * 4) + i * 37) % 480, by = 840 - cyc;
      if (by > surf + 4) { f.fillStyle(0x9ad0e0, 0.35); f.fillCircle(bx * S + Math.sin(t * 2 + i) * 4, Y(by), 1.5 + (i % 3)); }
    }
    for (let i = 0; i < 12; i++) {                                           // fireflies over the bank
      const fx2 = 60 + ((i * 97) % 560) + Math.sin(t * 0.7 + i) * 14, fy2 = 250 + ((i * 53) % 90) + Math.cos(t * 0.5 + i * 1.3) * 8;
      const a = Math.max(0, Math.sin(t * 1.8 + i * 2.1));
      f.fillStyle(0xd8ff8a, a); f.fillRect(fx2 * S, Y(fy2), 2, 2);
    }
    // ---- glows: the koi's moonlight, the shark's eye, the moon's red flush
    const g = this.glow; g.clear();
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    for (let r = 5; r >= 1; r--) { g.fillStyle(0xbfe8ff, 0.05 * pulse); g.fillCircle(kx2 * S, Y(ky), r * 12); }
    if (eyeOpen > 0) {
      const ex = (sx + MOVIE.shark.eye[0]) * S, ey = Y(syy + MOVIE.shark.eye[1]);
      for (let r = 5; r >= 1; r--) { g.fillStyle(0xff2020, 0.07 * eyeOpen * (0.8 + 0.2 * Math.sin(t * 5))); g.fillCircle(ex, ey, r * 9); }
      g.fillStyle(0xff5040, eyeOpen); g.fillRect(ex - 4, ey - 2 * eyeOpen, 8, 4 * eyeOpen);
    }
    const [mx, my, mr] = MOVIE.moon;
    const flush = t > 23.6 && t < 25.6 ? Math.sin(((t - 23.6) / 2) * Math.PI) : 0;
    if (flush > 0) for (let r = 4; r >= 1; r--) { g.fillStyle(0xd02020, 0.12 * flush); g.fillCircle(mx * S, (my - cy * 0.55) * S, (mr + r * 10) * S); }

    // ---- darkness of the depths, letterbox, fades
    const tp = this.top; tp.clear();
    const deep = Math.max(0, Math.min(1, (cy - 250) / 290));
    if (deep > 0) { tp.fillStyle(0x020408, 0.45 * deep); tp.fillRect(0, 0, 1280, 720); }
    if (t > 15 && t < 22) { const k = Math.min(1, (t - 15) / 2, (22 - t) / 1.5); tp.fillStyle(0x500808, 0.18 * k); tp.fillRect(0, 520, 1280, 200); }
    tp.fillStyle(0x03050a, 1); tp.fillRect(0, 0, 1280, 64); tp.fillRect(0, 656, 1280, 64);
    const fadeIn = Math.max(0, 1 - t / 2.2), fadeOut = Math.max(0, (t - (LEN - 1.4)) / 1.4);
    const fade = Math.max(fadeIn, fadeOut);
    if (fade > 0) { tp.fillStyle(0x000000, fade); tp.fillRect(0, 0, 1280, 720); }

    // ---- words
    const c = CAPTIONS.find(([a, b]) => t >= a && t <= b);
    if (c) { this.cap.setText(c[2]).setAlpha(Math.min(1, (t - c[0]) / 0.6, (c[1] - t) / 0.6)); this.cap.setPosition(640, 690); } else this.cap.setAlpha(0);
    const ta = t > 24.2 ? Math.min(1, (t - 24.2) / 0.8) * (1 - fadeOut) : 0;
    this.title.setAlpha(ta); this.sub.setAlpha(ta * 0.9);
    this.skipT.setAlpha(t < LEN - 2 ? 0.8 : 0);
  }

  private finish(): void {
    this.done = true;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.onEnd();
  }
}
