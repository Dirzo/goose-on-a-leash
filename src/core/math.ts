/** Small engine-free math helpers shared by the simulation. */

export interface Vec { x: number; y: number }
export interface Circle extends Vec { r: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const hypot = Math.hypot;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Signed smallest difference between two angles, in (-PI, PI]. */
export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Unit vector from `from` toward `to` (or +x when they coincide). */
export function dirTo(from: Vec, to: Vec): [number, number, number] {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [1, 0, 0];
  return [dx / d, dy / d, d];
}

export function inRect(x: number, y: number, r: Rect): boolean {
  return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
}

/** Seedable PRNG (mulberry32). Returns floats in [0, 1). */
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
