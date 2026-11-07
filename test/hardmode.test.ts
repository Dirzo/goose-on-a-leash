/** Difficulty that bites: boss second phases, latch limits, puddles that run dry, zone checkpoints, Brutal tears. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };
function area(id: string, diff: 'classic' | 'story' | 'normal' | 'brutal', seed = 3): Sim {
  const sim = new Sim({ seed, difficulty: diff }); sim.castMode = true;
  sim.enterRoom(ROOMS[id]!, null, true); sim.spawnT = 1e9; sim.drainEvents();
  return sim;
}

describe('boss second phase', () => {
  it('below half HP on Normal a boss roars, throws Biscuit off, calls critters and speeds up', () => {
    const sim = area('hollowbark-4', 'normal');
    const king = sim.enemies.find(e => e.kind === 'king')!;
    sim.enemies = [king]; king.mode = 'stalk';
    const before = sim.enemies.length;
    sim.damage(king, king.max * 0.55);
    run(sim, 0.2, () => stand(sim));
    expect(king.phase2).toBe(true);
    expect(sim.drainEvents().some(e => e.type === 'phase2')).toBe(true);
    expect(sim.enemies.length).toBe(before + 2);
    const hp = king.hp; sim.damage(king, 3); expect(king.hp).toBe(hp);      // unhurtable for a moment while it roars
  });
  it('never on Classic', () => {
    const sim = area('hollowbark-4', 'classic');
    const king = sim.enemies.find(e => e.kind === 'king')!;
    sim.damage(king, king.max * 0.6); run(sim, 0.2, () => stand(sim));
    expect(king.phase2).toBeFalsy();
  });
  it('bosses throw Biscuit off after a few bites in one latch', () => {
    const sim = area('hollowbark-4', 'normal');
    const king = sim.enemies.find(e => e.kind === 'king')!;
    sim.enemies = [king]; king.mode = 'dazed'; king.modeT = 0;
    const g = sim.goose; g.state = 'latched'; g.target = king; g.ox = 10; g.oy = 0; g.biteT = 0;
    let shaken = false;
    for (let i = 0; i < Math.round(3 / STEP) && !shaken; i++) { sim.step(STEP, stand(sim)); if (g.state !== 'latched') shaken = true; }
    expect(shaken).toBe(true);
  });
});

describe('puddles run dry', () => {
  it('a refill puddle holds about one pack on Normal, then seeps back slowly', () => {
    const sim = area('reedmarsh-2', 'normal');
    const r = sim.room.def.refills![0]!;
    sim.player.x = r.x + r.w / 2; sim.player.y = r.y + r.h / 2;
    let got = 0;
    for (let k = 0; k < 4; k++) { sim.pack.water = 0.3; const w0 = sim.pack.water; run(sim, 3, () => stand(sim)); got += sim.pack.water - w0; }
    expect(got).toBeGreaterThan(0.9);
    expect(got).toBeLessThan(1.4);
    expect(sim.refillWater[0]).toBeLessThan(0.1);
  });
  it('on Classic they are bottomless', () => {
    const sim = area('reedmarsh-2', 'classic');
    expect(sim.refillWater[0]).toBe(Infinity);
  });
});

describe('checkpoints', () => {
  it('a faint on Normal puts Rocco back at the last zone he reached, not the door', () => {
    const sim = area('reedmarsh-1', 'normal');
    const zs = sim.room.def.zones!;
    expect(zs.length).toBeGreaterThan(1);
    const z = zs[1]!, door = { x: sim.player.x, y: sim.player.y };
    // walk him into the second zone (placed on solid ground there)
    let spot = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
    const bad = (q: { x: number; y: number }) => sim.room.inPit(q.x, q.y, -24) || sim.room.collide({ x: q.x, y: q.y, r: 26 }) || [[24, 0], [-24, 0], [0, 24], [0, -24]].some(([dx, dy]) => sim.room.inPit(q.x + dx!, q.y + dy!, 0));
    for (let tries = 0; tries < 400 && bad(spot); tries++) spot = { x: z.x + 30 + ((tries * 53) % (z.w - 60)), y: z.y + 30 + ((tries * 37) % (z.h - 60)) };
    sim.player.x = spot.x; sim.player.y = spot.y; sim.enemies = [];
    run(sim, 0.1, () => stand(sim));
    expect(sim.checkpoint?.name).toBe(z.name);
    sim.pack.water = 0.0001; sim.pack.holes = 3;
    run(sim, 3, () => stand(sim));
    expect(Math.hypot(sim.player.x - spot.x, sim.player.y - spot.y)).toBeLessThan(40);
    expect(Math.hypot(sim.player.x - door.x, sim.player.y - door.y)).toBeGreaterThan(200);
  });
});

describe('Brutal', () => {
  it('every hit on the pack side tears it', () => {
    const tears = (d: 'normal' | 'brutal') => {
      const sim = area('reedmarsh-2', d); let n = 0;
      for (let i = 0; i < 20; i++) { sim.pack.holes = 0; sim.player.inv = 0; sim.player.fx = 1; sim.player.fy = 0; sim.hurtPlayer(1, false, { x: sim.player.x - 30, y: sim.player.y }); n += sim.pack.holes; }
      return n;
    };
    expect(tears('brutal')).toBe(20);
    expect(tears('normal')).toBeLessThan(20);
  });
});

describe("Biscuit's mischief", () => {
  it('beating a boss gets Biscuit its hat, and he wears it', () => {
    const sim = area('hollowbark-4', 'normal');
    const king = sim.enemies.find(e => e.kind === 'king')!;
    king.armorT = 0; king.phase2 = true; sim.damage(king, 999);
    expect(sim.kit.hats.has('kingcrown')).toBe(true);
    expect(sim.kit.hat).toBe('kingcrown');
  });
  it('fling him over a pickup and he swallows it, then coughs it up later', () => {
    const sim = new Sim({ seed: 2 }); sim.castMode = true;
    sim.enterRoom(LAYOUT['driftwood-1']!, 'w'); sim.enemies = []; sim.spawnT = 1e9;
    const gl = sim.room.def.glass![0]!, before = sim.kit.mats.glass ?? 0;
    sim.goose.state = 'flying'; sim.goose.x = gl.x; sim.goose.y = gl.y; sim.goose.vx = 200; sim.goose.vy = 0;
    sim.step(STEP, stand(sim));
    expect(sim.glassGot[0]).toBe(true);
    expect(sim.kit.mats.glass ?? 0).toBe(before);                     // in his belly for now
    run(sim, 30, () => stand(sim));
    expect(sim.kit.mats.glass ?? 0).toBe(before + 1);
  });
});
