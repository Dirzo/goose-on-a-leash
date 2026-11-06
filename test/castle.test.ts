/** Castle Honkmore: shield turtles, bellhops, fire bars, slamming statues, the Ballroom's waves and the Royal Seal. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function hall(id: string, seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, 'e');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0; sim.castMode = true;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

describe('Castle Honkmore', () => {
  it('a shield turtle blocks bites from the front; from behind they land; a yank spins it round', () => {
    const sim = hall('castle-2');
    sim.player.x = 300; sim.player.y = 360;
    const t = sim.mkEnemy('turtle', 450, 360); t.fx_ = -1; t.fy_ = 0; t.cd = 99; sim.enemies.push(t);
    sim.goose.x = 420; sim.goose.y = 360;                 // in front of the shield
    const hp = t.hp; sim.damage(t, 2); expect(t.hp).toBe(hp);
    sim.goose.x = 480; sim.goose.y = 360;                 // behind
    sim.damage(t, 2); expect(t.hp).toBe(hp - 2);
    sim.goose.state = 'latched'; sim.goose.target = t; sim.rng = () => 0.99;
    sim.yank();
    expect(t.mode).toBe('flipped');
    sim.goose.x = 420; sim.goose.y = 360;
    const h2 = t.hp; sim.damage(t, 1); expect(h2 - t.hp).toBe(2);   // shield the wrong way: double
  });

  it('a bellhop rings: nearby guards attack at once, faster, and another guard marches in', () => {
    const sim = hall('castle-2');
    sim.player.x = 600; sim.player.y = 400;
    const b = sim.mkEnemy('bellhop', 600, 160); b.cd = 0; sim.enemies.push(b);
    const t = sim.mkEnemy('turtle', 700, 200); t.cd = 9; sim.enemies.push(t);
    run(sim, 1.5, () => stand(sim));
    expect(t.haste).toBeGreaterThan(0);
    expect(sim.enemies.filter(e => e.kind === 'turtle').length).toBe(2);
  });

  it('a fire bar burns the pack and singes a flung Biscuit', () => {
    const sim = hall('castle-2');
    const fb = sim.room.def.firebars![0]!, ball = sim.fireballs()[3]!;
    sim.player.x = ball.x; sim.player.y = ball.y + 10;
    const w = sim.pack.water, holes = sim.pack.holes;
    sim.step(STEP, stand(sim));
    expect(sim.pack.water < w || sim.pack.holes > holes).toBe(true);
    void fb;
  });

  it('a statue slams down on Rocco if he lingers under it, with a warning first', () => {
    const sim = hall('castle-3');
    const c = sim.room.def.crushers![0]!;
    sim.player.x = c.x + c.w / 2; sim.player.y = c.y + c.h / 2;
    const w = sim.pack.water, holes = sim.pack.holes;
    const states: string[] = [];
    run(sim, 1.4, () => { states.push(sim.crush[0]?.state ?? ''); return stand(sim); });
    expect(states).toContain('warn');
    expect(states).toContain('down');
    expect(sim.pack.water < w || sim.pack.holes > holes).toBe(true);
  });

  it('the Ballroom: guards come in waves once you walk in; beat them all for the Royal Seal', () => {
    const sim = new Sim({ seed: 4 }); sim.castMode = true;
    sim.enterRoom(ROOMS['castle-2']!, 'e');
    sim.enemies = [];
    const z = sim.room.def.zones!.find(q => q.name === 'The Ballroom')!;
    sim.player.x = z.x + z.w / 2; sim.player.y = z.y + z.h / 2 + 120; sim.player.inv = 1e9;
    let seen = 0;
    for (let i = 0; i < 60 * 120 && !sim.kit.seals.has('foyer'); i++) {
      sim.step(STEP, stand(sim));
      for (const e of sim.enemies) if (!e.woke && !e.dead && e.kind !== undefined && Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < 2000) { e.mode = 'flipped'; sim.damage(e, 99); seen++; }
      sim.pack.water = 1;
    }
    expect(seen).toBeGreaterThanOrEqual(9);
    expect(sim.kit.seals.has('foyer')).toBe(true);
  });

  it('the castle is reached from the cove, and the Foyer from the gate', () => {
    expect(ROOMS['tide-2']!.doors!.find(d => d.id === 'n')!.to).toBe('castle-1');
    expect(ROOMS['castle-1']!.doors!.find(d => d.id === 'w')!.to).toBe('castle-2');
  });
});
