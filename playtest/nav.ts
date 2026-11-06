/**
 * Navigation for the playtest bot: a walk grid over the current room plus grapple edges (cast at a post, yank,
 * land beside it). Mirrors test/progress.test.ts so the bot can go wherever a player can. Rebuilt when the room,
 * the gate or the bushes change.
 */
import { C } from '../src/core/config';
import type { Sim } from '../src/core/sim';
import type { Vec } from '../src/core/math';

export const CELL = 16;

export interface Edge { to: number; cost: number; post?: Vec }

export class Nav {
  W = 0; H = 0;
  walk!: Uint8Array;
  /** Hazard cost per cell (fire bars, crushers, steam, embers, grease): humans steer round them. */
  hazard!: Float32Array;
  grapples = new Map<number, Edge[]>();
  key = '';

  constructor(private sim: Sim) {}

  private stateKey(): string {
    const r = this.sim.room;
    return `${r.def.id}|${r.gateClosed}|${r.bushAlive.map(b => (b ? 1 : 0)).join('')}|${this.sim.castMax().toFixed(0)}`;
  }

  /** Rebuild if anything that changes where Rocco can go has changed. `bushesPass` treats bramble bushes as open. */
  update(blockDoors: string[], bushesPass = false): void {
    const k = this.stateKey() + blockDoors.join(',') + bushesPass;
    if (k === this.key) return;
    this.key = k;
    const sim = this.sim, room = sim.room, def = room.def;
    const saved = room.bushAlive;
    if (bushesPass) { room.bushAlive = saved.map(() => false); room.dirty(); }
    this.W = Math.ceil(def.width / CELL); this.H = Math.ceil(def.height / CELL);
    this.walk = new Uint8Array(this.W * this.H); this.hazard = new Float32Array(this.W * this.H);
    const blocked = (def.doors ?? []).filter(d => blockDoors.includes(d.id));
    for (let cy = 0; cy < this.H; cy++) for (let cx = 0; cx < this.W; cx++) {
      const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
      let ok = x > C.playerRadius && y > C.playerRadius && x < def.width - C.playerRadius && y < def.height - C.playerRadius
        && !room.inPit(x, y, 4) && !room.collide({ x, y, r: C.playerRadius - 1 });
      if (ok) for (const d of blocked) if (x > d.x - 30 && x < d.x + d.w + 30 && y > d.y - 30 && y < d.y + d.h + 30) ok = false;
      this.walk[cy * this.W + cx] = ok ? 1 : 0;
    }
    if (bushesPass) { room.bushAlive = saved; room.dirty(); }
    // hazards: steer clear of fire bars, crusher pads, steam vents, ember spouts
    const addHaz = (x: number, y: number, r: number, cost: number) => {
      for (let cy = Math.max(0, Math.floor((y - r) / CELL)); cy <= Math.min(this.H - 1, Math.floor((y + r) / CELL)); cy++)
        for (let cx = Math.max(0, Math.floor((x - r) / CELL)); cx <= Math.min(this.W - 1, Math.floor((x + r) / CELL)); cx++)
          if (Math.hypot(cx * CELL + 8 - x, cy * CELL + 8 - y) < r) this.hazard[cy * this.W + cx] = (this.hazard[cy * this.W + cx] ?? 0) + cost;
    };
    for (const f of def.firebars ?? []) addHaz(f.x, f.y, f.n * 14 + 14, 6);
    for (const c of def.crushers ?? []) addHaz(c.x + c.w / 2, c.y + c.h / 2, c.w * 0.8, 5);
    for (const s of (def.steam ?? []) as { x: number; y: number; w?: number; h?: number }[]) addHaz(s.x + (s.w ?? 0) / 2, s.y + (s.h ?? 0) / 2, 40, 4);
    for (const e of (def.embers ?? []) as Vec[]) addHaz(e.x, e.y, 46, 4);
    // grapples: from any cell in reach of a post, a cast + yank lands beside it
    this.grapples.clear();
    const reach = sim.castMax() * 0.9;
    for (const p of def.posts) {
      const stop = p.r + C.playerRadius + 4;
      for (let cy = 0; cy < this.H; cy++) for (let cx = 0; cx < this.W; cx++) {
        const i = cy * this.W + cx;
        if (!this.walk[i]) continue;
        const x = cx * CELL + 8, y = cy * CELL + 8, d = Math.hypot(p.x - x, p.y - y);
        if (d < p.r + 40 || d > reach) continue;
        // Biscuit has to fly there: nothing solid in the way (walls, trunks, tall reeds)
        let clear = true;
        for (let k = 30; k < d - p.r - 14 && clear; k += 12) if (room.collideGoose({ x: x + ((p.x - x) / d) * k, y: y + ((p.y - y) / d) * k, r: C.gooseRadius })) clear = false;
        if (!clear) continue;
        const lx = p.x - ((p.x - x) / d) * stop, ly = p.y - ((p.y - y) / d) * stop;
        const j = this.cellOf(lx, ly);
        if (j < 0 || !this.walk[j] || j === i) continue;
        let list = this.grapples.get(i); if (!list) this.grapples.set(i, list = []);
        list.push({ to: j, cost: 140 + d * 0.3, post: { x: p.x, y: p.y } });
      }
    }
  }

