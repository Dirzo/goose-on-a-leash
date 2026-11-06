/** Room travel, room memory, waking critters and the Reedmarsh crossings. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { ROOMS, WILLOWMERE, type RoomDef } from '../src/data/rooms';
import { Room } from '../src/core/room';
import { fixRng, run, LAYOUT } from './helpers';

const REED = Object.values(ROOMS).filter(r => r.id.startsWith('reedmarsh-'));
const WORLD = Object.values(ROOMS).filter(r => r.id !== 'room-01');

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
  it('Reedmarsh is five big areas holding all twelve rooms', () => {
    expect(REED.length).toBe(5);
    expect(REED.flatMap(r => r.zones ?? []).length).toBe(12);
  });

  it('every door leads to a real door that leads back', () => {
    for (const r of WORLD) for (const d of r.doors ?? []) {
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
    for (const r of WORLD) {
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
    for (const r of WORLD) {
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
    sim.room.gateClosed = false;
    sim.player.hp = 3; sim.pack.holes = 1; sim.pack.water = 0.6; sim.kit.mats.fluff = 7;
    const n = sim.room.def.doors!.find(d => d.id === 'e')!;
    sim.player.x = n.x + n.w / 2 - 10; sim.player.y = n.y + n.h / 2;
    for (let i = 0; i < 10 && sim.room.def.id === 'reedmarsh-1'; i++) sim.step(STEP, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
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
    const sim = at(ROOMS['reedmarsh-1']!);
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    sim.player.x = e.spawn.x; sim.player.y = e.spawn.y;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.room.def.id).toBe('reedmarsh-1');            // gate blocks
    sim.room.gateClosed = false;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.room.def.id).toBe('reedmarsh-2');
    sim.enterRoom(ROOMS['reedmarsh-1']!, 'e');
    expect(sim.room.gateClosed).toBe(false);
  });

  it('Bimbo fainting in a world room revives at the door you came in through, pack refilled', () => {
    const sim = at(LAYOUT['reedmarsh-2']!);
    sim.enterRoom(LAYOUT['reedmarsh-2']!, 'e');
    sim.player.x = 1100; sim.player.y = 200; sim.pack.holes = 1;
    sim.pack.water = 0.0001;
    run(sim, 1.5);
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    expect(sim.player.x).toBe(e.spawn.x);
    expect(sim.pack.water).toBeGreaterThan(0.95);
    expect(sim.pack.holes).toBe(1);
  });

  it('no critter starts next to a grappling post', () => {
    for (const r of WORLD) for (const e of r.enemies) for (const p of r.posts) {
      if (r.id === 'reedmarsh-2' && e.kind === 'snapper') continue;   // he is the grapple there
      expect(Math.hypot(e.x - p.x, e.y - p.y), `${r.id}: ${e.kind} at ${e.x},${e.y}`).toBeGreaterThanOrEqual(130);
    }
  });

  it('falling in respawns at the last safe ground, not a fixed point', () => {
    const sim = at(LAYOUT['reedmarsh-2']!);
    sim.player.x = 425; sim.player.y = 200; run(sim, 0.3);  // on island A
    expect(sim.lastSafe.x).toBeCloseTo(425, 0);
    sim.player.x = 520; sim.player.y = 200; sim.player.inv = 0;
    sim.step(STEP);
    expect(sim.player.x).toBeCloseTo(425, 0);
  });

  it('the END door finishes the slice', () => {
    const sim = at(ROOMS['driftwood-4']!);
    sim.room.gateClosed = false;
    const e = sim.room.def.doors!.find(d => d.id === 'e')!;
    sim.player.x = e.spawn.x; sim.player.y = e.spawn.y;
    run(sim, 1, { moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.won).toBe(true);
  });
});

describe('waking from the trance', () => {
  it('a beaten frog wakes, drops Reed Fiber, stops hurting, and hops off', () => {
    const sim = at(LAYOUT['reedmarsh-1']!); fixRng(sim, 0.99);
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
    const sim = at(LAYOUT['reedmarsh-2']!); fixRng(sim, 0.99);
    expect(cross(sim, [262, 260], [420, 210])).toBe(420);
    expect(cross(sim, [470, 250], [600, 350])).toBe(600);
    expect(cross(sim, [650, 310], [790, 220])).toBe(790);
    expect(cross(sim, [840, 240], [1000, 310])).toBe(1000);
    expect(sim.player.x).toBeGreaterThan(960);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
    expect(sim.player.hp).toBe(C.maxHp);
  });

  it('Snapper Shallows: latch Old Snapper on the far bank and get dragged across', () => {
    const sim = at(LAYOUT['reedmarsh-4']!); fixRng(sim, 0.99);
    const s = sim.mkEnemy('snapper', 610, 330); s.spd = 0; s.hp = s.max = 999; sim.enemies.push(s);
    cross(sim, [394, 330], [610, 330]);
    expect(sim.player.x).toBeGreaterThan(560);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
  });

  it('Lily Crossing needs the Braided Line', () => {
    const without = at(LAYOUT['reedmarsh-6']!); fixRng(without, 0.99);
    expect(cross(without, [246, 320], [500, 285])).toBeUndefined();

    const sim = at(LAYOUT['reedmarsh-6']!); fixRng(sim, 0.99);
    sim.kit.findLeash('braided');
    expect(cross(sim, [246, 320], [500, 285])).toBe(500);
    expect(cross(sim, [545, 300], [790, 380])).toBe(790);
    expect(cross(sim, [835, 370], [1090, 330])).toBe(1090);
    expect(sim.player.x).toBeGreaterThan(1020);
    expect(sim.player.hp).toBe(C.maxHp);
  });

  it('the tackle chest gives the Braided Line once', () => {
    const sim = at(LAYOUT['reedmarsh-5']!);
    const c = sim.room.def.chest!;
    sim.player.x = c.x - 10; sim.player.y = c.y + 12;
    sim.step(STEP);
    expect(sim.kit.owned.has('braided')).toBe(true);
    expect(sim.kit.leash).toBe('braided');
    expect(sim.leashLen()).toBe(270);
    expect(sim.chestOpen()).toBe(true);
    sim.enterRoom(LAYOUT['reedmarsh-4']!, 'n'); sim.enterRoom(LAYOUT['reedmarsh-5']!, 'w');
    expect(sim.chestOpen()).toBe(true);
  });
});

describe('Reedmarsh part two', () => {
  it('Snapper Run: a Snapper that charges over the bank splashes in, swims back, and climbs out', () => {
    const sim = at(LAYOUT['reedmarsh-9']!); fixRng(sim, 0.5);
    const s = sim.mkEnemy('snapper', 600, 300); sim.enemies.push(s);
    s.mode = 'charge'; s.attack = 'charge'; s.modeT = 0; s.vx = 0; s.vy = 330; s.hit = true;
    let swam = false;
    for (let i = 0; i < 60 * 8; i++) { sim.step(STEP); if ((s.mode as string) === 'swim') swam = true; }
    expect(swam).toBe(true);
    expect(s.dead).toBe(false); expect(s.falling).toBe(0);
    expect(sim.room.inPit(s.x, s.y, 2)).toBe(false);         // back on land
  });

  it('a frog that leaps into the water swims back instead of dying', () => {
    const sim = at(LAYOUT['reedmarsh-7']!);
    const f = sim.mkEnemy('frog', 640, 225); sim.enemies.push(f);
    f.x = 700; f.y = 200; f.vx = 0; f.vy = 0;                // in the water off the island
    let swam = false;
    for (let i = 0; i < 60 * 6; i++) { sim.step(STEP); if (f.mode === 'swim') swam = true; }
    expect(swam).toBe(true);
    expect(sim.enemies.includes(f)).toBe(true);
    expect(f.dead).toBe(false);
    expect(sim.room.inPit(f.x, f.y, 2)).toBe(false);
  });

  it('a hit never knocks Rocco off a boardwalk into the water', () => {
    const sim = at(LAYOUT['reedmarsh-7']!); fixRng(sim, 0.99);
    sim.player.x = 360; sim.player.y = 315; sim.player.inv = 0;   // on the first boardwalk
    sim.hurtPlayer(1, true, { x: 360, y: 290 });                  // hit from the north: pushed south, toward water
    run(sim, 0.5);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
  });

  it('Bell Islands: the bell can be honked from the first island', () => {
    const sim = at(LAYOUT['reedmarsh-10']!);
    sim.player.x = 505; sim.player.y = 265; sim.goose.x = 495; sim.goose.y = 265; sim.goose.state = 'held';
    sim.honk({ x: 670, y: 320 });
    expect(sim.room.gateClosed).toBe(false);
  });

  it("Heron's Approach: fling-yank over both gaps in the boardwalk", () => {
    const sim = at(LAYOUT['reedmarsh-11']!); fixRng(sim, 0.99);
    expect(cross(sim, [414, 305], [600, 305])).toBe(600);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
    expect(cross(sim, [754, 305], [940, 305])).toBe(940);
    expect(sim.player.x).toBeGreaterThan(900);
    expect(sim.room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
  });
});

describe('the Heron Ferryman', () => {
  function pool(seed = 9): Sim {
    const sim = new Sim({ room: WILLOWMERE, seed });
    sim.kit.findLeash('braided');
    sim.enterRoom(LAYOUT['reedmarsh-12']!, 'w');
    sim.drainEvents();
    return sim;
  }

  it('fights from his rock and from the air: darts, gusts or calls, then flies up, slams down by Bimbo, and flies home', () => {
    const sim = pool();
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    const seen = new Set<string>();
    let landedOnBank = false, maxAir = 0;
    sim.player.x = 360; sim.player.y = 350;
    for (let i = 0; i < 60 * 45; i++) {
      sim.pack.water = 1; sim.pack.holes = 0; sim.player.dead = 0;   // keep Rocco up so we can watch
      sim.step(STEP, { moveX: 0, moveY: 0, aimX: 605, aimY: 360 });
      seen.add(h.mode); maxAir = Math.max(maxAir, h.air);
      if (h.mode === 'grounded' && !sim.room.inPit(h.x, h.y, 2) && Math.hypot(h.x - 605, h.y - 360) > 100) landedOnBank = true;
    }
    expect(h.falling).toBe(0); expect(h.dead).toBe(false);
    expect(seen.has('darts')).toBe(true);
    expect(seen.has('fly')).toBe(true);
    expect(maxAir).toBeGreaterThan(100);
    expect(landedOnBank).toBe(true);
    expect(seen.has('return')).toBe(true);
  });

  it('cannot be bitten while he is up in the air', () => {
    const sim = pool();
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    h.mode = 'fly'; h.air = 120; h.x = 420; h.y = 350; h.tx = 420; h.ty = 350;
    expect(sim.nearestEnemy(420, 350)).toBeNull();
  });

  it('his slam lands hard if Bimbo is under it', () => {
    const sim = pool(); fixRng(sim, 0.99);
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    sim.player.x = 300; sim.player.y = 350; sim.player.inv = 0;
    sim.step(STEP, { moveX: 0, moveY: 0, aimX: 600, aimY: 350 });
    const b = sim.packPoint(10);
    h.mode = 'slam'; h.air = 10; h.tx = b.x; h.ty = b.y; h.hit = false; sim.player.inv = 0;
    sim.step(STEP, { moveX: 0, moveY: 0, aimX: 600, aimY: 350 });
    expect(sim.pack.water).toBeLessThan(1 - C.heavySpill + 0.03);
    expect(h.mode).toBe('grounded');
  });

  it('rain puddles slow Rocco down', () => {
    const fast = pool(), slow = pool();
    for (const s of [fast, slow]) { s.enemies = []; s.puddles = []; s.player.x = 200; s.player.y = 350; }
    slow.puddles.push({ x: 260, y: 350, r: 80, life: 99, max: 80 });
    const go = { moveX: 1, moveY: 0, aimX: 900, aimY: 350 };
    run(fast, 0.5, go); run(slow, 0.5, go);
    expect(slow.player.x - 200).toBeLessThan((fast.player.x - 200) * 0.7);
  });

  it('in the storm the pack refills slowly and drains faster', () => {
    const sim = pool();
    sim.enemies.find(e => e.kind === 'heron')!.cd = 999;
    const spot = LAYOUT['reedmarsh-12']!.refills![0]!;
    sim.player.x = spot.x + spot.w / 2; sim.player.y = spot.y + spot.h / 2; sim.pack.water = 0.2;
    run(sim, 1);
    expect(sim.pack.water).toBeLessThan(0.2 + C.refillRate * 0.5);
    expect(sim.storming).toBe(true);
  });

  it('beaten, his gifts go straight into the satchel', () => {
    const sim = pool();
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    const crest = sim.kit.mats.crest, needles = sim.pack.needles;
    sim.damage(h, 999);
    expect(sim.kit.mats.crest).toBe(crest + 1);
    expect(sim.pack.needles).toBe(needles + C.kitNeedles);
    expect(sim.pack.water).toBe(1);
    expect(sim.storming).toBe(false);
  });

  it('a feather dart landing on Bimbo hurts; one landing elsewhere does not', () => {
    const sim = pool(); fixRng(sim, 0.99);
    sim.enemies = [];
    sim.player.x = 300; sim.player.y = 350; sim.step(STEP, { moveX: 0, moveY: 0, aimX: 600, aimY: 350 });
    sim.player.inv = 0;
    const b = sim.packPoint(10);
    sim.darts.push({ x0: 605, y0: 320, tx: 200, ty: 200, t: 0, T: 0.1 });
    run(sim, 0.2, { moveX: 0, moveY: 0, aimX: 600, aimY: 350 });
    expect(sim.pack.water).toBeGreaterThan(0.99);
    sim.darts.push({ x0: 605, y0: 320, tx: b.x, ty: b.y, t: 0, T: 0.1 });
    run(sim, 0.2, { moveX: 0, moveY: 0, aimX: 600, aimY: 350 });
    expect(sim.pack.water).toBeLessThan(0.97);
  });

  it('shakes Biscuit off after a while', () => {
    const sim = pool();
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    sim.goose.state = 'latched'; sim.goose.target = h; sim.goose.ox = -1; sim.goose.oy = 0;
    sim.player.x = 380; sim.player.y = 350;
    run(sim, 2.2, { moveX: 0, moveY: 0, aimX: 605, aimY: 360 });
    expect(sim.goose.state).not.toBe('latched');
  });

  it('beaten, he wakes as the Ferryman, stays, opens the way, and is remembered', () => {
    const sim = pool();
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    expect(sim.room.gateClosed).toBe(true);
    sim.damage(h, 999);
    expect(h.woke).toBeGreaterThan(0);
    expect(sim.room.gateClosed).toBe(false);
    run(sim, 5);
    expect(sim.enemies.includes(h)).toBe(true);
    sim.enterRoom(LAYOUT['reedmarsh-11']!, 'e'); sim.enterRoom(LAYOUT['reedmarsh-12']!, 'w');
    expect(sim.room.gateClosed).toBe(false);
    expect(sim.enemies.find(e => e.kind === 'heron')!.woke).toBeGreaterThan(0);
  });

  it('can be fought from the bank with the Braided Line', () => {
    const sim = pool(); fixRng(sim, 0.99);
    const h = sim.enemies.find(e => e.kind === 'heron')!; h.cd = 999;
    sim.player.x = 374; sim.player.y = 350; sim.goose.state = 'held'; sim.goose.x = 360; sim.goose.y = 350;
    const f = (o: object = {}) => sim.step(STEP, { moveX: 0, moveY: 0, aimX: 605, aimY: 360, ...o });
    for (let i = 0; i < 10; i++) f();
    f({ fling: true }); for (let i = 0; i < 40; i++) f();
    expect(sim.goose.target).toBe(h);
    expect(h.hp).toBeLessThan(h.max);
  });
});
