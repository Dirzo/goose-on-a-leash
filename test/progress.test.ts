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

function reachable(def: RoomDef, leash: number, fromDoor: string | null): { doors: Set<string>; gateOpened: boolean } {
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
      if (def.bell && room.gateClosed && Math.hypot(def.bell.x - x, def.bell.y - y) < HONK_REACH + def.bell.r) gateOpened = true;
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
  return { doors, gateOpened };
}

/** The critical path: hub north, then each Reedmarsh room in order. */
const PATH: [string, string | null, string, boolean][] = [
  ['willowmere', null, 'north', false],
  ['reedmarsh-1', 's', 'n', false],
  ['reedmarsh-2', 'w', 'e', false],
  ['reedmarsh-3', 'w', 'e', false],
  ['reedmarsh-4', 'w', 'n', false],
  ['reedmarsh-5', 'w', 'e', false],
  ['reedmarsh-6', 'w', 'e', true],
  ['reedmarsh-7', 'w', 'e', true],
  ['reedmarsh-8', 'w', 'n', true],
  ['reedmarsh-9', 'w', 'e', true],
  ['reedmarsh-10', 'w', 'e', true],
  ['reedmarsh-11', 'w', 'e', true],
  ['reedmarsh-12', 'w', 'e', true],
  ['hollowbark-1', 'w', 'e', true],
  ['hollowbark-2', 'w', 'e', true],
  ['hollowbark-3', 'w', 'e', true],
  ['hollowbark-4', 'w', 'n', true],
  ['hollowbark-5', 'w', 'e', true],
  ['hollowbark-6', 'w', 'e', true],
  ['hollowbark-7', 'w', 'e', true],
  ['hollowbark-8', 'w', 'e', true],
];

describe('every room can be finished', () => {
  for (const [id, from, exit, braided] of PATH) {
    it(`${id}: from ${from ?? 'start'} to ${exit}`, () => {
      const def = ROOMS[id] ?? WILLOWMERE;
      const r = reachable(def, braided ? 270 : 230, from);
      expect([...r.doors], `${id} exits reached`).toContain(exit);
    });
  }

  it('Snapper Shallows can be crossed by the post alone, even if both Snappers are gone', () => {
    expect([...reachable(ROOMS['reedmarsh-4']!, 230, 'w').doors]).toContain('n');
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
