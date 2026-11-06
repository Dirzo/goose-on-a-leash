import Phaser from 'phaser';
import { STEP } from '../core/config';
import { Sim, type ShopItem } from '../core/sim';
import type { Difficulty } from '../core/config';
import { ROOMS, WILLOWMERE, type RoomDef } from '../data/rooms';
import { Controls } from '../view/controls';
import { Renderer, snapshot, type Snapshot } from '../view/render';
import { ArtRenderer, CANVAS_H, CANVAS_W, HUD_SCALE, SCREEN_H, SCREEN_W } from '../view/art';
import { Cinema } from '../view/cinema';
import { Prologue } from '../view/prologue';
import { Movie } from '../view/movie';
import { ROOM_ART, nearestFilter, preloadArt } from '../view/assets';
import { applySave, loadStoredSave, snapshotSave, storeSave } from '../core/save';
import { sound, type Theme } from '../view/audio';
import { biomeOf } from '../view/atmosphere';

/** Max steps per frame, so a long stall (tab switch) cannot spiral. */
const MAX_STEPS = 8;

/** `?room=<id>` opens a room directly (`room-01` is the gray-box test room) and skips the save. */
export function roomFromUrl(): RoomDef | null {
  const id = new URLSearchParams(location.search).get('room') ?? '';
  return ROOMS[id] ?? null;
}

interface View { consume: Renderer['consume']; draw: Renderer['draw'] }

export class GameScene extends Phaser.Scene {
  sim!: Sim;
  controls!: Controls;
  private view!: View;
  private acc = 0;
  private prev: Snapshot | null = null;
  private lastNow = 0;
  /** Hit-stop: seconds left of a tiny freeze that sells a big hit. */
  private hitStop = 0;
  /** Set by the UI layer: true while the recipe book is open. */
  paused = false;
  /** True when this session picked up from a save. */
  resumed = false;
  /** Saves are only written for world rooms, not the gray-box test room. */
  private get saving(): boolean { return !!this.sim.room.def.doors; }
  onReady: (scene: GameScene) => void = () => {};
  /** Set by the UI: Rocco stepped up to Biscuit's shrine. */
  onShrine: () => void = () => {};
  /** The cinematic player (chapter cards, boss entrances and wake-ups). */
  cinema = new Cinema();
  /** The playable opening (fishing up Bimbo), on a fresh game. */
  prologue: Prologue | null = null;
  /** The opening film, before the prologue. */
  movie: Movie | null = null;
  private catchFilmed = false;
  private stash: Sim['enemies'] | null = null;
  /** Set by the UI: Rocco called the ferry. */
  onFerry: () => void = () => {};
  /** Set by the UI: Rocco honked at a shop counter. */
  onShop: () => void = () => {};

  constructor() { super('game'); }

  preload(): void { preloadArt(this); }

  create(): void {
    nearestFilter(this, Phaser.Textures.FilterMode.NEAREST);
    const forced = roomFromUrl();
    this.sim = new Sim({ seed: (Date.now() & 0x7fffffff) || 1, room: forced ?? WILLOWMERE });
    const saved = forced ? null : loadStoredSave();
    if (saved) { applySave(this.sim, saved); this.resumed = true; }
    const def = this.sim.room.def;
    if (ROOM_ART[def.id]) this.view = new ArtRenderer(this, this.sim);
    else {
      // gray-box room, scaled to fit the 16:9 canvas
      const z = Math.min(CANVAS_W / def.width, CANVAS_H / def.height);
      this.cameras.main.setZoom(z).centerOn(def.width / 2, def.height / 2);
      this.view = new Renderer(this);
    }
    this.controls = new Controls(this, this.game.canvas);
    this.cinema.onCue = c => {
      if (c.sound) sound.play(c.sound as Parameters<typeof sound.play>[0]);
      if (c.shake) this.cameras.main.shake(c.shake * 1000, 0.012);
      if (c.act) this.stageAct(c.act);
    };
    this.cinema.onEnd = id => {
      this.controls.dropPending(); this.lastNow = performance.now();
      if (id === 'pro-open' && this.prologue) { this.prologue.logic.phase = 'cast'; this.prologue.logic.t = 0; }
      if (id === 'pro-tie') this.endPrologue();
    };
    if (this.view instanceof ArtRenderer) this.view.cinema = this.cinema.state;
    this.feed(this.sim.drainEvents());
    this.onReady(this);
  }

