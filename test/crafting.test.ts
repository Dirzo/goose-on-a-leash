/** Ported from the HTML prototype's 13 crafting checks. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { makeSim, quiet, run } from './helpers';

describe('materials and drops', () => {
  it('a dust bunny drops fluff that gets vacuumed into the satchel', () => {
    const sim = makeSim();
    const b = sim.enemies[0]!;
    sim.player.x = b.x + 30; sim.player.y = b.y;
    const before = sim.kit.mats.fluff;
    sim.damage(b, 99);
    run(sim, 1.5);
    expect(sim.kit.mats.fluff).toBe(before + 1);
  });

  it('a knight drops two chainmail scraps and a crest', () => {
    const sim = makeSim();
    const k = sim.enemies.find(e => e.kind === 'knight')!;
    sim.player.x = k.x + 30; sim.player.y = k.y;
    sim.damage(k, 99);
    run(sim, 1.5);
    expect(sim.kit.mats.chain).toBe(2);
    expect(sim.kit.mats.crest).toBe(1);
  });

  it('the first bell ring drops a clapper and opens the cage', () => {
    const sim = quiet(makeSim());
    sim.goose.x = 850; sim.goose.y = 96;
    sim.goose.state = 'latched'; sim.goose.target = { x: 850, y: 96, r: 1, post: true };
    sim.honk({ x: 890, y: 96 });
    expect(sim.items.some(i => i.mat === 'clapper')).toBe(true);
    expect(sim.room.gateClosed).toBe(false);
  });

  it('dust bunnies respawn from the vents', () => {
    const sim = makeSim();
    sim.enemies = [];
    run(sim, 7);
    expect(sim.enemies.some(e => !e.dead && e.kind === 'bunny')).toBe(true);
  });
});

describe('leashes', () => {
  it('the choke chain needs 4 chainmail and a crest, then adds +3 strength', () => {
    const sim = makeSim();
    sim.kit.mats.chain = 2; sim.kit.mats.crest = 1;
    expect(sim.craftLeash('choke')).toBe(false);
    sim.kit.mats.chain = 4;
    expect(sim.craftLeash('choke')).toBe(true);
    expect(sim.kit.leash).toBe('choke');
    expect(sim.kit.mats.chain).toBe(0);
    expect(sim.kit.mats.crest).toBe(0);
    expect(sim.str()).toBe(sim.tuning.strength + 3);
  });

  it('the bungee cord adds 90 leash length', () => {
    const sim = makeSim();
    sim.kit.mats.fluff = 3; sim.kit.mats.goo = 2; sim.kit.mats.mop = 1;
    expect(sim.craftLeash('bungee')).toBe(true);
    expect(sim.leashLen()).toBe(sim.tuning.leash + 90);
  });

  it('owned leashes can be re-equipped, unowned ones cannot', () => {
    const sim = makeSim();
    expect(sim.equipLeash('golden')).toBe(false);
    sim.kit.mats.chain = 3; sim.kit.mats.mop = 2;
    sim.craftLeash('chain');
    sim.equipLeash('mop');
    expect(sim.equipLeash('chain')).toBe(true);
    expect(sim.kit.leash).toBe('chain');
  });

  it('the toothed leash means a feral goose chews the leash, not you', () => {
    const sim = quiet(makeSim({ power: 5, strength: 1 }));
    sim.kit.owned.add('toothed'); sim.kit.leash = 'toothed';
    sim.goose.furious = 5; sim.goose.fury = 100;
    sim.letGo();
    run(sim, 3);
    expect(sim.player.hp).toBe(5);
  });
});

describe('breads', () => {
  it('sourdough bakes, calms the goose and blocks fury for 8 s', () => {
    const sim = makeSim();
    sim.kit.mats.crust = 4; sim.kit.mats.down = 1;
    expect(sim.craftBread('sour')).toBe(true);
    expect(sim.kit.bread.sour).toBe(1);
    expect(sim.kit.active).toBe('sour');
    sim.goose.fury = 50;
    sim.feedBread();
    expect(sim.goose.fury).toBe(0);
    expect(sim.buff.noFury).toBe(8);
  });

  it('a ghost pepper roll makes the goose furious instead of calm', () => {
    const sim = makeSim();
    sim.kit.mats.crust = 1; sim.kit.mats.goo = 1;
    sim.craftBread('pepper');
    sim.feedBread();
    expect(sim.goose.furious).toBeGreaterThan(0);
  });

  it('an empty active bread falls back to any bread in the satchel', () => {
    const sim = makeSim();
    sim.kit.active = 'bun';
    sim.goose.fury = 60;
    sim.feedBread();
    expect(sim.kit.bread.stale).toBe(0);
    expect(sim.goose.fury).toBe(0);
  });

  it('a fluff muffin restores a heart, capped at 5', () => {
    const sim = makeSim();
    sim.kit.mats.crust = 2; sim.kit.mats.fluff = 4;
    sim.craftBread('muffin');
    sim.player.hp = 3;
    sim.feedBread();
    expect(sim.player.hp).toBe(4);
    sim.step(STEP);
  });
});
