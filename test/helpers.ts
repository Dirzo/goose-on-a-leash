import { STEP, type Tuning } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';

export function makeSim(tuning: Partial<Tuning> = {}, seed = 1): Sim {
  const sim = new Sim({ tuning, seed });
  sim.drainEvents();
  return sim;
}

/** Run the fixed-step simulation for `seconds`, optionally with a constant input. */
export function run(sim: Sim, seconds: number, input?: InputFrame): void {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) sim.step(STEP, input);
}

/** Remove every enemy and stop respawns, so a test measures one thing. */
export function quiet(sim: Sim): Sim {
  sim.enemies = [];
  sim.spawnT = 1e9;
  sim.knightT = -1e9;
  return sim;
}

/** Force the random generator, e.g. 0.99 to make the goose never refuse a yank. */
export function fixRng(sim: Sim, v: number): void { sim.rng = () => v; }

export function knightDummy(sim: Sim) {
  quiet(sim);
  const k = sim.mkEnemy('knight', 700, 210);
  k.hp = k.max = 999; k.spd = 0;
  sim.enemies.push(k);
  sim.player.x = 600; sim.player.y = 210;
  sim.goose.state = 'latched'; sim.goose.target = k; sim.goose.ox = -1; sim.goose.oy = 0;
  return k;
}
