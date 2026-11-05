import Phaser from 'phaser';
import { STEP } from '../core/config';
import { Sim } from '../core/sim';
import { ROOMS, WILLOWMERE, type RoomDef } from '../data/rooms';
import { Controls } from '../view/controls';
import { Renderer, snapshot, type Snapshot } from '../view/render';
import { ArtRenderer, SCREEN_H, SCREEN_W } from '../view/art';
import { ROOM_ART, nearestFilter, preloadArt } from '../view/assets';
import { applySave, loadStoredSave, snapshotSave, storeSave } from '../core/save';

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
  /** Set by the UI layer: true while the recipe book is open. */
  paused = false;
  /** True when this session picked up from a save. */
  resumed = false;
  /** Saves are only written for world rooms, not the gray-box test room. */
  private get saving(): boolean { return !!this.sim.room.def.doors; }
  onReady: (scene: GameScene) => void = () => {};

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
      const z = Math.min(SCREEN_W / def.width, SCREEN_H / def.height);
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
    if (!this.paused) {
      this.acc += dt;
      let steps = 0, first = true;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.prev = snapshot(this.sim);
        this.sim.step(STEP, this.controls.frame(this.sim.player, first));
        first = false; this.acc -= STEP; steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.feed(this.sim.drainEvents());
    }
    const alpha = this.paused ? 1 : this.acc / STEP;
    this.view.draw(this.sim, this.paused ? null : this.prev, alpha, this.paused ? 0 : dt, this.controls.aim(this.sim.player), true);
  }

  /** R / the Reset button: back to where Rocco entered this room, hearts refilled. */
  resetRoom(): void {
    this.sim.restartRoom();
    this.prev = null;
    this.controls.dropPending();
    this.feed(this.sim.drainEvents());
  }

  /** Write the autosave now (also done on every room arrival). */
  saveNow(): boolean { return this.saving && storeSave(snapshotSave(this.sim)); }

  private feed(events: ReturnType<Sim['drainEvents']>): void {
    if (events.some(e => e.type === 'room')) { this.prev = null; this.saveNow(); }
    this.view.consume(events);
  }
}
