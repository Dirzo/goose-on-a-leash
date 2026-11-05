/** Hollowbark Woods: squirrels, badgers, the Burrow King, bushes, barrels, spore rings and thorns. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { LAYOUT } from './helpers';

function woods(id: string, seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, 'w');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

describe('Hollowbark Woods', () => {
  it('a squirrel lobs acorns at Bimbo from a distance', () => {
    const sim = woods('hollowbark-4');
    sim.player.x = 300; sim.player.y = 320;
    const s = sim.mkEnemy('squirrel', 140, 330); s.cd = 0; sim.enemies.push(s);
    let acorn = false;
    for (let i = 0; i < 120 && !acorn; i++) { sim.step(STEP, stand(sim)); acorn = sim.darts.some(d => d.kind === 'acorn'); }
    expect(acorn).toBe(true);
    expect(Math.hypot(s.x - sim.player.x, s.y - sim.player.y)).toBeGreaterThan(80);
  });

  it('a badger tunnels under to Bimbo, surfaces with a warning, then is dazed', () => {
    const sim = woods('hollowbark-4');
    sim.player.x = 300; sim.player.y = 320;
    const b = sim.mkEnemy('badger', 160, 320); b.cd = 0; sim.enemies.push(b);
    const seen = new Set<string>();
    run(sim, 4, () => { seen.add(b.mode); return stand(sim); });
    expect(seen.has('tunnel')).toBe(true);
    expect(seen.has('surface')).toBe(true);
    expect(seen.has('dazed')).toBe(true);
  });

  it('the Burrow King rams a tree and is dazed', () => {
    const sim = woods('hollowbark-8');
    const k = sim.mkEnemy('king', 500, 360); sim.enemies.push(k);
    sim.player.x = 200; sim.player.y = 360;                      // tree at (380, 200) & (380, 520); aim him at one
    k.mode = 'charge'; k.modeT = 0; const l = Math.hypot(380 - 500, 520 - 360); k.hx = (380 - 500) / l; k.hy = (520 - 360) / l;
    run(sim, 1, () => stand(sim));
    expect(['dazed', 'recover']).toContain(k.mode);
    expect(sim.drainEvents().some(e => e.type === 'say' && /CRUNCH/.test(e.text))).toBe(true);
  });

  it('beating the Burrow King opens the way and fills the satchel', () => {
    const sim = woods('hollowbark-8');
    const k = sim.mkEnemy('king', 640, 360); sim.enemies.push(k);
    k.hp = 0.01; k.mode = 'dazed';
    sim.player.x = 600; sim.player.y = 360;
    sim.goose.state = 'latched'; sim.goose.target = k; sim.goose.ox = -1; sim.goose.oy = 0;
    run(sim, 2, () => stand(sim));
    expect(k.woke).toBeGreaterThan(0);
    expect(sim.room.gateClosed).toBe(false);
  });

  it('Biscuit flung through a bramble bush chews it away', () => {
    const sim = woods('hollowbark-2');
    const b = LAYOUT['hollowbark-2']!.bushes![0]!;
    expect(sim.room.bushAlive[0]).toBe(true);
    sim.goose.state = 'flying'; sim.goose.x = b.x; sim.goose.y = b.y; sim.goose.vx = 0; sim.goose.vy = 0;
    sim.step(STEP, stand(sim));
    expect(sim.room.bushAlive[0]).toBe(false);
  });

  it('a rain barrel tops up the pack and runs dry', () => {
    const sim = woods('hollowbark-4');
    const b = LAYOUT['hollowbark-4']!.barrels![0]!;
    sim.player.x = b.x + 20; sim.player.y = b.y; sim.pack.water = 0.3;
    run(sim, 3, () => ({ moveX: 0, moveY: 0, aimX: b.x, aimY: b.y }));
    expect(sim.pack.water).toBeGreaterThan(0.85);
    expect(sim.barrelWater[0]).toBeLessThan(0.05);
  });

  it('honking a mushroom ring puts nearby critters to sleep', () => {
    const sim = woods('hollowbark-5');
    const m = LAYOUT['hollowbark-5']!.shrooms![0]!;
    const s = sim.mkEnemy('squirrel', m.x + 40, m.y); sim.enemies.push(s);
    sim.goose.state = 'held'; sim.goose.x = m.x - 120; sim.goose.y = m.y;
    sim.player.x = m.x - 140; sim.player.y = m.y;
    sim.honk({ x: m.x, y: m.y });
    expect(s.stun).toBeGreaterThan(3);
    expect(sim.shroomCd[0]).toBeGreaterThan(0);
  });

  it('thorns snag the pack', () => {
    const sim = woods('hollowbark-7');
    const r = LAYOUT['hollowbark-7']!.brambles![0]!;
    sim.player.x = r.x + r.w / 2; sim.player.y = r.y + r.h / 2;
    const w0 = sim.pack.water;
    sim.step(STEP, stand(sim));
    expect(sim.pack.water < w0 || sim.pack.holes > 0).toBe(true);
  });
});
