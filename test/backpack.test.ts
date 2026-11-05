/** The backpack that keeps the Moon Koi alive, in Willowmere Pond. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { ROOM_01, WILLOWMERE } from '../src/data/rooms';
import { fixRng, run } from './helpers';

function pond(seed = 3): Sim {
  const sim = new Sim({ room: WILLOWMERE, seed });
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.drainEvents();
  return sim;
}

describe('backpack', () => {
  it('is off in Room 01 and on in Willowmere Pond', () => {
    expect(new Sim({ room: ROOM_01 }).pack.enabled).toBe(false);
    expect(pond().pack.enabled).toBe(true);
  });

  it('drains slowly when sound, and each hole drains faster', () => {
    const a = pond(); run(a, 10);
    const b = pond(); b.pack.holes = 2; run(b, 10);
    expect(1 - a.pack.water).toBeCloseTo(C.packDrain * 10, 2);
    expect(1 - b.pack.water).toBeCloseTo((C.packDrain + 2 * C.holeDrain) * 10, 2);
  });

  it('a hit can tear a hole, up to the maximum', () => {
    const sim = pond(); fixRng(sim, 0);
    for (let i = 0; i < 5; i++) { sim.player.inv = 0; sim.hurtPlayer(0); }
    expect(sim.pack.holes).toBe(C.maxHoles);
  });

  it('standing on the shoreline refills the pack', () => {
    const sim = pond();
    sim.pack.water = 0.2;
    sim.player.x = 425; sim.player.y = 200;          // west shore refill zone
    run(sim, 2);
    expect(sim.pack.water).toBeGreaterThan(0.95);
    expect(sim.pack.lastWater.x).toBeCloseTo(sim.player.x, 0);
  });

  it('patching costs Reed Fiber and closes a hole', () => {
    const sim = pond();
    sim.pack.holes = 2; sim.kit.mats.fluff = 1;
    expect(sim.patchPack()).toBe(false);
    sim.kit.mats.fluff = 4;
    expect(sim.patchPack()).toBe(true);
    expect(sim.pack.holes).toBe(1);
    expect(sim.kit.mats.fluff).toBe(4 - C.patchCost);
    expect(sim.pack.patches).toBe(1);
  });

  it('one patch input sews exactly one patch', () => {
    const sim = pond();
    sim.pack.holes = 3; sim.kit.mats.fluff = 10;
    sim.step(STEP, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, patch: true });
    expect(sim.pack.holes).toBe(2);
    expect(sim.kit.mats.fluff).toBe(10 - C.patchCost);
  });

  it('when the water runs out the koi faints and Rocco wakes at the last water', () => {
    const sim = pond();
    sim.pack.lastWater = { x: 425, y: 400 };
    sim.player.x = 200; sim.player.y = 300;
    sim.pack.water = 0.00001;
    sim.step(STEP);
    expect(sim.player.x).toBe(425);
    expect(sim.pack.water).toBeCloseTo(C.faintRefill, 2);
  });

  it('falling in the pond costs a heart but fills the pack', () => {
    const sim = pond();
    sim.pack.water = 0.3; sim.player.inv = 0;
    sim.player.x = 600; sim.player.y = 200;          // open water
    sim.step(STEP);
    expect(sim.player.hp).toBe(4);
    expect(sim.pack.water).toBeGreaterThan(0.99);
  });
});

describe('Willowmere Pond', () => {
  it('the dock is walkable over the water, the water beside it is not', () => {
    const sim = pond();
    expect(sim.room.inPit(560, 300, 6)).toBe(false);   // on the dock
    expect(sim.room.inPit(560, 250, 6)).toBe(true);    // beside it
  });

  it('a yank from the dock end crosses to the island post', () => {
    const sim = pond(); fixRng(sim, 0.99);
    sim.tuning.strength = 5;
    sim.player.x = 590; sim.player.y = 300;
    sim.goose.state = 'latched'; sim.goose.target = { x: 796, y: 300, r: 9, post: true }; sim.goose.ox = -1; sim.goose.oy = 0;
    sim.yank();
    run(sim, 1.5);
    expect(sim.player.x).toBeGreaterThan(770);
    expect(sim.player.hp).toBe(5);
  });

  it('the real crossing: fling from the dock end at the island post, yank, land on the far bank', () => {
    const sim = pond(5);
    sim.tuning.strength = 3;
    sim.player.x = 590; sim.player.y = 300; sim.goose.x = 570; sim.goose.y = 300;
    const f = (o: object = {}) => sim.step(STEP, { moveX: 0, moveY: 0, aimX: 796, aimY: 300, ...o });
    run(sim, 1);
    f({ fling: true }); for (let i = 0; i < 30; i++) f();
    expect(sim.goose.state).toBe('latched');
    expect(sim.goose.target?.x).toBe(796);
    f({ yank: true }); for (let i = 0; i < 90; i++) f();
    expect(sim.player.x).toBeGreaterThan(770);
    expect(sim.player.hp).toBe(5);
    // and back to the dock post
    sim.goose.state = 'held';
    const b = (o: object = {}) => sim.step(STEP, { moveX: 0, moveY: 0, aimX: 610, aimY: 300, ...o });
    run(sim, 1);
    b({ fling: true }); for (let i = 0; i < 30; i++) b();
    expect(sim.goose.target?.x).toBe(610);
    b({ yank: true }); for (let i = 0; i < 90; i++) b();
    expect(sim.player.x).toBeLessThan(642);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
    expect(sim.player.hp).toBe(5);
  });

  it('frogs and Old Snapper use the light and heavy enemy rules', () => {
    const sim = new Sim({ room: WILLOWMERE, seed: 1 });
    const kinds = sim.enemies.map(e => `${e.kind}:${e.heavy}`);
    expect(kinds).toContain('frog:false');
    expect(kinds).toContain('snapper:true');
  });
});