  cellOf(x: number, y: number): number {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    return cx < 0 || cy < 0 || cx >= this.W || cy >= this.H ? -1 : cy * this.W + cx;
  }
  center(i: number): Vec { return { x: (i % this.W) * CELL + 8, y: Math.floor(i / this.W) * CELL + 8 }; }

  /** The nearest walkable cell to a point (the player may stand on the edge of a cell the grid calls blocked). */
  nearestWalk(x: number, y: number, max = 6): number {
    const c = this.cellOf(x, y);
    if (c >= 0 && this.walk[c]) return c;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= max; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H || !this.walk[ny * this.W + nx]) continue;
        const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = ny * this.W + nx; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Dijkstra from `from` to any cell for which `goal` is true. Returns the cells, with the grapple post on each grapple step. */
  path(from: number, goal: (i: number) => boolean, hazardCare = 1): { cells: number[]; posts: (Vec | undefined)[] } | null {
    if (from < 0) return null;
    const N = this.W * this.H, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const via: (Vec | undefined)[] = new Array(N);
    const heap: [number, number][] = [];
    const push = (d: number, i: number) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p]![0] <= heap[k]![0]) break; [heap[p], heap[k]] = [heap[k]!, heap[p]!]; k = p; } };
    const pop = (): [number, number] => {
      const top = heap[0]!, last = heap.pop()!;
      if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k]!, heap[m]!]; k = m; } }
      return top;
    };
    dist[from] = 0; push(0, from);
    let end = -1;
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]!) continue;
      if (goal(i)) { end = i; break; }
      const cx = i % this.W, cy = (i / this.W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
        const j = ny * this.W + nx;
        if (!this.walk[j]) continue;
        if (dx && dy && (!this.walk[cy * this.W + nx] || !this.walk[ny * this.W + cx])) continue;   // no corner cutting
        const nd = d + (dx && dy ? 22.6 : 16) * (1 + this.hazard[j]! * hazardCare);
        if (nd < dist[j]!) { dist[j] = nd; prev[j] = i; via[j] = undefined; push(nd, j); }
      }
      for (const e of this.grapples.get(i) ?? []) {
        const nd = d + e.cost;
        if (nd < dist[e.to]!) { dist[e.to] = nd; prev[e.to] = i; via[e.to] = e.post; push(nd, e.to); }
      }
    }
    if (end < 0) return null;
    const cells: number[] = [], posts: (Vec | undefined)[] = [];
    for (let i = end, n = 0; i >= 0 && n < N; i = prev[i]!, n++) { cells.push(i); posts.push(via[i]); if (i === from) break; }
    if (cells[cells.length - 1] !== from) throw new Error(`nav: broken path chain from ${from} to ${end}`);
    cells.reverse(); posts.reverse();
    return { cells, posts };
  }
}