  /** Fixed 60 Hz simulation; the renderer interpolates between the last two steps. */
  override update(): void {
    // Use the real clock: Phaser smooths its delta, which under-reports time on slow frames
    // and would make the game run in slow motion on weak machines.
    const now = performance.now();
    const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1000) : STEP;
    this.lastNow = now;
    if (this.movie?.active) { this.movie.update(dt); for (const s of this.movie?.sounds ?? []) sound.play(s as Parameters<typeof sound.play>[0]); if (this.movie) this.movie.sounds = []; }
    const chasing = this.prologue?.logic.phase === 'chase';
    const film = this.cinema.active || !!this.movie?.active, pro = !!this.prologue?.active && !chasing;
    this.controls.verbsOff = chasing;
    this.controls.paused = this.paused || film || pro; this.controls.cinema = film;
    this.controls.pollPad();
    if (film) { if (this.cinema.active) this.cinema.update(dt, this.sim, this.sim.player); this.acc = 0; }
    else if (pro && this.view instanceof ArtRenderer) {
      const pl = this.prologue!;
      pl.update(dt, this.controls.aim(this.sim.player), this.view.rodTip);
      const L = pl.logic;
      if (L.out.length) { this.feed(L.out); L.out = []; }
      for (const s of L.sounds) sound.play(s as Parameters<typeof sound.play>[0]);
      L.sounds = [];
      if (L.phase === 'catch' && !this.cinema.active && !this.movie && !this.catchFilmed) {
        this.catchFilmed = true;
        this.movie = new Movie(this, this.view.layers().screen, HUD_SCALE, 'catch');
        this.movie.onEnd = () => { this.movie = null; this.lastNow = performance.now(); this.cinema.play('pro-catch'); };
      }
      if (L.phase === 'tied' && !this.cinema.active) { L.phase = 'catch'; this.cinema.play('pro-tie'); }
      this.acc = 0;
    }
    else if (!this.paused && this.hitStop > 0) { this.hitStop -= dt; }
    else if (!this.paused) {
      this.acc += dt;
      let steps = 0, first = true;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.prev = snapshot(this.sim);
        this.controls.oar = this.sim.kit.oar;
        this.sim.castMode = this.castMode; this.sim.difficulty = this.difficulty;
        this.sim.step(STEP, this.controls.frame(this.sim.player, first));
        first = false; this.acc -= STEP; steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.feed(this.sim.drainEvents());
    }
    if (film && this.prologue) this.prologue.clearPresses();
    if (chasing && !film && this.prologue) {
      const pl = this.prologue;
      pl.chaseFrame(dt, this.controls.aim(this.sim.player));
      for (const s of pl.logic.sounds) sound.play(s as Parameters<typeof sound.play>[0]);
      pl.logic.sounds = [];
      if (pl.logic.phase === 'tied') { pl.logic.phase = 'catch'; this.cinema.play('pro-tie'); }
    }
    if (!film && !pro) { this.cinema.update(dt, this.sim, this.sim.player); if (!chasing) this.cues(); }
    this.listen();
    const still = this.paused || film || pro, alpha = still ? 1 : this.acc / STEP;
    this.view.draw(this.sim, still ? null : this.prev, alpha, this.paused ? 0 : dt, this.controls.aim(this.sim.player), !film);
    if (this.prologue && this.view instanceof ArtRenderer) this.prologue.draw(this.view.rodTip, performance.now() / 1000, SCREEN_W, SCREEN_H, film || !this.prologue.active);
  }

  /** Start a cinematic once (the save remembers which were shown). */
  /** The power cast is how Biscuit is thrown (the old click-to-fling 'classic' mode stays in the sim for tests). */
  castMode = true;
  /** Difficulty (remembered in this browser). Normal is meant to be hard. */
  difficulty: Difficulty = (() => { try { const d = localStorage.getItem('goose-on-a-leash/difficulty'); return d === 'story' || d === 'brutal' || d === 'normal' ? d : 'normal'; } catch { return 'normal'; } })();
  setDifficulty(d: Difficulty): void {
    this.difficulty = d; this.sim.difficulty = d;
    try { localStorage.setItem('goose-on-a-leash/difficulty', d); } catch { /* per-browser nicety only */ }
  }
  setCastMode(on: boolean): void {
    this.castMode = on; this.sim.castMode = on;
    try { localStorage.setItem('goose-on-a-leash/leash-mode', on ? 'casting' : 'classic'); } catch { /* per-browser nicety only */ }
  }

  /** Cinematics can be switched off (remembered in this browser). */
  cinemaOn = (() => { try { return localStorage.getItem('goose-on-a-leash/cinematics') !== 'off'; } catch { return true; } })();
  setCinemaOn(on: boolean): void {
    this.cinemaOn = on;
    try { localStorage.setItem('goose-on-a-leash/cinematics', on ? 'on' : 'off'); } catch { /* per-browser nicety only */ }
    if (!on) this.cinema.skip();
  }
  /** Forget which were shown and replay the one for this area (if any). */
  replayHere(): void { this.cueRoom = ''; }

  playCinematic(id: string): void {
    if (!this.cinemaOn || this.sim.seen.has(id) || !(this.view instanceof ArtRenderer) || this.paused) return;
    if (this.cinema.play(id)) { this.sim.seen.add(id); this.controls.dropPending(); }
  }

  /** Cues that start cinematics: arriving in a chapter's first area, meeting a boss, waking one. */
  private cues(): void {
    const sim = this.sim, id = sim.room.def.id;
    if (this.cueRoom !== id) {
      this.cueRoom = id;
      const fresh = Object.keys(sim.world).every(k => k === 'willowmere') && !sim.kit.oar;
      if (id === 'willowmere' && fresh && this.cinemaOn && !sim.seen.has('prologue') && this.view instanceof ArtRenderer) { this.startPrologue(); return; }
      const ch = ({ willowmere: 'ch1', 'reedmarsh-1': 'ch2', 'hollowbark-1': 'ch3', 'driftwood-1': 'ch4', 'driftwood-2': 'wharf-hub', 'tide-1': 'ch5', 'tide-2': 'cove' } as Record<string, string>)[id];
      if (ch) this.playCinematic(ch);
    }
    if (this.cinema.active) return;
    if (this.pendingCine && !sim.fishing.card) { this.playCinematic(this.pendingCine); this.pendingCine = ''; }
    for (const e of sim.enemies) {
      const k = e.kind === 'elder' || e.kind === 'heron' || e.kind === 'king' || e.kind === 'gullbeard' ? e.kind : null;
      if (!k) continue;
      if (e.woke > 1.0) this.playCinematic(`${k}-out`);
      else if (!e.woke && Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < (k === 'elder' ? 430 : 900)) this.playCinematic(`${k}-in`);
    }
  }
  private cueRoom = '';
  private pendingCine = '';

  /** The opening: Rocco on the end of the dock, a pale moon, no goose yet. */
  startPrologue(): void {
    if (!(this.view instanceof ArtRenderer)) return;
    const sim = this.sim, dock = sim.room.def.bridges?.[0];
    if (!dock) return;
    sim.player.x = dock.x + dock.w - 22; sim.player.y = dock.y + dock.h / 2; sim.player.fx = 1; sim.player.fy = 0;
    sim.goose.x = sim.player.x - 30; sim.goose.y = sim.player.y; sim.goose.state = 'held';
    this.view.stage = { hideGoose: true, noKoi: true };
    this.view.atmo.calm = 1;
    this.prologue = new Prologue(this, sim, this.view.layers(), HUD_SCALE);
    this.movie = new Movie(this, this.view.layers().screen, HUD_SCALE);
    this.movie.onEnd = () => { this.movie = null; this.lastNow = performance.now(); this.controls.dropPending(); this.cinema.play('pro-open'); };
  }

  /** Cues from the prologue's cinematic. */
  private stageAct(act: string): void {
    if (!(this.view instanceof ArtRenderer)) return;
    if (act === 'redmoon') { this.view.atmo.calm = 0; if (this.prologue) this.prologue.redT = 0; }
    if (act === 'pack' && this.view.stage) this.view.stage = { ...this.view.stage, noKoi: false };
    if (act === 'goose') {
      const p = this.sim.player;
      this.sim.goose.x = p.x - 40; this.sim.goose.y = p.y; this.sim.goose.face = 1;
      this.view.stage = { hideGoose: false, hideLine: true };
    }
    if (act === 'bolt' && this.prologue) {
      this.stash = this.sim.enemies; this.sim.enemies = [];                // the frogs keep their distance for now
      this.prologue.logic.startChase();
      this.view.stage = { hideGoose: false, hideLine: true };
    }
    if (act === 'tie') this.view.stage = null;
  }

  /** Esc during the fishing: jump to the end of the prologue. */
  skipPrologue(): void {
    if (!this.prologue?.active) return;
    this.movie?.skip();
    this.cinema.skip();
    this.endPrologue();
  }

  private endPrologue(): void {
    if (!this.prologue) return;
    this.prologue.logic.phase = 'done';
    this.prologue.destroy(); this.prologue = null;
    this.sim.seen.add('prologue');
    if (this.stash) { this.sim.enemies = this.stash; this.stash = null; }
    if (this.view instanceof ArtRenderer) { this.view.stage = null; this.view.atmo.calm = 0; }
    const p = this.sim.player; this.sim.goose.x = p.x - 30; this.sim.goose.y = p.y; this.sim.goose.state = 'held';
    this.controls.dropPending(); this.lastNow = performance.now();
    this.cueRoom = '';                         // now Chapter One
  }

  private modes = new Map<number, string>();
  /** Sounds that come from state, not events: critters winding up, the leash creak, the rain. */
  private wasRolling = false;
  private listen(): void {
    const sim = this.sim;
    for (const e of sim.enemies) {
      const before = this.modes.get(e.id), now = e.mode;
      if (before !== now) {
        this.modes.set(e.id, now);
        if (now === 'wind') sound.play(({ frog: 'ribbit', snapper: 'hiss', squirrel: 'chatter', badger: 'growl', king: 'growl', crab: 'chatter' } as Record<string, string>)[e.kind] ?? 'kraa');
        if (now === 'tunnel' || now === 'surface') sound.play('dust');
        if (now === 'lash') sound.play('tongue');
        if (now === 'leap' || now === 'charge' || now === 'takeoff') sound.play('whoosh');
        if (now === 'call') sound.play('kraa');
      }
    }
    const rolling = sim.player.roll > 0;
    if (rolling && !this.wasRolling) sound.play('whoosh');
    this.wasRolling = rolling;
    const g = sim.goose, taut = Math.hypot(g.x - sim.player.x, g.y - sim.player.y) > sim.lineLen() * 0.95 && sim.leashAttached;
    sound.setStrain(this.paused ? 0 : Math.max(g.strain, taut ? 0.3 : 0));
    sound.setRain(sim.storming && !this.paused);
    // the music and ambience follow the place, the fight and Bimbo's water
    const def = sim.room.def, p = sim.player;
    const boss = sim.enemies.some(e => !e.woke && !e.dead && (e.kind === 'heron' || e.kind === 'king' || e.kind === 'gullbeard' || e.kind === 'elder')
      && e.mode !== 'stalk' && Math.hypot(e.x - p.x, e.y - p.y) < 900);
    let danger = 0;
    for (const e of sim.enemies) if (!e.woke && !e.dead && (e.mode === 'wind' || e.mode === 'aim')) danger = Math.max(danger, 1 - Math.hypot(e.x - p.x, e.y - p.y) / 260);
    const b = biomeOf(def) as Theme;
    sound.scene = { biome: def.fishing ? 'cove' : b, boss, danger, water: sim.pack.enabled ? sim.pack.water : 1, fishing: !!def.fishing && !boss,
      quiet: !!this.movie?.active || !!this.prologue?.active };
    // footsteps
    const moved = Math.hypot(p.x - this.lastStep.x, p.y - this.lastStep.y);
    if (moved > 1000) this.lastStep = { x: p.x, y: p.y };
    else if (moved > 26 && !p.air && p.roll <= 0 && !this.paused) {
      this.lastStep = { x: p.x, y: p.y };
      const onPlanks = (def.bridges ?? []).some(r => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h);
      sound.footstep(onPlanks ? 'wood' : b === 'wharf' || def.fishing ? 'sand' : b === 'tide' ? 'stone' : 'grass');
    }
  }
  private lastStep = { x: 0, y: 0 };

  /** R / the Reset button: back to where Rocco entered this room, hearts refilled. */
  resetRoom(): void {
    this.sim.restartRoom();
    this.prev = null;
    this.controls.dropPending();
    this.feed(this.sim.drainEvents());
  }

  /** The backpack screen (art rooms with a pack only). Opening it pauses the game. */
  get packOpen(): boolean { return this.view instanceof ArtRenderer && this.view.packOpen; }
  setPackOpen(on: boolean): boolean {
    if (!(this.view instanceof ArtRenderer) || (on && !this.sim.pack.enabled)) return false;
    this.view.packOpen = on; this.paused = on;
    if (!on) this.game.canvas.focus();
    return true;
  }
  /** Patch from the backpack screen (the sim is paused, so feed its events straight to the view). */
  ferryTo(id: string): void { if (this.sim.ferryTo(id)) this.feed(this.sim.drainEvents()); }
  buy(id: ShopItem['id']): boolean { const ok = this.sim.buy(id); this.feed(this.sim.drainEvents()); return ok; }
  patchFromPack(): void { this.sim.patchPack(); this.feed(this.sim.drainEvents()); }

  /** Write the autosave now (also done on every room arrival). */
  saveNow(): boolean { return this.saving && storeSave(snapshotSave(this.sim)); }

  private feed(events: ReturnType<Sim['drainEvents']>): void {
    if (events.some(e => e.type === 'room')) { this.prev = null; this.saveNow(); }
    if (events.some(e => e.type === 'shrine')) this.onShrine();
    if (events.some(e => e.type === 'ferry')) this.onFerry();
    if (events.some(e => e.type === 'shop')) this.onShop();
    for (const e of events) if (e.type === 'sound') sound.play(e.kind);
    if (events.some(e => e.type === 'morays')) this.pendingCine = 'moray-out';
    const sim = this.sim;
    for (const e of events) {
      if (e.type === 'room') sound.play('door');
      if (e.type !== 'fx') continue;
      const bell = sim.room.def.bell;
      const k = e.kind === 'ring' ? (bell && Math.hypot(bell.x - e.x, bell.y - e.y) < 20 ? 'bell' : 'spawn') : e.kind === 'pick' ? 'pick' : e.kind;
      sound.play(k, sim.power());
    }
    for (const e of events) if (e.type === 'fx') {
      const stop = e.kind === 'snap' ? 0.28 : e.kind === 'slam' ? 0.12 : e.kind === 'tear' ? 0.07 : e.kind === 'chomp' ? 0.045 : e.kind === 'perfect' ? 0.06 : e.kind === 'wake' ? 0.08 : 0;
      this.hitStop = Math.max(this.hitStop, stop);
    }
    this.view.consume(events);
  }
}
