/**
 * The prologue: a playable opening at the end of Willowmere's dock, before the blood moon.
 *
 *   intro  → cinematic 'pro-open'
 *   cast   hold to swing the power meter, release to cast toward the aim (it must land in the pond)
 *   wait   the bobber sits, nibbles (don't strike yet!), then goes under
 *   bite   strike now [click / Space], or it steals the bait
 *   reel   hold to reel: keep the line's tension in the green band while the fish fights.
 *          Too slack and it swims off; too tight and the line SNAPS.
 *   catch  cinematic 'pro-catch': Bimbo, the red moon, the backpack, and Biscuit tied to the line.
 *
 * The sim is not stepped while this runs. Esc skips it.
 */
import Phaser from 'phaser';
import type { Vec } from '../core/math';
import type { Sim, SimEvent } from '../core/sim';
import { FONTS } from './render';

export type ProPhase = 'intro' | 'cast' | 'fly' | 'wait' | 'bite' | 'reel' | 'catch' | 'chase' | 'tied' | 'done';

/** Pure state machine (testable without a renderer). */
export class PrologueLogic {
  phase: ProPhase = 'intro';
  t = 0;
  power = 0;
  bob: Vec = { x: 0, y: 0 };
  from: Vec = { x: 0, y: 0 };
  tension = 0.3;
  progress = 0;
  msg = '';
  msgT = 0;
  private biteAt = 2;
  private nibbles: number[] = [];
  private rng: () => number;
  /** Catching Biscuit: where he is, the bread he's eating. */
  goose = { x: 0, y: 0, vx: 0, vy: 0, eat: 0, honkT: 2 };
  bread: { x: number; y: number } | null = null;
  /** Events to show (splashes, quips) and sounds to play. */
  out: SimEvent[] = [];
  sounds: string[] = [];

  constructor(private sim: Sim, seed = 7) {
    let s = seed;
    this.rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  say(t: string): void { this.msg = t; this.msgT = 3; }

  /** One frame. `hold`: the button is down; `press`/`release`: it went down/up this frame. */
  update(dt: number, hold: boolean, press: boolean, release: boolean, aim: Vec, rod: Vec): void {
    this.t += dt; this.msgT = Math.max(0, this.msgT - dt);
    const sim = this.sim;
    switch (this.phase) {
      case 'cast':
        if (hold) this.power = 0.5 - 0.5 * Math.cos(this.t * 3.2);      // swings 0..1
        else if (!release) { this.power = 0; this.t = 0; }
        if (release && this.t > 0.08) {
          const p = sim.player, dx = aim.x - p.x, dy = aim.y - p.y, l = Math.hypot(dx, dy) || 1;
          const d = 50 + this.power * 230;
          this.from = { ...rod };
          this.bob = { x: p.x + (dx / l) * d, y: p.y + (dy / l) * d };
          this.phase = 'fly'; this.t = 0; this.sounds.push('whoosh');
        }
        break;
      case 'fly':
        if (this.t >= 0.55) {
          if (!sim.room.inPit(this.bob.x, this.bob.y, 4)) { this.say("Plop. That's the grass. Cast out over the water."); this.phase = 'cast'; this.t = 0; this.sounds.push('thud'); break; }
          this.out.push({ type: 'fx', kind: 'splash', x: this.bob.x, y: this.bob.y });
          this.sounds.push('splash');
          this.phase = 'wait'; this.t = 0;
          this.biteAt = 2.2 + this.rng() * 2.2;
          this.nibbles = [this.biteAt * 0.35, this.biteAt * 0.65].filter(() => this.rng() < 0.8);
        }
        break;
      case 'wait':
        if (press) { this.say('Too early! Something nibbled and fled. Cast again.'); this.phase = 'cast'; this.t = 0; break; }
        if (this.t >= this.biteAt) { this.phase = 'bite'; this.t = 0; this.sounds.push('boing'); this.out.push({ type: 'fx', kind: 'splash', x: this.bob.x, y: this.bob.y }); }
        break;
      case 'bite':
        if (press) { this.phase = 'reel'; this.t = 0; this.tension = 0.45; this.progress = 0; this.say('Got it! Hold to reel. Keep the line in the green.'); this.sounds.push('chomp'); break; }
        if (this.t > 0.75) { this.say('Too slow. It stole the bait. Cast again.'); this.phase = 'cast'; this.t = 0; }
        break;
      case 'reel': {
        // the fish fights in surges; holding winds the line in (tension up), letting go gives it line
        const pull = 0.25 + 0.2 * Math.sin(this.t * 1.7) + 0.15 * Math.sin(this.t * 4.3 + 1) + (Math.sin(this.t * 0.9) > 0.85 ? 0.35 : 0);
        this.tension += ((hold ? 0.7 : -0.85) + pull * (hold ? 0.6 : 0.5)) * dt;
        this.tension = Math.max(0, this.tension);
        const inBand = this.tension > 0.25 && this.tension < 0.78;
        if (hold && inBand) this.progress += 0.2 * dt;
        else if (this.tension < 0.2) this.progress = Math.max(0, this.progress - 0.08 * dt);
        if (this.tension >= 1) { this.say('SNAP! Too tight. You tie on a new hook. Cast again.'); this.sounds.push('snap'); this.phase = 'cast'; this.t = 0; break; }
        // the bobber comes in toward the dock as you win
        const p = sim.player;
        this.bob.x += ((p.x + 30) - this.bob.x) * this.progress * dt * 0.6 + Math.sin(this.t * 6) * 0.4;
        this.bob.y += ((p.y) - this.bob.y) * this.progress * dt * 0.6;
        if (Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3)) this.out.push({ type: 'fx', kind: 'splash', x: this.bob.x, y: this.bob.y });
        if (this.progress >= 1) { this.phase = 'catch'; this.t = 0; this.sounds.push('chest'); }
        break;
      }
      default: break;
    }
  }

