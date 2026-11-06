/** Old Snapper, the tutorial boss in Burrow Field. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { ELDER_HP, Sim, type Enemy, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function arena(): { sim: Sim; e: Enemy } {
  const sim = new Sim({ seed: 9 });
  sim.enterRoom(LAYOUT['reedmarsh-3']!, 'w');
  sim.spawnT = 1e9;
  const e = sim.enemies.find(x => x.kind === 'elder')!;
  sim.player.x = 200; sim.player.y = 330; sim.player.inv = 0;
  sim.goose.x = 170; sim.goose.y = 330; sim.goose.state = 'held';
  sim.drainEvents();
  return { sim, e };
}
const still = (sim: Sim): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };
const latch = (sim: Sim, e: Enemy) => { sim.goose.state = 'latched'; sim.goose.target = e; sim.goose.ox = -1; sim.goose.oy = 0; };

describe('Old Snapper', () => {
  it('guards the way out of the Reed Gate: his room in the area is a boss fight with the gate shut', () => {
    const def = ROOMS['reedmarsh-1']!;
    expect(def.boss).toBe('elder');
    expect(def.bell).toBeFalsy();
    expect(def.enemies.filter(e => e.kind === 'elder').length).toBe(1);
  });

  it('winds up, charges at Bimbo, and is winded afterwards', () => {
    const { sim, e } = arena();
    const seen = new Set<string>();
    run(sim, 6, () => { seen.add(e.mode); return still(sim); });
    expect(seen.has('wind')).toBe(true);
    expect(seen.has('charge')).toBe(true);
    expect(seen.has('tired')).toBe(true);
  });

  it('a roll through the charge avoids the hit', () => {
    const { sim, e } = arena();
    e.mode = 'charge'; e.modeT = 0; e.x = 300; e.y = 330; e.hx = -1; e.hy = 0; e.hit = false;
    sim.step(STEP, { ...still(sim), moveY: 1, roll: true });
    const w = sim.pack.water, h = sim.pack.holes;
    run(sim, 0.2, () => ({ ...still(sim), moveY: 1 }));
    expect(w - sim.pack.water).toBeLessThan(0.01);
    expect(sim.pack.holes).toBe(h);
  });

  it('is armoured: bites do half normally, double when he is winded', () => {
    const { sim, e } = arena();
    e.mode = 'stalk'; sim.damage(e, 2); expect(e.hp).toBe(ELDER_HP - 1);
    e.mode = 'tired'; sim.damage(e, 2); expect(e.hp).toBe(ELDER_HP - 5);
  });

  it('a honk sends him into his shell, where bites only clonk; biting and yanking flips him for big damage', () => {
    const { sim, e } = arena();
    e.x = 330; e.y = 330; e.mode = 'stalk'; e.cd = 9;
    sim.honk({ x: e.x, y: e.y });
    expect(e.mode).toBe('shell');
    const hp = e.hp;
    sim.damage(e, 3);
    expect(e.hp).toBe(hp);
    latch(sim, e);
    sim.yank();
    expect(e.mode).toBe('flipped');
    sim.damage(e, 2);
    expect(e.hp).toBe(hp - 5);
  });

  it('prompts each move once, in the order you meet them', () => {
    const { sim, e } = arena();
    const hints: string[] = [];
    run(sim, 6, () => { for (const ev of sim.drainEvents()) if (ev.type === 'hint') hints.push(ev.text); return still(sim); });
    expect(hints[0]).toMatch(/OLD SNAPPER/);
    expect(hints.some(h => /ROLL/.test(h))).toBe(true);
    expect(hints.some(h => /winded/.test(h))).toBe(true);
    expect(new Set(hints).size).toBe(hints.length);
    void e;
  });

  it('woken, he opens the gate and hands over a feather', () => {
    const sim = new Sim({ seed: 2 });
    sim.enterRoom(ROOMS['reedmarsh-1']!, 's');
    expect(sim.room.gateClosed).toBe(true);
    const e = sim.enemies.find(x => x.kind === 'elder')!;
    const f = sim.kit.mats.feather;
    e.mode = 'flipped';
    sim.damage(e, 999);
    expect(e.woke).toBeGreaterThan(0);
    expect(sim.room.gateClosed).toBe(false);
    expect(sim.kit.mats.feather).toBe(f + 1);
    expect(sim.kit.oar).toBe(false);                      // the oar is the Heron's
  });
});
