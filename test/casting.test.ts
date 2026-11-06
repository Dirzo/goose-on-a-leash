/** Power cast: Biscuit on the fishing line; hold to wind up, release to cast, cut him loose when he's angry. */
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
  /** Hold the button for this long (the press frame included), then let go. */
  const wind = (sim: Sim, secs: number) => { for (let i = 0; i < Math.max(1, Math.round(secs / STEP)); i++) sim.step(STEP, frame({ castHold: true })); sim.step(STEP, frame()); };

  it('power cast: a tap tosses him a short way, a full wind-up sends him to the end of the line', () => {
    const a = field(); wind(a, STEP);
    const short = far(a, 50, frame());
    const b = field(); wind(b, C.castChargeTime * 0.8);
    const long = far(b, 50, frame());
    expect(short).toBeLessThan(C.castHeel + 80);
    expect(long).toBeGreaterThan(short + 80);
    expect(long).toBeLessThanOrEqual(b.castMax() + 1);
    expect(long).toBeGreaterThan(b.leashLen() * 1.2);   // a good cast goes well past the old leash
  });

  it('the meter swings back down: hold too long and the cast goes short', () => {
    const sim = field(); for (let i = 0; i < Math.round((C.castChargeTime * 1.9) / STEP); i++) sim.step(STEP, frame({ castHold: true }));
    expect(sim.charging).toBe(true);
    expect(sim.charge()).toBeLessThan(0.3);
    sim.step(STEP, frame());
    expect(sim.goose.state).toBe('flying');
    expect(sim.castLen).toBeLessThan(sim.castReach(0.35));
  });

  it('a perfect cast bites harder and stuns longer than a sloppy one', () => {
    const hit = (secs: number) => {
      const sim = field();
      const f = sim.mkEnemy('frog', 300, 320); f.cd = 99; f.hp = f.max = 99; sim.enemies.push(f);
      wind(sim, secs);
      for (let i = 0; i < 40 && sim.goose.state === 'flying'; i++) sim.step(STEP, frame());
      return { dmg: 99 - f.hp, stun: f.stun, state: sim.goose.state };
    };
    const perfect = hit(C.castChargeTime * 0.96), sloppy = hit(C.castChargeTime * 0.62);
    expect(perfect.state).toBe('latched'); expect(sloppy.state).toBe('latched');
    expect(perfect.dmg).toBeGreaterThan(sloppy.dmg * 1.8);
    expect(perfect.stun).toBeGreaterThan(sloppy.stun);
  });

  it('winding up slows Rocco, and holding through his return needs a fresh press', () => {
    const run = (hold: boolean) => { const sim = field(); for (let i = 0; i < 20; i++) sim.step(STEP, frame({ moveY: 1, castHold: hold })); return sim.player.y; };
    expect(run(true) - 320).toBeLessThan((run(false) - 320) * 0.8);
    const sim = field(); wind(sim, STEP);
    for (let i = 0; i < 120; i++) sim.step(STEP, frame({ castHold: true }));   // still holding as he comes back to heel
    expect(sim.goose.state).toBe('held');
    expect(sim.charging).toBe(false);
  });

  it('while he bites, holding lets Rocco back away; released, the line holds him in', () => {
    const sim = field();
    const f = sim.mkEnemy('frog', 300, 320); f.cd = 99; f.hp = f.max = 99; f.heavy = true; sim.enemies.push(f);
    sim.goose.state = 'latched'; sim.goose.target = f; sim.goose.ox = -1; sim.goose.oy = 0; sim.castLen = 110;
    for (let i = 0; i < 40; i++) sim.step(STEP, frame({ moveX: -1, castHold: true }));
    const held = Math.hypot(sim.player.x - f.x, sim.player.y - f.y);
    expect(held).toBeGreaterThan(150);
    const L = sim.castLen;
    for (let i = 0; i < 30; i++) sim.step(STEP, frame({ moveX: -1 }));
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
