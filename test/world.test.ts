/** Room travel, room memory, waking critters and the Reedmarsh crossings. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { ROOMS, WILLOWMERE, type RoomDef } from '../src/data/rooms';
import { Room } from '../src/core/room';
import { fixRng, run } from './helpers';

const REED = Object.values(ROOMS).filter(r => r.id.startsWith('reedmarsh-'));

function at(def: RoomDef, seed = 3): Sim {
  const sim = new Sim({ room: WILLOWMERE, seed });
  sim.enterRoom(def, null);
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.drainEvents();
  return sim;
}

/** Stand at `from`, fling at `to`, yank, and let the pull finish. Returns the latched target's x. */
function cross(sim: Sim, from: [number, number], to: [number, number]): number | undefined {
  sim.player.x = from[0]; sim.player.y = from[1]; sim.player.vx = sim.player.vy = 0;
  sim.goose.state = 'held'; sim.goose.x = from[0] - 20; sim.goose.y = from[1];
  const f = (o: object = {}) => sim.step(STEP, { moveX: 0, moveY: 0, aimX: to[0], aimY: to[1], ...o });
  for (let i = 0; i < 20; i++) f();
  f({ fling: true }); for (let i = 0; i < 40; i++) f();
  const tx = (sim.goose.state as string) === 'latched' ? sim.goose.target?.x : undefined;
  f({ yank: true }); for (let i = 0; i < 100; i++) f();
  return tx;
}

describe('world map', () => {
  it('has six Reedmarsh rooms', () => { expect(REED.map(r => r.id).sort()).toEqual([1, 2, 3, 4, 5, 6].map(n => `reedmarsh-${n}`)); });

  it('every door leads to a real door that leads back', () => {
    for (const r of [WILLOWMERE, ...REED]) for (const d of r.doors ?? []) {
      if (d.to === 'END') continue;
      const there = ROOMS[d.to];
      expect(there, `${r.id}:${d.id} -> ${d.to}`).toBeTruthy();
      const back = there!.doors?.find(x => x.id === d.toDoor);
      expect(back, `${r.id}:${d.id} -> ${d.to}:${d.toDoor}`).toBeTruthy();
      expect(back!.to).toBe(r.id);
      expect(back!.toDoor).toBe(d.id);
    }
  });

  it('every door can actually be walked into (no wall across the gap)', () => {
    for (const r of [WILLOWMERE, ...REED]) {
      const room = new Room(r); room.gateClosed = false;
      for (const d of r.doors ?? []) {
        const o = { x: d.x + d.w / 2, y: d.y + d.h / 2, r: C.playerRadius };
        o.x = Math.min(Math.max(o.x, o.r), r.width - o.r); o.y = Math.min(Math.max(o.y, o.r), r.height - o.r);
        room.collide(o);
        const inside = o.x > d.x && o.x < d.x + d.w && o.y > d.y && o.y < d.y + d.h;
        expect(inside, `${r.id}:${d.id} is walled off`).toBe(true);
      }
    }
  });

  it('every spawn point is on dry ground, clear of walls and the door trigger', () => {
    for (const r of [WILLOWMERE, ...REED]) {
      const room = new Room(r);
      for (const d of r.doors ?? []) {
        expect(room.inPit(d.spawn.x, d.spawn.y, -14), `${r.id}:${d.id} spawn in water`).toBe(false);
        const o = { x: d.spawn.x, y: d.spawn.y, r: C.playerRadius };
        expect(room.collide(o), `${r.id}:${d.id} spawn in a wall`).toBe(false);
        const inside = d.spawn.x > d.x && d.spawn.x < d.x + d.w && d.spawn.y > d.y && d.spawn.y < d.y + d.h;
        expect(inside, `${r.id}:${d.id} spawn inside its own door`).toBe(false);
      }
    }
  });
});

