/** Hollowbark foxes: they sidestep a cast they see coming, dart at the satchel, and bolt with the loot. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { LAYOUT } from './helpers';

function room(id = 'hollowbark-2', seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, 'w');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0; sim.castMode = true;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

describe('the fox', () => {
  it('sidesteps a plain cast, but not a perfect one', () => {
    const dodged = (perfect: boolean) => {
      const sim = room();
      const px = sim.player.x, py = sim.player.y;
      const fx = sim.mkEnemy('fox', px + 150, py); fx.mode = 'skulk'; fx.cd = 99; sim.enemies.push(fx);
      sim.castLen = 380; sim.fling({ x: px + 150, y: py }); sim.goose.perfect = perfect;
      expect(sim.goose.state).toBe('flying');
      run(sim, 0.4, () => stand(sim, { aimX: px + 150, aimY: py }));
      return (fx.dodge ?? 0) > 0;
    };
    expect(dodged(false)).toBe(true);
    expect(dodged(true)).toBe(false);
  });

  it('darts in, steals from the satchel, and gets away if not bitten', () => {
    const sim = room();
    sim.player.x = 400; sim.player.y = 320;
    sim.kit.bread.stale = 3;
    const fx = sim.mkEnemy('fox', 540, 320); sim.enemies.push(fx);
    let stole = false;
    for (let i = 0; i < Math.round(12 / STEP) && !fx.dead; i++) { sim.player.inv = 0; sim.step(STEP, stand(sim)); if (fx.loot) stole = true; }
    expect(stole).toBe(true);
    run(sim, 6, () => stand(sim));
    expect(fx.dead).toBe(true);
  });

  it('a bite makes it drop the loot', () => {
    const sim = room();
    sim.player.x = 400; sim.player.y = 320;
    const fx = sim.mkEnemy('fox', 520, 320); fx.mode = 'escape'; fx.loot = { bread: 'stale', n: 1 }; sim.enemies.push(fx);
    const before = sim.kit.bread.stale;
    sim.damage(fx, 1);
    expect(fx.loot).toBeUndefined();
    expect(sim.kit.bread.stale).toBe(before + 1);
  });

  it('lives in Hollowbark', () => {
    const n = ['hollowbark-2', 'hollowbark-5', 'hollowbark-7'].reduce((a, id) => a + (LAYOUT[id]!.enemies ?? []).filter(e => e.kind === 'fox').length, 0);
    expect(n).toBe(4);
  });
});
