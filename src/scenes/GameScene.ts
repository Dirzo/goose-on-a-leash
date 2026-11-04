import Phaser from 'phaser';
import { STEP } from '../core/config';
import { Sim } from '../core/sim';
import { Controls } from '../view/controls';
import { Renderer, snapshot, type Snapshot } from '../view/render';

/** Max steps per frame, so a long stall (tab switch) cannot spiral. */
const MAX_STEPS = 8;

export class GameScene extends Phaser.Scene {
  sim!: Sim;
  controls!: Controls;
  private view!: Renderer;
  private acc = 0;
  private prev: Snapshot | null = null;
  private lastNow = 0;
  /** Set by the UI layer: true while the recipe book is open. */
  paused = false;
  onReady: (scene: GameScene) => void = () => {};

  constructor() { super('game'); }

  create(): void {
    this.sim = new Sim({ seed: (Date.now() & 0x7fffffff) || 1 });
    this.view = new Renderer(this);
    this.controls = new Controls(this, this.game.canvas);
    this.view.consume(this.sim.drainEvents());
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
      this.view.consume(this.sim.drainEvents());
    }
    const alpha = this.paused ? 1 : this.acc / STEP;
    this.view.draw(this.sim, this.paused ? null : this.prev, alpha, this.paused ? 0 : dt, this.controls.aim(this.sim.player), true);
  }

  resetRoom(): void {
    this.sim.reset();
    this.prev = null;
    this.controls.dropPending();
    this.view.consume(this.sim.drainEvents());
  }
}