  /** Start the chase: Biscuit bolts from the dock onto the meadow. */
  startChase(): void {
    const p = this.sim.player;
    this.goose = { x: p.x - 40, y: p.y, vx: -170, vy: 30, eat: 0, honkT: 1.5 };
    this.bread = null; this.phase = 'chase'; this.t = 0;
    this.say("Biscuit's spooked. Get close, or toss him some bread [F] and grab him [E / Space].");
  }

  /**
   * Biscuit runs from Rocco when he's close, wanders otherwise, and stops to eat bread. Grab him while
   * he eats. `feed` / `grab` are this frame's presses; `aim` is where the bread goes.
   */
  chase(dt: number, feed: boolean, grab: boolean, aim: Vec): void {
    if (this.phase !== 'chase') return;
    this.t += dt; this.msgT = Math.max(0, this.msgT - dt);
    const sim = this.sim, p = sim.player, G = this.goose, room = sim.room;
    const d = Math.hypot(G.x - p.x, G.y - p.y);
    const land = (x: number, y: number) => x > 40 && y > 40 && x < room.def.width - 40 && y < room.def.height - 40
      && !room.inPit(x, y, 10) && !room.collide({ x, y, r: 10 });
    if (feed) {
      const dx = aim.x - p.x, dy = aim.y - p.y, l = Math.hypot(dx, dy) || 1, r = Math.min(150, l);
      let bx = p.x + (dx / l) * r, by = p.y + (dy / l) * r;
      for (let k = 0; k < 8 && !land(bx, by); k++) { bx = p.x + (bx - p.x) * 0.75; by = p.y + (by - p.y) * 0.75; }
      if (land(bx, by)) { this.bread = { x: bx, y: by }; this.sounds.push('bread'); this.say('Crust! He can\'t resist...'); }
    }
    let tx = 0, ty = 0, sp = 0;
    if (G.eat > 0) {
      G.eat -= dt;
      if (G.eat <= 0) { this.bread = null; this.say('He finished it. Toss another [F]!'); }
    } else if (this.bread && Math.hypot(this.bread.x - G.x, this.bread.y - G.y) < 300) {
      const bd = Math.hypot(this.bread.x - G.x, this.bread.y - G.y);
      if (bd < 8) { G.eat = 5; this.sounds.push('chomp'); }
      else { tx = (this.bread.x - G.x) / bd; ty = (this.bread.y - G.y) / bd; sp = 120; }
    } else if (d < 130) { tx = (G.x - p.x) / (d || 1); ty = (G.y - p.y) / (d || 1); sp = 175; }            // flee
    else { tx = Math.cos(this.t * 0.7); ty = Math.sin(this.t * 0.9); sp = 30; }                          // wander
    // steer round water and walls
    if (sp > 0) {
      let ok = false;
      for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
        const c = Math.cos(a), s = Math.sin(a), nx = tx * c - ty * s, ny = tx * s + ty * c;
        if (land(G.x + nx * 18, G.y + ny * 18)) { tx = nx; ty = ny; ok = true; break; }
      }
      if (!ok) sp = 0;
    }
    G.vx += (tx * sp - G.vx) * Math.min(1, dt * 8); G.vy += (ty * sp - G.vy) * Math.min(1, dt * 8);
    if (land(G.x + G.vx * dt, G.y + G.vy * dt)) { G.x += G.vx * dt; G.y += G.vy * dt; } else { G.vx *= -0.3; G.vy *= -0.3; }
    G.honkT -= dt;
    if (G.honkT <= 0 && G.eat <= 0) { G.honkT = 2 + Math.abs(Math.sin(this.t * 3)) * 2.5; this.sounds.push('honk'); }
    if (grab) {
      if (d < 46 && G.eat > 0) { this.phase = 'tied'; this.sounds.push('patch'); }
      else if (d < 46) { this.say('He flaps out of your paws! Feed him first [F].'); G.vx += (G.x - p.x) * 6; G.vy += (G.y - p.y) * 6; this.sounds.push('honk'); }
      else this.say('Too far. Get closer!');
    }
  }
}

