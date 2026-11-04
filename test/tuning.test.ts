/** Ported from the HTML prototype's 14 slider checks. Each tuning value must change what it claims to. */
import { describe, expect, it } from 'vitest';
import { STEP, DEFAULT_TUNING } from '../src/core/config';
import { fixRng, knightDummy, makeSim, quiet, run } from './helpers';

const aimRight = { moveX: 0, moveY: 0, aimX: 900, aimY: 300 };

function maxFlingDistance(leash: number): number {
  const sim = quiet(makeSim({ leash, fling: 1600 }));
  sim.step(STEP, { ...aimRight, fling: true });
  let m = 0;
  for (let i = 0; i < 60; i++) { sim.step(STEP); m = Math.max(m, Math.hypot(sim.goose.x - sim.player.x, sim.goose.y - sim.player.y)); }
  return m;
}

function flingDistance(fling: number): number {
  const sim = quiet(makeSim({ fling }));
  sim.step(STEP, { ...aimRight, fling: true });
  for (let i = 0; i < 5; i++) sim.step(STEP);
  return sim.goose.x - sim.player.x;
}

function postPullSeconds(yank: number) {
  const sim = quiet(makeSim({ yank, strength: 5 }));
  fixRng(sim, 0.99);
  sim.player.x = 330; sim.player.y = 300;
  sim.goose.state = 'latched'; sim.goose.target = { x: 612, y: 300, r: 13, post: true }; sim.goose.ox = -1; sim.goose.oy = 0;
  sim.yank();
  let t = 0;
  while (sim.player.pull && t < 5) { sim.step(STEP); t += STEP; }
  return { t, x: sim.player.x };
}

function lightYankSpeed(yank: number): number {
  const sim = makeSim({ yank });
  fixRng(sim, 0.99);
  const e = sim.enemies[0]!;
  sim.enemies = [e]; sim.spawnT = 1e9;
  e.x = 300; e.y = 300; sim.player.x = 110; sim.player.y = 300;
  sim.goose.state = 'latched'; sim.goose.target = e; sim.goose.ox = -1; sim.goose.oy = 0;
  sim.yank();
  return Math.hypot(e.vx, e.vy);
}

function furyAfter2s(fury: number): number {
  const sim = makeSim({ fury });
  knightDummy(sim);
  run(sim, 2);
  return sim.goose.fury + (sim.goose.furious > 0 ? 100 : 0);
}

function damageIn3s(power: number): number {
  const sim = makeSim({ power, fury: 0 });
  const k = knightDummy(sim);
  run(sim, 3);
  return 999 - k.hp;
}

function snapSeconds(power: number, strength: number): number {
  const sim = quiet(makeSim({ power, strength }));
  sim.goose.furious = 5; sim.goose.fury = 100;
  let t = 0;
  while (!sim.goose.feral && t < 5) { sim.step(STEP); t += STEP; }
  return sim.goose.feral ? t : Infinity;
}

function heartsLostToFeral(power: number): number {
  const sim = quiet(makeSim({ power, strength: 1 }));
  sim.goose.furious = 5; sim.goose.fury = 100;
  sim.letGo();
  const hp0 = sim.player.hp;
  let t = 0;
  while (sim.player.hp === hp0 && t < 4) { sim.step(STEP); t += STEP; }
  return hp0 - sim.player.hp;
}

describe('tuning bench', () => {
  it('leash length caps how far a fling travels', () => {
    const a = maxFlingDistance(150), b = maxFlingDistance(350);
    expect(a).toBeLessThanOrEqual(152);
    expect(b).toBeGreaterThan(a + 150);
  });

  it('fling speed scales distance after 0.1 s', () => {
    expect(flingDistance(1500)).toBeGreaterThan(flingDistance(500) * 2);
  });

  it('yank speed scales the pull toward a post, which lands across the pit', () => {
    const slow = postPullSeconds(500), fast = postPullSeconds(1500);
    expect(slow.t).toBeGreaterThan(fast.t * 2);
    expect(fast.x).toBeGreaterThan(560);
  });

  it('yank speed scales how hard a light enemy is pulled', () => {
    expect(lightYankSpeed(1500)).toBeGreaterThan(lightYankSpeed(500) * 2.5);
  });

  it('fury gain ×0 builds no fury, ×3 builds a lot', () => {
    expect(furyAfter2s(0)).toBe(0);
    expect(furyAfter2s(3)).toBeGreaterThan(40);
  });

  it('goose power scales bite damage', () => {
    expect(damageIn3s(5)).toBeGreaterThan(damageIn3s(1) * 2);
    expect(makeSim({ power: 5 }).pw()).toBeCloseTo(2.6);
  });

  it('an outclassed leash snaps fast, a matched one survives a fury, a stronger one never strains', () => {
    const a = snapSeconds(4, 2), b = snapSeconds(3, 2);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(3);
    expect(snapSeconds(2, 2)).toBe(Infinity);
    expect(snapSeconds(2, 4)).toBe(Infinity);
  });

  it('calm refusals scale with the power-leash gap', () => {
    const outclassed = makeSim({ power: 5, strength: 1 }), safe = makeSim({ power: 1, strength: 5 });
    expect(outclassed.refuseChance()).toBeGreaterThan(0.3);
    expect(safe.refuseChance()).toBe(0);
  });

  it('a feral goose takes 2 hearts at power 4+, 1 heart below', () => {
    expect(heartsLostToFeral(2)).toBe(1);
    expect(heartsLostToFeral(5)).toBe(2);
  });

  it('bread calms a feral goose and clears fury and strain', () => {
    const sim = quiet(makeSim());
    sim.goose.furious = 5; sim.goose.fury = 100;
    sim.letGo();
    expect(sim.goose.feral).toBe(true);
    sim.feedBread();
    expect(sim.goose.feral).toBe(false);
    expect(sim.goose.furious).toBe(0);
    expect(sim.goose.strain).toBe(0);
    expect(sim.goose.state).toBe('returning');
  });

  it('defaults match the prototype bench', () => {
    expect(DEFAULT_TUNING).toEqual({ leash: 230, fling: 950, yank: 850, fury: 1, power: 2, strength: 2 });
  });
});
