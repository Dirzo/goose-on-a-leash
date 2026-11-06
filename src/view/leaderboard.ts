/** The Infinite Basement's local leaderboard: the ten deepest runs, kept in this browser. */
export interface BasementRun { name: string; floor: number; kills: number; time: number; diff: string; at: number }

const STORE = 'goose-on-a-leash/basement', NAME = 'goose-on-a-leash/name';

export function loadBoard(): BasementRun[] {
  try {
    const a = JSON.parse(localStorage.getItem(STORE) ?? '[]') as unknown;
    return Array.isArray(a) ? a.filter((r): r is BasementRun => !!r && typeof r === 'object' && typeof (r as BasementRun).floor === 'number').slice(0, 10) : [];
  } catch { return []; }
}

/** Deeper first; then more critters beaten; then quicker. */
export const better = (a: BasementRun, b: BasementRun): number => b.floor - a.floor || b.kills - a.kills || a.time - b.time;

/** Add a run; returns its place (1-based), or 0 if it didn't make the board. */
export function recordRun(r: BasementRun): number {
  const board = [...loadBoard(), r].sort(better), place = board.indexOf(r) + 1;
  try { localStorage.setItem(STORE, JSON.stringify(board.slice(0, 10))); } catch { /* not kept */ }
  return place <= 10 ? place : 0;
}

export function playerName(): string { try { return localStorage.getItem(NAME) || 'Rocco'; } catch { return 'Rocco'; } }
export function setPlayerName(n: string): void { try { localStorage.setItem(NAME, n.slice(0, 16)); } catch { /* not kept */ } }
