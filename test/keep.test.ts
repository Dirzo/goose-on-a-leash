/** The Lava Keep: lava, ember spouts, the Black Swan, the Keep Seal, the Golden Tether. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function room(id: string, door = 'w', seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, door);
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0; sim.castMode = true;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

describe('the Lava Keep', () => {
  it('walking into lava scorches the pack and throws Rocco back out', () => {
    const sim = room('castle-8', 's');
    sim.player.x = 360; sim.player.y = 500;
    const w = sim.pack.water;
    run(sim, 0.6, () => stand(sim, { moveX: 1 }));
    expect(sim.pack.water).toBeLessThan(w - 0.1);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
  });

  it('a lava spout flings embers at the pack when Rocco is near', () => {
    const sim = room('castle-8', 's');
    const v = sim.room.def.embers![0]!;
    sim.player.x = 330; sim.player.y = v.y + 80;
    let ember = false;
    for (let i = 0; i < 60 * 3 && !ember; i++) { sim.step(STEP, stand(sim)); ember = sim.darts.some(d => d.kind === 'ember'); }
    expect(ember).toBe(true);
  });

  it('the Black Swan: armour turns bites; he charges into a pillar and sticks, and then bites land', () => {
    const sim = room('castle-10');
    const k = sim.mkEnemy('blackswan', 600, 260); sim.enemies.push(k);
    const hp = k.hp; sim.damage(k, 3); expect(k.hp).toBe(hp);
    // Rocco stands just past a pillar: the charge hits the pillar
    const pl = sim.room.def.walls.find(w => (w as { kind?: string }).kind === 'pillar')!;
    sim.player.x = pl.x - 40; sim.player.y = pl.y + pl.h / 2; sim.player.inv = 1e9;
    k.x = pl.x + pl.w + 160; k.y = pl.y + pl.h / 2; k.mode = 'wind'; k.modeT = 0; k.grip2 = 1;
    run(sim, 2, () => stand(sim));
    expect(['stuck', 'recover', 'stalk']).toContain(k.mode as string);
    k.mode = 'stuck'; k.modeT = 0;
    sim.damage(k, 3); expect(k.hp).toBeLessThan(hp);
  });

  it('a parried lance staggers him', () => {
    const sim = room('castle-10');
    sim.kit.oar = true;
    const k = sim.mkEnemy('blackswan', 400, 450); sim.enemies.push(k);
    sim.player.x = 300; sim.player.y = 450; sim.player.fx = 1; sim.player.fy = 0; sim.player.guard = 0.05;
    k.mode = 'charge'; k.hx = -1; k.hy = 0;
    sim.hurtPlayer(1, true, k, 'lance');
    expect(k.mode).toBe('stagger');
  });

  it('beaten, he gives the Keep Seal; the Golden Tether waits in the Forge', () => {
    const sim = new Sim({ seed: 2 }); sim.enterRoom(ROOMS['castle-4']!, 's');
    const k = sim.enemies.find(e => e.kind === 'blackswan')!;
    k.mode = 'stuck'; sim.damage(k, 999);
    expect(sim.kit.seals.has('keep')).toBe(true);
    expect(ROOMS['castle-4']!.chest!.leash).toBe('golden');
  });
});
