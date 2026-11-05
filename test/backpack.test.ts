/** The backpack that keeps Bimbo the Moon Koi alive: his water is Rocco's life in world rooms. */
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

  it('a hit either tears the pack (up to the maximum) or splashes water out; hearts never change', () => {
    const tear = pond(); fixRng(tear, 0);
    for (let i = 0; i < 8; i++) { tear.player.inv = 0; tear.hurtPlayer(); }
    expect(tear.pack.holes).toBe(C.maxHoles);
    expect(tear.player.hp).toBe(C.maxHp);

    const spill = pond(); fixRng(spill, 0.99);
    spill.player.inv = 0; spill.hurtPlayer();
    expect(spill.pack.holes).toBe(0);
    expect(spill.pack.water).toBeCloseTo(1 - C.hitSpill, 5);
    spill.player.inv = 0; spill.hurtPlayer(1, true);
    expect(spill.pack.water).toBeCloseTo(1 - C.hitSpill - C.heavySpill, 5);
    expect(spill.player.hp).toBe(C.maxHp);
  });

  it('a hit right after a hit does nothing (brief invulnerability)', () => {
    const sim = pond(); fixRng(sim, 0.99);
    sim.player.inv = 0; sim.hurtPlayer(); sim.hurtPlayer();
    expect(sim.pack.water).toBeCloseTo(1 - C.hitSpill, 5);
  });

  it('leak rate is shown per tear', () => {
    const sim = pond(); sim.pack.holes = 3;
    expect(sim.leakRate()).toBeCloseTo(C.packDrain + 3 * C.holeDrain, 6);
  });

  it('standing on the shoreline refills the pack', () => {
    const sim = pond();
    sim.pack.water = 0.2;
    sim.player.x = 425; sim.player.y = 200;          // west shore refill zone
    run(sim, 2);
    expect(sim.pack.water).toBeGreaterThan(0.95);
  });

  it('patching needs a needle use and a twine, and closes one tear', () => {
    const sim = pond();
    sim.pack.holes = 2; sim.kit.mats.fluff = 0; sim.pack.needles = 1;
    expect(sim.patchPack()).toBe(false);              // no twine
    sim.kit.mats.fluff = 3; sim.pack.needles = 0;
    expect(sim.patchPack()).toBe(false);              // no needle
    sim.pack.needles = 1;
    expect(sim.patchPack()).toBe(true);
    expect(sim.pack.holes).toBe(1);
    expect(sim.pack.needles).toBe(0);
    expect(sim.kit.mats.fluff).toBe(3 - C.patchCost);
    expect(sim.pack.patches).toBe(1);
    expect(sim.patchPack()).toBe(false);              // out of needle: race to the next kit
  });

  it('one patch input sews exactly one patch', () => {
    const sim = pond();
    sim.pack.holes = 3; sim.kit.mats.fluff = 10; sim.pack.needles = 3;
    sim.step(STEP, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, patch: true });
    expect(sim.pack.holes).toBe(2);
    expect(sim.pack.needles).toBe(2);
  });

  it('sewing kits and twine spools are picked up once and remembered', () => {
    const sim = pond();
    const k = WILLOWMERE.kits![0]!, sp = WILLOWMERE.spools![0]!;
    const needles = sim.pack.needles, twine = sim.kit.mats.fluff;
    sim.player.x = k.x; sim.player.y = k.y; sim.step(STEP);
    sim.player.x = sp.x; sim.player.y = sp.y; sim.step(STEP);
    expect(sim.pack.needles).toBe(needles + C.kitNeedles);
    expect(sim.kit.mats.fluff).toBe(twine + C.spoolTwine);
    sim.player.x = k.x; sim.player.y = k.y; sim.step(STEP);
    expect(sim.pack.needles).toBe(needles + C.kitNeedles);
    sim.restartRoom();
    sim.player.x = k.x; sim.player.y = k.y; sim.step(STEP);
    expect(sim.pack.needles).toBe(needles + C.kitNeedles);
  });

  it('when the water runs out Bimbo faints: back to the room entry with a full pack and at most two tears', () => {
    const sim = pond();
    sim.pack.holes = 5; sim.player.x = 200; sim.player.y = 300;
    sim.pack.water = 0.00001;
    sim.step(STEP);
    expect(sim.player.dead).toBeGreaterThan(0);
    run(sim, 1.5);
    expect(sim.player.dead).toBe(0);
    expect(sim.player.x).toBe(WILLOWMERE.playerStart.x);
    expect(sim.pack.water).toBeGreaterThan(0.95);
    expect(sim.pack.holes).toBe(C.faintHolesKept);
  });

  it('a big enough hit at low water makes Bimbo faint', () => {
    const sim = pond(); fixRng(sim, 0.99);
    sim.pack.water = 0.05; sim.player.inv = 0; sim.hurtPlayer();
    expect(sim.player.dead).toBeGreaterThan(0);
  });

  it('falling in the pond costs nothing but the trip back (no free refill)', () => {
    const sim = pond();
    sim.pack.water = 0.3; sim.player.inv = 0;
    sim.player.x = 600; sim.player.y = 200;          // open water
    sim.step(STEP);
    expect(sim.player.hp).toBe(C.maxHp);
    expect(sim.pack.water).toBeLessThan(0.31);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
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
