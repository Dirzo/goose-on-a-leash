/** Bimbo talks from the backpack; Rocco's fishing glasses crack, let the blood moon in, and get mended. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { snapshotSave, validateSave } from '../src/core/save';
import { LAYOUT } from './helpers';
import { ROOMS } from '../src/data/rooms';

function room(id: string, seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, 'w');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0; sim.castMode = true;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };
const bimbo = (sim: Sim) => sim.drainEvents().filter(e => e.type === 'bimbo').map(e => (e as { text: string }).text);

describe('Bimbo', () => {
  it('says something on arriving in a new region, once', () => {
    const sim = room('driftwood-1');
    run(sim, 4, () => stand(sim));
    const said = bimbo(sim);
    expect(said.some(t => /salt water/i.test(t))).toBe(true);
    run(sim, 30, () => stand(sim));
    expect(bimbo(sim).some(t => /salt water/i.test(t))).toBe(false);
  });

  it('chatters when Rocco stands about, but not constantly', () => {
    const sim = room('tide-3');
    run(sim, 120, () => stand(sim));
    const n = bimbo(sim).length;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(10);
  });
});

describe("Rocco's fishing glasses", () => {
  it('with two cracks the blood moon seeps in and his steps wander', () => {
    const go = (cracks: number) => {
      const sim = room('tide-3'); sim.glassCracks = cracks;
      sim.player.x = 200; sim.player.y = 500;
      let maxDev = 0;
      for (let i = 0; i < Math.round(20 / STEP); i++) { sim.step(STEP, stand(sim, { moveX: i % 600 < 300 ? 1 : -1 })); maxDev = Math.max(maxDev, Math.abs(sim.player.y - 500)); }
      return maxDev;
    };
    expect(go(0)).toBeLessThan(2);
    expect(go(2)).toBeGreaterThan(10);
  });

  it('a sewing kit mends one crack; Pickett mends them all', () => {
    const sim = room('driftwood-2');
    sim.glassCracks = 3;
    sim.mendGlasses(1);
    expect(sim.glassCracks).toBe(2);
    const lens = sim.shopStock().find(i => i.id === 'lens')!;
    expect(lens.sold).toBe(false);
    sim.kit.mats.glass = 5;
    sim.buy('lens');
    expect(sim.glassCracks).toBe(0);
    expect(sim.shopStock().find(i => i.id === 'lens')!.sold).toBe(true);
  });

  it('cracks are kept in the save', () => {
    const sim = room('tide-3'); sim.glassCracks = 2;
    const raw = JSON.parse(JSON.stringify(snapshotSave(sim))); raw.room = Object.keys(ROOMS)[0]; raw.door = null;
    const s = validateSave(raw)!;
    expect(s.kit.cracks).toBe(2);
  });

  it('heavy hits sometimes crack them', () => {
    const sim = room('tide-3', 5);
    for (let i = 0; i < 60 && !sim.glassCracks; i++) { sim.player.inv = 0; sim.pack.water = 1; sim.hurtPlayer(1, true); }
    expect(sim.glassCracks).toBeGreaterThan(0);
  });
});
