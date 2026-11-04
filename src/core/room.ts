import type { RoomDef } from '../data/rooms';
import type { Circle, Rect } from './math';

/** Live room state: the static definition plus what changes (gate, bell). */
export class Room {
  gateClosed: boolean;
  constructor(readonly def: RoomDef) {
    this.gateClosed = def.gate !== null;
  }

  solids(): Rect[] {
    return this.gateClosed && this.def.gate ? [...this.def.walls, this.def.gate] : this.def.walls;
  }

  /** True when (x, y) is inside the pit, shrunk by `inset` on each side (negative grows it). */
  inPit(x: number, y: number, inset = 4): boolean {
    const p = this.def.pit;
    if (!p) return false;
    return x > p.x + inset && x < p.x + p.w - inset && y > p.y + inset && y < p.y + p.h - inset;
  }

  /** Which side of the pit an x position is on. */
  pitSide(x: number): 'left' | 'right' {
    const p = this.def.pit;
    return !p || x < p.x + p.w / 2 ? 'left' : 'right';
  }

  /** Push a circle out of every solid. Returns true if it touched one. */
  collide(o: Circle): boolean {
    let hit = false;
    for (const r of this.solids()) {
      const cx = Math.max(r.x, Math.min(o.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(o.y, r.y + r.h));
      const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
      if (d < o.r) {
        hit = true;
        if (d > 0.001) { o.x = cx + (dx / d) * o.r; o.y = cy + (dy / d) * o.r; }
        else o.y = r.y - o.r;
      }
    }
    return hit;
  }
}
