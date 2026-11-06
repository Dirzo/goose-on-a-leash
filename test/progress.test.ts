/**
 * Can every room actually be finished? A flood fill over walkable ground from the entry door, adding the
 * moves Rocco has: walking, fling-and-yank to any post in leash range (landing where the pull stops), and
 * honking the bell to open the gate. Each exit door must be reachable. No critters needed (they may wander off).
 */
import { describe, expect, it } from 'vitest';
import { C } from '../src/core/config';
import { Room } from '../src/core/room';
import { ROOMS, WILLOWMERE, type RoomDef } from '../src/data/rooms';

const CELL = 8;
const HONK_REACH = 155 * (0.85 + 0.15 * 2) + 30;   // base honk range at Goose Power 2, plus the bell's slack

function reachable(def: RoomDef, leash: number, fromDoor: string | null): { doors: Set<string>; gateOpened: boolean; at: (x: number, y: number) => boolean } {
  const room = new Room(def);
  room.bushAlive = room.bushAlive.map(() => false);   // Biscuit can chew through any bush he can be flung at
  room.dirty();
  const W = Math.ceil(def.width / CELL), H = Math.ceil(def.height / CELL);
  const seen = new Uint8Array(W * H);
  const walk = (x: number, y: number) => {
    if (x < C.playerRadius || y < C.playerRadius || x > def.width - C.playerRadius || y > def.height - C.playerRadius) return false;
    if (room.inPit(x, y, 6)) return false;
    const o = { x, y, r: C.playerRadius - 2 };
    return !room.collide(o);
  };
  const start = fromDoor ? def.doors!.find(d => d.id === fromDoor)!.spawn : def.playerStart;
  const queue: [number, number][] = [];
  const push = (x: number, y: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || seen[cy * W + cx]) return;
    if (!walk(cx * CELL + CELL / 2, cy * CELL + CELL / 2)) return;
    seen[cy * W + cx] = 1; queue.push([cx, cy]);
  };
  let gateOpened = false;
  const acorns = def.lightKind === 'squirrel' || def.enemies.some(e => e.kind === 'squirrel');
  const flood = () => {
    while (queue.length) {
      const [cx, cy] = queue.pop()!;
      const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
      push(x + CELL, y); push(x - CELL, y); push(x, y + CELL); push(x, y - CELL);
      for (const p of def.posts) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < p.r + 34 || d > leash - 8) continue;
        const stop = p.r + C.playerRadius + 4;
        push(p.x - ((p.x - x) / d) * stop, p.y - ((p.y - y) / d) * stop);
      }
      if (def.bell && room.gateClosed) {
        // a chime only rings from a batted-back acorn: needs squirrels throwing, and Rocco within a parry's reach
        const reach = def.bell.parryOnly ? (acorns ? C.parryRange : -1) : HONK_REACH + def.bell.r;
        if (Math.hypot(def.bell.x - x, def.bell.y - y) < reach) gateOpened = true;
      }
    }
  };
  push(start.x, start.y);
  flood();
  if (def.boss) gateOpened = true;                 // beating the boss opens the way
  if (gateOpened && room.gateClosed) {
    room.gateClosed = false;
    // re-flood from everything reached so far, now the gate is open
    for (let i = 0; i < W * H; i++) if (seen[i]) queue.push([i % W, Math.floor(i / W)]);
    flood();
  }
  const doors = new Set<string>();
  for (const d of def.doors ?? []) {
    for (let x = d.x; x <= d.x + d.w; x += 4) for (let y = d.y; y <= d.y + d.h; y += 4) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && seen[cy * W + cx]) doors.add(d.id);
    }
    // the door trigger sits in the gap at the edge; standing just inside it counts
    const ix = d.spawn.x + (d.x + d.w / 2 - d.spawn.x) * 0.7, iy = d.spawn.y + (d.y + d.h / 2 - d.spawn.y) * 0.7;
    if (seen[Math.floor(iy / CELL) * W + Math.floor(ix / CELL)]) doors.add(d.id);
  }
  const at = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const cx = Math.floor(x / CELL) + dx, cy = Math.floor(y / CELL) + dy;
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && seen[cy * W + cx]) return true;
    }
    return false;
  };
  return { doors, gateOpened, at };
}
const reachableCells = (def: RoomDef, leash: number, from: string) => reachable(def, leash, from).at;

/** The critical path: hub north, then each Reedmarsh room in order. */
const PATH: [string, string | null, string, boolean][] = [
  ['willowmere', null, 'north', false],
  ['reedmarsh-1', 's', 'e', false],
  ['reedmarsh-2', 'w', 'e', true],          // the Braided Line is found inside (see below)
  ['reedmarsh-3', 'w', 'e', true],
  ['reedmarsh-4', 'w', 'e', true],
  ['reedmarsh-5', 'w', 'e', true],
  ['hollowbark-1', 'w', 'e', true],
  ['hollowbark-2', 'w', 'e', true],
  ['hollowbark-3', 'w', 'e', true],
  ['hollowbark-4', 'w', 'e', true],
];
/** Driftwood Wharf is crossed with the power cast: posts within a full cast of the starting line. */
const WHARF: [string, string, string][] = [
  ['driftwood-1', 'w', 'e'], ['driftwood-2', 'w', 'e'], ['driftwood-3', 'w', 'e'], ['driftwood-4', 'w', 'e'],
  ['tide-1', 'w', 'e'],
];
const CAST = 230 * C.castReachMul;

describe('every room can be finished', () => {
  for (const [id, from, exit, braided] of PATH) {
    it(`${id}: from ${from ?? 'start'} to ${exit}`, () => {
      const def = ROOMS[id] ?? WILLOWMERE;
      const r = reachable(def, braided ? 270 : 230, from);
      expect([...r.doors], `${id} exits reached`).toContain(exit);
    });
  }

  for (const [id, from, exit] of WHARF) {
    it(`${id}: from ${from} to ${exit} and back, casting`, () => {
      const def = ROOMS[id]!;
      expect([...reachable(def, CAST, from).doors], `${id} exits`).toContain(exit);
      expect([...reachable(def, CAST, exit).doors], `${id} back`).toContain(from);
    });
  }

  it('Moonlit Cove: every fishing spot can be reached (the Far Rock by grapple), and you can get back', () => {
    const def = ROOMS['tide-2']!, at = reachableCells(def, CAST, 'w');
    for (const s of def.fishing!.spots) expect(at(s.x, s.y), s.name).toBe(true);
  });

  it('the sandbar feather in the harbour needs the Spinning Reel', () => {
    const def = ROOMS['driftwood-2']!, f = def.feathers![0]!;
    expect(reachableCells(def, (230 + 50) * C.castReachMul, 'w')(f.x, f.y)).toBe(false);
    expect(reachableCells(def, 230 * (C.castReachMul + C.reelReach), 'w')(f.x, f.y)).toBe(true);
  });

  it('the Braided Line chest can be reached with the starting line', () => {
    const def = ROOMS['reedmarsh-2']!;
    const room = reachableCells(def, 230, 'w');
    expect(room(def.chest!.x, def.chest!.y + 24)).toBe(true);
  });

  it('and you can always get back: each room returns to the door you came in by', () => {
    for (const [id, from, exit, braided] of PATH) {
      if (!from) continue;
      const def = ROOMS[id]!;
      const r = reachable(def, braided ? 270 : 230, exit === 'north' ? null : exit);
      expect([...r.doors], `${id}: back from ${exit}`).toContain(from);
    }
  });
});
