/** Casting mode (experimental): Biscuit on the fishing line; hold to let line out, cut him loose when he's angry. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { LAYOUT } from './helpers';

function field(): Sim {
  const sim = new Sim({ seed: 3 });
  sim.enterRoom(LAYOUT['reedmarsh-3']!, null);
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.x = 200; sim.player.y = 320; sim.goose.x = 170; sim.goose.y = 320; sim.goose.state = 'held';
  sim.castMode = true;
  return sim;
}
const aim = { aimX: 900, aimY: 320 };
const frame = (o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, ...aim, ...o });
const far = (sim: Sim, n: number, f: InputFrame) => { let m = 0; for (let i = 0; i < n; i++) { sim.step(STEP, f); m = Math.max(m, sim.goose.x - sim.player.x); } return m; };

describe('casting mode', () => {
  it('a quick click tosses him a short way; holding lets line run out for a long cast', () => {
    const a = field(); a.step(STEP, frame({ fling: true, castHold: true }));
    const short = far(a, 50, frame());
    const b = field(); b.step(STEP, frame({ fling: true, castHold: true }));
    const long = far(b, 50, frame({ castHold: true }));
    expect(short).toBeLessThan(C.castHeel + 20);
    expect(long).toBeGreaterThan(short + 80);
    expect(long).toBeLessThanOrEqual(b.leashLen() + 1);
  });

  it('letting go of the button brakes the line where it is', () => {
    const sim = field(); sim.step(STEP, frame({ fling: true, castHold: true }));
    for (let i = 0; i < 8; i++) sim.step(STEP, frame({ castHold: true }));
    const locked = sim.castLen;
    const m = far(sim, 40, frame());
    expect(m).toBeLessThanOrEqual(locked + 1);
  });

  it('while he bites, holding lets Rocco back away; released, the line holds him in', () => {
    const sim = field();
    const f = sim.mkEnemy('frog', 300, 320); f.cd = 99; f.hp = f.max = 99; f.heavy = true; sim.enemies.push(f);
    sim.goose.state = 'latched'; sim.goose.target = f; sim.goose.ox = -1; sim.goose.oy = 0; sim.castLen = 110;
    for (let i = 0; i < 60; i++) sim.step(STEP, frame({ moveX: -1, castHold: true }));
    const held = Math.hypot(sim.player.x - f.x, sim.player.y - f.y);
    expect(held).toBeGreaterThan(150);
    const L = sim.castLen;
    for (let i = 0; i < 60; i++) sim.step(STEP, frame({ moveX: -1 }));
    expect(Math.hypot(sim.player.x - f.x, sim.player.y - f.y)).toBeLessThanOrEqual(L + 1.5);
  });

  it('cutting the line needs rage; then he fights alone, never bites Rocco, and comes back', () => {
    const sim = field();
    sim.letGo();
    expect(sim.goose.state).toBe('held');                // not angry enough
    sim.goose.fury = C.castCutFury + 5;
    const f = sim.mkEnemy('frog', 400, 320); f.cd = 99; sim.enemies.push(f);
    const w = sim.pack.water;
    sim.letGo();
    expect(sim.goose.state).toBe('loose');
    for (let i = 0; i < Math.round((C.castCutTime + 1) / STEP); i++) sim.step(STEP, frame());
    expect(f.hp < f.max || f.woke > 0).toBe(true);
    expect(w - sim.pack.water).toBeLessThan(0.05);      // only the slow seep: Biscuit didn't go for the pack
    expect(['returning', 'held']).toContain(sim.goose.state);
  });

  it('classic mode is unchanged: the full leash, no cut rule', () => {
    const sim = field(); sim.castMode = false;
    expect(sim.lineLen()).toBe(sim.leashLen());
    sim.letGo();
    expect(sim.goose.state).toBe('loose');
  });
});
