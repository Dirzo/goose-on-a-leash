/**
 * Local playtest analytics. Nothing leaves the browser: counts are kept in localStorage and can be
 * exported as JSON from the bench ("Playtest stats"), so a tester can paste them into a bug report.
 *   deaths: Bimbo fainted / Rocco knocked out, per room     snaps: the leash snapped, per room
 *   crafts: leashes and breads crafted                       time: seconds spent per room
 *   quits: the room the tab was closed or hidden in         rooms: arrivals per room
 */
export interface Stats {
  v: 1; since: number; deaths: Record<string, number>; snaps: Record<string, number>; crafts: Record<string, number>;
  time: Record<string, number>; quits: Record<string, number>; rooms: Record<string, number>; basementBest: number;
}
const STORE = 'goose-on-a-leash/stats';
const fresh = (): Stats => ({ v: 1, since: Date.now(), deaths: {}, snaps: {}, crafts: {}, time: {}, quits: {}, rooms: {}, basementBest: 0 });

function load(): Stats {
  try { const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Stats | null; if (s && s.v === 1) return { ...fresh(), ...s }; } catch { /* fresh */ }
  return fresh();
}
export const STATS: Stats = load();
let dirty = false;
const save = () => { if (!dirty) return; dirty = false; try { localStorage.setItem(STORE, JSON.stringify(STATS)); } catch { /* not kept */ } };
setInterval(save, 5000);

export function count(kind: 'deaths' | 'snaps' | 'crafts' | 'quits' | 'rooms', key: string, n = 1): void {
  STATS[kind][key] = (STATS[kind][key] ?? 0) + n; dirty = true;
}
export function addTime(room: string, dt: number): void { STATS.time[room] = (STATS.time[room] ?? 0) + dt; dirty = true; }
export function basementRun(floor: number): void { if (floor > STATS.basementBest) { STATS.basementBest = floor; dirty = true; } }

/** Remember where a session stopped: the last room when the tab is hidden or closed. */
export function trackQuits(room: () => string): void {
  const quit = () => { count('quits', room()); save(); };
  window.addEventListener('pagehide', quit);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}

export function exportStats(): string { save(); return JSON.stringify(STATS, null, 1); }
export function resetStats(): void { Object.assign(STATS, fresh()); dirty = true; save(); }

/** Top rooms by a count, for the bench summary. */
export function top(kind: 'deaths' | 'snaps' | 'time' | 'quits', n = 3): [string, number][] {
  return Object.entries(STATS[kind]).sort((a, b) => b[1] - a[1]).slice(0, n);
}
