/** The Royal Kitchens: mimic loaves, grease, steam vents, the Pelican Chef and the Kitchen Seal. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

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

describe('the Royal Kitchens', () => {
  it('a mimic loaf leaps onto the pack and chews; a roll throws it off', () => {
    const sim = room('castle-5');
    sim.player.x = 200; sim.player.y = 360;
    const m = sim.mkEnemy('mimic', 230, 360); sim.enemies.push(m);
    const w = sim.pack.water;
    run(sim, 1.2, () => stand(sim));
    expect(m.mode).toBe('cling');
    expect(sim.pack.water).toBeLessThan(w);
    sim.roll(stand(sim, { moveX: 1 }));
    expect(m.mode).toBe('hop');
  });

  it('grease: Rocco keeps sliding after you let go', () => {
    const slide = (greasy: boolean) => {
      const sim = room('castle-5');
      const g = sim.room.def.grease![0]!;
      sim.player.x = greasy ? g.x + 40 : 150; sim.player.y = greasy ? g.y + g.h / 2 : 300;
      run(sim, 0.5, () => stand(sim, { moveX: 1 }));
      const x0 = sim.player.x;
      run(sim, 0.4, () => stand(sim));
      return sim.player.x - x0;
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 2);
  });

  it('a stove vent hisses, then bursts and scalds anyone on it', () => {
    const sim = room('castle-6');
    const v = sim.room.def.steam![0]!;
    sim.player.x = v.x; sim.player.y = v.y;
    const w = sim.pack.water, holes = sim.pack.holes;
    const seen = new Set<string>();
    run(sim, v.period + 0.2, () => { seen.add(sim.steamState(v)); return stand(sim); });
    expect(seen.has('warn')).toBe(true);
    expect(seen.has('burst')).toBe(true);
    expect(sim.pack.water < w || sim.pack.holes > holes).toBe(true);
  });

  it('the Pelican Chef swallows Biscuit; three yanks pop him out and leave her dazed', () => {
    const sim = room('castle-7');
    const chef = sim.mkEnemy('pelican', 600, 400); sim.enemies.push(chef);
    sim.player.x = 500; sim.player.y = 400; sim.goose.x = 530; sim.goose.y = 400; sim.player.inv = 1e9;
    chef.mode = 'scoop'; chef.modeT = 0; chef.hit = false;
    run(sim, 1.2, () => stand(sim));
    expect(chef.mode).toBe('gulp');
    expect(sim.goose.target).toBe(chef);
    for (let i = 0; i < 3; i++) { sim.yank(); sim.step(STEP, stand(sim)); }
    expect(chef.mode).toBe('dazed');
    const hp = chef.hp; sim.damage(chef, 1); expect(hp - chef.hp).toBe(2);
  });

  it('beaten, she gives the Kitchen Seal', () => {
    const sim = new Sim({ seed: 2 }); sim.enterRoom(ROOMS['castle-3']!, 'w');
    const chef = sim.enemies.find(e => e.kind === 'pelican')!;
    sim.damage(chef, 999);
    expect(sim.kit.seals.has('kitchens')).toBe(true);
    expect(sim.drainEvents().some(e => e.type === 'seal')).toBe(true);
  });

  it('the Kitchens are east of the gate', () => {
    expect(ROOMS['castle-1']!.doors!.find(d => d.id === 'e')!.to).toBe('castle-3');
  });
});
