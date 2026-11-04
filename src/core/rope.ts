import { C } from './config';
import type { Vec } from './math';

export interface RopePoint { x: number; y: number; px: number; py: number }

/**
 * Inextensible Verlet rope between the janitor (point 0) and the goose (point N).
 * Segments may go slack but never stretch past length / N.
 */
export class Rope {
  readonly points: RopePoint[];
  constructor(start: Vec, readonly segments: number = C.ropeSegments) {
    this.points = Array.from({ length: segments + 1 }, () => ({ x: start.x, y: start.y, px: start.x, py: start.y }));
  }

  get head(): RopePoint { return this.points[0]!; }
  get tail(): RopePoint { return this.points[this.segments]!; }

  reset(at: Vec): void {
    for (const p of this.points) { p.x = p.px = at.x; p.y = p.py = at.y; }
  }

  /**
   * Advance one step.
   * @param anchor the janitor's hand, or null when the leash is dropped (the head then trails freely)
   * @param goose the goose's neck, always attached
   * @param length total leash length
   */
  step(anchor: Vec | null, goose: Vec, length: number): void {
    const seg = length / this.segments;
    const pts = this.points;
    for (const p of pts) {
      // Guard against non-finite state ever entering the rope.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { p.x = p.px = goose.x; p.y = p.py = goose.y; }
      const vx = (p.x - p.px) * C.ropeDamping, vy = (p.y - p.py) * C.ropeDamping;
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy;
    }
    const attached = anchor !== null;
    for (let it = 0; it < C.ropeIterations; it++) {
      if (anchor) { this.head.x = anchor.x; this.head.y = anchor.y; }
      this.tail.x = goose.x; this.tail.y = goose.y;
      for (let i = 0; i < this.segments; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d <= seg || d < 1e-9) continue;
        const diff = (d - seg) / d / 2;
        const aFix = i === 0 && attached, bFix = i + 1 === this.segments;
        if (aFix && bFix) continue;
        if (aFix) { b.x -= dx * diff * 2; b.y -= dy * diff * 2; }
        else if (bFix) { a.x += dx * diff * 2; a.y += dy * diff * 2; }
        else { a.x += dx * diff; a.y += dy * diff; b.x -= dx * diff; b.y -= dy * diff; }
      }
    }
    if (anchor) { this.head.x = anchor.x; this.head.y = anchor.y; }
  }
}
