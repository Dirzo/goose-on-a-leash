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

  pits(): Rect[] { return this.def.pits ?? (this.def.pit ? [this.def.pit] : []); }

  /** The pit rect containing (x, y), shrunk by `inset` (negative grows it), unless a bridge covers the point. */
  pitAt(x: number, y: number, inset = 4): Rect | null {
    for (const b of this.def.bridges ?? []) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return null;
    for (const p of this.pits()) {
      if (x > p.x + inset && x < p.x + p.w - inset && y > p.y + inset && y < p.y + p.h - inset) return p;
    }
    return null;
  }

  /** True when (x, y) is inside a pit, shrunk by `inset` on each side (negative grows it), and not on a bridge. */
  inPit(x: number, y: number, inset = 4): boolean { return this.pitAt(x, y, inset) !== null; }

  /** Which side of the first pit an x position is on. */
  pitSide(x: number): 'left' | 'right' {
    const p = this.pits()[0];
    return !p || x < p.x + p.w / 2 ? 'left' : 'right';
  }

  /** Nearest point just outside the pit containing (x, y), `margin` units from its edge. */
  bankPoint(x: number, y: number, margin = 14): { x: number; y: number } {
    const p = this.pitAt(x, y, 0) ?? this.pitAt(x, y, -margin);
    if (!p) return { x, y };
    const opts = [
      { d: x - p.x, x: p.x - margin, y }, { d: p.x + p.w - x, x: p.x + p.w + margin, y },
      { d: y - p.y, x, y: p.y - margin }, { d: p.y + p.h - y, x, y: p.y + p.h + margin },
    ].filter(o => !this.inPit(o.x, o.y, 0));
    opts.sort((a, b) => a.d - b.d);
    return opts[0] ?? { x, y };
  }

  /** True when (x, y) is in a shoreline refill zone. */
  inRefill(x: number, y: number): boolean {
    return (this.def.refills ?? []).some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
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