describe('travel', () => {
  it('walking into a door enters the next room at the matching door, carrying hearts, pack and kit', () => {
    const sim = at(ROOMS['reedmarsh-1']!);
    sim.player.hp = 3; sim.pack.holes = 1; sim.pack.water = 0.6; sim.kit.mats.fluff = 7;
    const n = sim.room.def.doors!.find(d => d.id === 'n')!;
    sim.player.x = n.x + n.w / 2; sim.player.y = 22;
    sim.step(STEP, { moveX: 0, moveY: -1, aimX: 0, aimY: 0 });
    expect(sim.room.def.id).toBe('reedmarsh-2');
    const w = sim.room.def.doors!.find(d => d.id === 'w')!;
    expect(sim.player.x).toBe(w.spawn.x);
    expect(sim.player.hp).toBe(3);
    expect(sim.pack.holes).toBe(1);
    expect(sim.pack.water).toBeLessThan(0.61);
    expect(sim.kit.mats.fluff).toBe(7);
    expect(sim.drainEvents().some(e => e.type === 'room' && e.id === 'reedmarsh-2')).toBe(true);
  });

  it('a gated door stays shut until the bell rings, and the room remembers it was opened', () => {
    const sim = at(ROOMS['reedmarsh-3']!);
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    sim.player.x = e.spawn.x; sim.player.y = e.spawn.y;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.room.def.id).toBe('reedmarsh-3');            // gate blocks
    sim.room.gateClosed = false;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.room.def.id).toBe('reedmarsh-4');
    sim.enterRoom(ROOMS['reedmarsh-3']!, 'e');
    expect(sim.room.gateClosed).toBe(false);
  });

  it('dying in a world room revives at the door you came in through, hearts full, holes kept', () => {
    const sim = at(ROOMS['reedmarsh-2']!);
    sim.enterRoom(ROOMS['reedmarsh-2']!, 'e');
    sim.player.x = 1100; sim.player.y = 200; sim.pack.holes = 2;
    sim.player.hp = 1; sim.player.inv = 0; sim.hurtPlayer();
    run(sim, 1.2);
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    expect(sim.player.x).toBe(e.spawn.x);
    expect(sim.player.hp).toBe(C.maxHp);
    expect(sim.pack.holes).toBe(2);
  });

  it('falling in respawns at the last safe ground, not a fixed point', () => {
    const sim = at(ROOMS['reedmarsh-2']!);
    sim.player.x = 425; sim.player.y = 200; run(sim, 0.3);  // on island A
    expect(sim.lastSafe.x).toBeCloseTo(425, 0);
    sim.player.x = 520; sim.player.y = 200; sim.player.inv = 0;
    sim.step(STEP);
    expect(sim.player.x).toBeCloseTo(425, 0);
    expect(sim.player.hp).toBe(C.maxHp - 1);
  });

  it('the END door finishes the slice', () => {
    const sim = at(ROOMS['reedmarsh-6']!);
    sim.room.gateClosed = false;
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    sim.player.x = e.spawn.x; sim.player.y = e.spawn.y;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.won).toBe(true);
  });
});

describe('waking from the trance', () => {
  it('a beaten frog wakes, drops Reed Fiber, stops hurting, and hops off', () => {
    const sim = at(ROOMS['reedmarsh-1']!); fixRng(sim, 0.99);
    const f = sim.mkEnemy('frog', sim.player.x + 6, sim.player.y); sim.enemies.push(f);
    sim.damage(f, 99);
    expect(f.dead).toBe(false);
    expect(f.woke).toBeGreaterThan(0);
    expect(sim.items.some(i => i.mat === 'fluff')).toBe(true);
    sim.player.inv = 0;
    run(sim, 0.5);
    expect(sim.player.hp).toBe(C.maxHp);
    run(sim, 1.5);
    expect(sim.enemies.includes(f)).toBe(false);
  });

  it('Room 01 pests still poof', () => {
    const sim = new Sim({ seed: 2 });
    const b = sim.enemies.find(e => e.kind === 'bunny')!;
    sim.damage(b, 99);
    expect(b.dead).toBe(true);
    expect(b.woke).toBe(0);
  });
});

describe('Reedmarsh crossings', () => {
  it('Mooring Run: three post islands to the far shore', () => {
    const sim = at(ROOMS['reedmarsh-2']!); fixRng(sim, 0.99);
    expect(cross(sim, [262, 260], [420, 210])).toBe(420);
    expect(cross(sim, [470, 250], [600, 350])).toBe(600);
    expect(cross(sim, [650, 310], [790, 220])).toBe(790);
    expect(cross(sim, [840, 240], [1000, 310])).toBe(1000);
    expect(sim.player.x).toBeGreaterThan(960);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
    expect(sim.player.hp).toBe(C.maxHp);
  });

  it('Snapper Shallows: latch Old Snapper on the far bank and get dragged across', () => {
    const sim = at(ROOMS['reedmarsh-4']!); fixRng(sim, 0.99);
    const s = sim.mkEnemy('snapper', 610, 330); s.spd = 0; s.hp = s.max = 999; sim.enemies.push(s);
    cross(sim, [394, 330], [610, 330]);
    expect(sim.player.x).toBeGreaterThan(560);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
  });

  it('Lily Crossing needs the Braided Line', () => {
    const without = at(ROOMS['reedmarsh-6']!); fixRng(without, 0.99);
    expect(cross(without, [246, 320], [500, 285])).toBeUndefined();

    const sim = at(ROOMS['reedmarsh-6']!); fixRng(sim, 0.99);
    sim.kit.findLeash('braided');
    expect(cross(sim, [246, 320], [500, 285])).toBe(500);
    expect(cross(sim, [545, 300], [790, 380])).toBe(790);
    expect(cross(sim, [835, 370], [1090, 330])).toBe(1090);
    expect(sim.player.x).toBeGreaterThan(1020);
    expect(sim.player.hp).toBe(C.maxHp);
  });

  it('the tackle chest gives the Braided Line once', () => {
    const sim = at(ROOMS['reedmarsh-5']!);
    const c = sim.room.def.chest!;
    sim.player.x = c.x - 10; sim.player.y = c.y + 12;
    sim.step(STEP);
    expect(sim.kit.owned.has('braided')).toBe(true);
    expect(sim.kit.leash).toBe('braided');
    expect(sim.leashLen()).toBe(270);
    expect(sim.chestOpen()).toBe(true);
    sim.enterRoom(ROOMS['reedmarsh-4']!, 'n'); sim.enterRoom(ROOMS['reedmarsh-5']!, 'w');
    expect(sim.chestOpen()).toBe(true);
  });
});