/** Input, drawing and staging around PrologueLogic. */
export class Prologue {
  logic: PrologueLogic;
  private g: Phaser.GameObjects.Graphics;
  private hud: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private down = false; private wasDown = false;
  private keyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { this.down = true; e.preventDefault(); }
    const k = e.key.toLowerCase();
    if (!e.repeat && k === 'f') this.feedP = true;
    if (!e.repeat && (k === 'e' || k === ' ')) this.grabP = true;
  };
  private feedP = false; private grabP = false;
  private keyUp = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') this.down = false; };
  private ptrDown = () => { this.down = true; };
  private ptrUp = () => { this.down = false; };
  redT = -1;           // time since the moon turned (for the red wash)
  private sim: Sim;

  constructor(private scene: Phaser.Scene, sim: Sim, layers: { world: <T extends Phaser.GameObjects.GameObject>(o: T) => T; screen: <T extends Phaser.GameObjects.GameObject>(o: T) => T }, res: number) {
    this.logic = new PrologueLogic(sim);
    this.sim = sim;
    this.g = layers.world(scene.add.graphics().setDepth(5050));
    this.hud = layers.screen(scene.add.graphics().setDepth(9700));
    for (let i = 0; i < 4; i++) this.texts.push(layers.screen(scene.add.text(0, 0, '', { fontFamily: FONTS.body, fontSize: '18px', color: '#e9e4d6', resolution: res }).setDepth(9750).setOrigin(0.5).setVisible(false)));
    window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp);
    scene.input.on('pointerdown', this.ptrDown); scene.input.on('pointerup', this.ptrUp);
  }

  get active(): boolean { return this.logic.phase !== 'done'; }

  /** Forget presses made while a cinematic was up (Space advances dialogue; it mustn't count as a grab). */
  clearPresses(): void { this.feedP = this.grabP = false; }

  /** Catching Biscuit, after the sim has stepped: steer him and place him. */
  chaseFrame(dt: number, aim: Vec): void {
    const feed = this.feedP, grab = this.grabP; this.feedP = this.grabP = false;
    this.logic.chase(dt, feed, grab, aim);
    const g = this.sim.goose, G = this.logic.goose;
    g.x = G.x; g.y = G.y; g.vx = G.vx; g.vy = G.vy; g.state = 'loose'; g.feral = false; g.t = 99;
    if (Math.abs(G.vx) > 5) g.face = G.vx > 0 ? 1 : -1;
  }

  /** Gameplay frame (between the cinematics). */
  update(dt: number, aim: Vec, rod: Vec): void {
    const press = this.down && !this.wasDown, release = !this.down && this.wasDown;
    this.wasDown = this.down;
    this.logic.update(dt, this.down, press, release, aim, rod);
  }

  draw(rod: Vec, time: number, W: number, H: number, film: boolean): void {
    const L = this.logic, g = this.g, h = this.hud;
    g.clear(); h.clear();
    for (const t of this.texts) t.setVisible(false);
    let ti = 0;
    const text = (s: string, x: number, y: number, size: number, color: string, a = 1) => {
      const t = this.texts[ti++]; if (!t) return;
      t.setText(s).setPosition(x, y).setFontSize(size).setColor(color).setAlpha(a).setVisible(true);
    };
    // the fishing line and bobber
    if (L.phase === 'fly' || L.phase === 'wait' || L.phase === 'bite' || L.phase === 'reel') {
      let bx = L.bob.x, by = L.bob.y, lift = 0;
      if (L.phase === 'fly') { const u = Math.min(1, L.t / 0.55); bx = L.from.x + (L.bob.x - L.from.x) * u; by = L.from.y + (L.bob.y - L.from.y) * u; lift = Math.sin(u * Math.PI) * 70; }
      const under = L.phase === 'bite' || (L.phase === 'wait' && Math.sin(L.t * 14) > 0.97);
      const bobY = by - lift + (under ? 3 : Math.sin(time * 3) * 1);
      const taut = L.phase === 'reel' ? Math.min(1, L.tension) : 0.2;
      const mx = (rod.x + bx) / 2, my = (rod.y + bobY) / 2 + (1 - taut) * 22;
      g.lineStyle(1, 0xd8ecf4, 0.85);
      g.beginPath(); g.moveTo(rod.x, rod.y);
      for (let i = 1; i <= 12; i++) { const u = i / 12, x = (1 - u) * (1 - u) * rod.x + 2 * (1 - u) * u * mx + u * u * bx, y = (1 - u) * (1 - u) * rod.y + 2 * (1 - u) * u * my + u * u * bobY; g.lineTo(x, y); }
      g.strokePath();
      if (!under) {
        g.fillStyle(0x1a1522, 1); g.fillCircle(bx, bobY, 3.5);
        g.fillStyle(0xe05a47, 1); g.fillRect(bx - 2.5, bobY - 3, 5, 3);
        g.fillStyle(0xf6f1e6, 1); g.fillRect(bx - 2.5, bobY, 5, 2);
      }
      if (L.phase !== 'fly') { g.lineStyle(1, 0x9ae0ff, 0.5 - ((time * 0.8) % 1) * 0.5); g.strokeEllipse(bx, by + 2, 10 + ((time * 0.8) % 1) * 18, 4 + ((time * 0.8) % 1) * 6); }
    }
    // a red wash as the moon turns
    if (this.redT >= 0) { this.redT += 1 / 60; const a = Math.max(0, 0.55 - this.redT * 0.25); if (a > 0) { h.fillStyle(0xb01818, a); h.fillRect(0, 0, W, H); } }
    if (film) return;
    // prompts and meters
    const cx = W / 2, py = H - 150;
    if (L.phase === 'cast') {
      text(L.power > 0 ? 'Release to cast!' : 'Aim at the pond · hold [click / Space] to cast', cx, py - 34, 20, '#ffe8a8');
      const bw = 260; h.fillStyle(0x0b0a10, 0.85); h.fillRect(cx - bw / 2 - 4, py - 4, bw + 8, 18);
      h.fillStyle(0x3a3448, 1); h.fillRect(cx - bw / 2, py, bw, 10);
      h.fillStyle(0xc9a46a, 1); h.fillRect(cx - bw / 2, py, bw * L.power, 10);
    } else if (L.phase === 'wait') text('Wait for it...', cx, py, 20, '#e9e4d6', 0.8);
    else if (L.phase === 'bite') text('NOW! [click / Space]', cx, py, 30, '#ff8a6a', 0.7 + 0.3 * Math.sin(time * 30));
    else if (L.phase === 'reel') {
      text('Hold to reel · keep it in the green', cx, py - 64, 18, '#e9e4d6');
      const bw = 320, x0 = cx - bw / 2, y0 = py - 40;
      h.fillStyle(0x0b0a10, 0.88); h.fillRect(x0 - 6, y0 - 6, bw + 12, 52);
      h.fillStyle(0x3a3448, 1); h.fillRect(x0, y0, bw, 14);
      h.fillStyle(0x3f7a52, 1); h.fillRect(x0 + bw * 0.25, y0, bw * 0.53, 14);
      h.fillStyle(0x8a2a2a, 1); h.fillRect(x0 + bw * 0.78, y0, bw * 0.22, 14);
      const tx = x0 + bw * Math.min(1, L.tension);
      h.fillStyle(0xffffff, 1); h.fillRect(tx - 2, y0 - 4, 4, 22);
      text('tension', x0 - 40, y0 + 7, 11, '#9aa3a6');
      h.fillStyle(0x3a3448, 1); h.fillRect(x0, y0 + 26, bw, 8);
      h.fillStyle(0x9ae0ff, 1); h.fillRect(x0, y0 + 26, bw * Math.min(1, L.progress), 8);
      text('catch', x0 - 40, y0 + 30, 11, '#9aa3a6');
    }
    if (L.phase === 'chase' && L.bread) {
      g.fillStyle(0x1a1522, 1); g.fillEllipse(L.bread.x, L.bread.y, 10, 7);
      g.fillStyle(0xc98a3c, 1); g.fillEllipse(L.bread.x, L.bread.y - 1, 8, 5);
      g.fillStyle(0xe8b060, 1); g.fillRect(L.bread.x - 2, L.bread.y - 3, 3, 1);
    }
    if (L.phase === 'chase') text(L.goose.eat > 0 ? 'He\'s eating! Grab him [E / Space]' : 'Catch Biscuit · bread [F] · grab [E / Space]', cx, py + 4, 18, L.goose.eat > 0 ? '#ffe8a8' : '#e9e4d6', 0.9);
    if (L.msgT > 0) text(L.msg, cx, py + 40, 18, '#e9e4d6', Math.min(1, L.msgT));
    text('Esc skip', W - 50, 24, 11, '#6a6478', 0.8);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    this.scene.input.off('pointerdown', this.ptrDown); this.scene.input.off('pointerup', this.ptrUp);
    this.g.destroy(); this.hud.destroy(); for (const t of this.texts) t.destroy();
  }
}
