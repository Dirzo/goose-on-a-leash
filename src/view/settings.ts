/**
 * Player settings that live outside the save: accessibility toggles and the key map.
 * Stored in localStorage; every read survives storage being unavailable.
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'honk' | 'roll' | 'yank' | 'letGo' | 'feed' | 'cycle' | 'patch' | 'guard' | 'book' | 'journal' | 'pack' | 'reset';

export const ACTION_NAMES: Record<Action, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', honk: 'Honk', roll: 'Roll',
  yank: 'Yank', letGo: 'Let go', feed: 'Feed bread', cycle: 'Swap bread', patch: 'Patch pack', guard: 'Oar guard',
  book: 'Recipe book', journal: 'Fish journal', pack: 'Backpack', reset: 'Restart room',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'w', down: 's', left: 'a', right: 'd', honk: ' ', roll: 'shift', yank: 'e', letGo: 'q', feed: 'f', cycle: 'c',
  patch: 'p', guard: 'g', book: 'b', journal: 'j', pack: 'i', reset: 'r',
};

export interface Settings {
  /** Camera shake on hits, snaps and slams. */
  shake: boolean;
  /** Full-screen red hurt flashes and white snap flashes. */
  flashes: boolean;
  /** Line strain shown with stripes and words as well as red/amber. */
  colourSafe: boolean;
  keys: Record<Action, string>;
}

const STORE = 'goose-on-a-leash/settings';

function load(): Settings {
  const s: Settings = { shake: true, flashes: true, colourSafe: false, keys: { ...DEFAULT_KEYS } };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Settings>;
    if (typeof raw.shake === 'boolean') s.shake = raw.shake;
    if (typeof raw.flashes === 'boolean') s.flashes = raw.flashes;
    if (typeof raw.colourSafe === 'boolean') s.colourSafe = raw.colourSafe;
    for (const a of Object.keys(DEFAULT_KEYS) as Action[]) { const k = raw.keys?.[a]; if (typeof k === 'string' && k) s.keys[a] = k; }
  } catch { /* defaults */ }
  return s;
}

export const SETTINGS: Settings = load();

export function saveSettings(): void { try { localStorage.setItem(STORE, JSON.stringify(SETTINGS)); } catch { /* not kept */ } }

/** The action a key is bound to (arrows always move; Tab always opens the pack). */
export function actionFor(key: string): Action | null {
  if (key === 'arrowup') return 'up'; if (key === 'arrowdown') return 'down'; if (key === 'arrowleft') return 'left'; if (key === 'arrowright') return 'right';
  if (key === 'tab') return 'pack';
  for (const a of Object.keys(SETTINGS.keys) as Action[]) if (SETTINGS.keys[a] === key) return a;
  return null;
}

/** Bind a key, swapping it off any action that already had it. */
export function bind(action: Action, key: string): void {
  for (const a of Object.keys(SETTINGS.keys) as Action[]) if (a !== action && SETTINGS.keys[a] === key) SETTINGS.keys[a] = SETTINGS.keys[action];
  SETTINGS.keys[action] = key; saveSettings();
}

export function keyLabel(k: string): string { return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0]!.toUpperCase() + k.slice(1); }
