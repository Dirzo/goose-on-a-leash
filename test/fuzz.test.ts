/**
 * Rope and goose stability. 10,000 random flings across random tuning must never produce
 * non-finite positions, put the goose or janitor outside the room, or stretch the held leash.
 */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { mulberry32 } from '../src/core/math';
import { Sim } from '../src/core/sim';

const finite = (...v: number[]) => v.every(Number.isFinite);

describe('rope fuzz', () => {
  it('survives 10,000 random flings', () => {
    const r = mulberry32(12345);
    const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
    let sim = new Sim({ seed: 99 });
    let problems: string[] = [];
    for (let n = 0; n < 10_000; n++) {
      if (n % 200 === 0) {
        sim = new Sim({
          seed: n + 1,
          tuning: { leash: pick(120, 360), fling: pick(400, 1600), yank: pick(400, 1500), fury: pick(0, 3), power: 1 + Math.floor(r() * 5), strength: 1 + Math.floor(r() * 5) },
        });
      }
      const input = { moveX: pick(-1, 1), moveY: pick(-1, 1), aimX: pick(0, 960), aimY: pick(0, 600) };
      sim.step(STEP, { ...input, fling: true, yank: r() < 0.3, honk: r() < 0.2, letGo: r() < 0.03, feed: r() < 0.02 });
      for (let s = 0; s < 12; s++) sim.step(STEP, input);
      const { player: p, goose: g } = sim;
      if (!finite(p.x, p.y, g.x, g.y, ...sim.rope.points.flatMap(q => [q.x, q.y]))) problems.push(`non-finite at fling ${n}`);
      if (g.x < 0 || g.x > 960 || g.y < 0 || g.y > 600) problems.push(`goose left the room at fling ${n}: ${g.x.toFixed(0)},${g.y.toFixed(0)}`);
      if (p.x < 0 || p.x > 960 || p.y < 0 || p.y > 600) problems.push(`janitor left the room at fling ${n}`);
      if ((g.state === 'held' || g.state === 'flying') && Math.hypot(g.x - p.x, g.y - p.y) > sim.leashLen() + 1) problems.push(`leash overstretched at fling ${n}`);
      if (problems.length > 5) break;
    }
    expect(problems).toEqual([]);
  });

  it('is deterministic for the same seed and inputs', () => {
    const play = () => {
      const sim = new Sim({ seed: 7 });
      for (let i = 0; i < 600; i++) {
        const a = { moveX: Math.sin(i / 30), moveY: Math.cos(i / 45), aimX: 480 + 300 * Math.cos(i / 20), aimY: 300 };
        sim.step(STEP, { ...a, fling: i % 90 === 0, yank: i % 90 === 40, honk: i % 120 === 60 });
      }
      return [sim.player.x, sim.player.y, sim.goose.x, sim.goose.y, sim.handled, sim.goose.fury];
    };
    expect(play()).toEqual(play());
  });
});
