import Phaser from 'phaser';
import { STEP } from '../core/config';
import { Sim } from '../core/sim';
import { ROOMS, WILLOWMERE, type RoomDef } from '../data/rooms';
import { Controls } from '../view/controls';
import { Renderer, snapshot, type Snapshot } from '../view/render';
import { ArtRenderer, CANVAS_H, CANVAS_W } from '../view/art';
import { ROOM_ART, nearestFilter, preloadArt } from '../view/assets';
import { applySave, loadStoredSave, snapshotSave, storeSave } from '../core/save';
import { sound } from '../view/audio';

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
    this.controls.paused = this.paused;
    this.controls.pollPad();
    if (!this.paused && this.hitStop > 0) { this.hitStop -= dt; }
    else if (!this.paused) {
      this.acc += dt;
      let steps = 0, first = true;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.prev = snapshot(this.sim);
        this.controls.oar = this.sim.kit.oar;
        this.sim.step(STEP, this.controls.frame(this.sim.player, first));
        first = false; this.acc -= STEP; steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.feed(this.sim.drainEvents());
    }
    this.listen();
    const alpha = this.paused ? 1 : this.acc / STEP;
    this.view.draw(this.sim, this.paused ? null : this.prev, alpha, this.paused ? 0 : dt, this.controls.aim(this.sim.player), true);
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
        if (now === 'wind') sound.play(({ frog: 'ribbit', snapper: 'hiss', squirrel: 'chatter', badger: 'growl', king: 'growl' } as Record<string, string>)[e.kind] ?? 'kraa');
        if (now === 'tunnel' || now === 'surface') sound.play('dust');
        if (now === 'lash') sound.play('tongue');
        if (now === 'leap' || now === 'charge' || now === 'takeoff') sound.play('whoosh');
        if (now === 'call') sound.play('kraa');
      }
    }
    const rolling = sim.player.roll > 0;
    if (rolling && !this.wasRolling) sound.play('whoosh');
    this.wasRolling = rolling;
    const g = sim.goose, taut = Math.hypot(g.x - sim.player.x, g.y - sim.player.y) > sim.leashLen() * 0.95 && sim.leashAttached;
    sound.setStrain(this.paused ? 0 : Math.max(g.strain, taut ? 0.3 : 0));
    sound.setRain(sim.storming && !this.paused);
  }

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
  patchFromPack(): void { this.sim.patchPack(); this.feed(this.sim.drainEvents()); }

  /** Write the autosave now (also done on every room arrival). */
  saveNow(): boolean { return this.saving && storeSave(snapshotSave(this.sim)); }

  private feed(events: ReturnType<Sim['drainEvents']>): void {
    if (events.some(e => e.type === 'room')) { this.prev = null; this.saveNow(); }
    if (events.some(e => e.type === 'shrine')) this.onShrine();
    const sim = this.sim;
    for (const e of events) {
      if (e.type === 'room') sound.play('door');
      if (e.type !== 'fx') continue;
      const bell = sim.room.def.bell;
      const k = e.kind === 'ring' ? (bell && Math.hypot(bell.x - e.x, bell.y - e.y) < 20 ? 'bell' : 'spawn') : e.kind === 'pick' ? 'pick' : e.kind;
      sound.play(k, sim.power());
    }
    for (const e of events) if (e.type === 'fx') {
      const stop = e.kind === 'snap' ? 0.28 : e.kind === 'slam' ? 0.12 : e.kind === 'tear' ? 0.07 : e.kind === 'chomp' ? 0.045 : e.kind === 'wake' ? 0.08 : 0;
      this.hitStop = Math.max(this.hitStop, stop);
    }
    this.view.consume(events);
  }
}
