/**
 * Save games. A save is taken on arrival in each room: where Rocco is, his hearts, the pack, the
 * satchel and leash rack, and what each room remembers. It round-trips through localStorage and through
 * a copyable export code (base64 JSON). Engine-free, so tests cover it.
 */
import { ROOMS } from '../data/rooms';
import { BREADS, ITEMS, LEASHES, type BreadId, type ItemId, type LeashId } from '../data/recipes';
import { C } from './config';
import { TRAITS, type TraitId } from '../data/traits';
import type { RoomMemory, Sim } from './sim';

export const SAVE_KEY = 'goose-on-a-leash/save/v1';

export interface SaveData {
  v: 2;
  room: string;
  door: string | null;
  hp: number;
  pack: { water: number; holes: number; patches: number; needles: number };
  kit: { mats: Partial<Record<ItemId, number>>; owned: LeashId[]; leash: LeashId; bread: Partial<Record<BreadId, number>>; active: BreadId; toothFirst: boolean; traits?: TraitId[]; oar?: boolean };
  world: Record<string, RoomMemory>;
  savedAt: number;
}

export function snapshotSave(sim: Sim): SaveData {
  const k = sim.kit;
  return {
    v: 2, room: sim.room.def.id, door: sim.entryDoor, hp: sim.player.hp,
    pack: { water: sim.pack.water, holes: sim.pack.holes, patches: sim.pack.patches, needles: sim.pack.needles },
    kit: { mats: { ...k.mats }, owned: [...k.owned], leash: k.leash, bread: { ...k.bread }, active: k.active, toothFirst: k.toothFirst, traits: [...k.traits], oar: k.oar },
    world: structuredClone({ ...sim.world }),
    savedAt: Date.now(),
  };
}

const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

/** Check and clean untrusted save data (from storage or a pasted code). Returns null if it is not a usable save. */
export function validateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (d.v !== 2 || typeof d.room !== 'string' || !ROOMS[d.room]) return null;
  const def = ROOMS[d.room]!;
  const door = typeof d.door === 'string' && def.doors?.some(x => x.id === d.door) ? d.door : null;
  const leashIds = new Set(LEASHES.map(l => l.id));
  const owned = Array.isArray(d.kit?.owned) ? d.kit!.owned.filter(id => leashIds.has(id)) : [];
  if (!owned.includes('mop')) owned.unshift('mop');
  const leash = d.kit?.leash && owned.includes(d.kit.leash) ? d.kit.leash : 'mop';
  const mats: Partial<Record<ItemId, number>> = {};
  for (const id of Object.keys(ITEMS) as ItemId[]) mats[id] = Math.floor(num(d.kit?.mats?.[id], 0, 9999, 0));
  const bread: Partial<Record<BreadId, number>> = {};
  for (const b of BREADS) bread[b.id] = Math.floor(num(d.kit?.bread?.[b.id], 0, 999, 0));
  const active = BREADS.some(b => b.id === d.kit?.active) ? d.kit!.active : 'stale';
  const world: Record<string, RoomMemory> = {};
  for (const [id, m] of Object.entries(d.world ?? {})) {
    if (!ROOMS[id] || !m || typeof m !== 'object') continue;
    const bools = (a: unknown) => (Array.isArray(a) ? a.map(Boolean) : []);
    world[id] = { gateOpen: !!m.gateOpen, chest: !!m.chest, rang: !!m.rang, bread: bools(m.bread), kits: bools(m.kits), spools: bools(m.spools), feathers: bools(m.feathers), boss: !!m.boss, bushes: bools(m.bushes),
      barrels: Array.isArray(m.barrels) ? m.barrels.map(v => num(v, 0, 1, 0)) : [] };
  }
  return {
    v: 2, room: d.room, door, hp: Math.round(num(d.hp, 1, C.maxHp, C.maxHp)),
    pack: { water: num(d.pack?.water, 0.05, 1, 1), holes: Math.round(num(d.pack?.holes, 0, C.maxHoles, 0)), patches: Math.round(num(d.pack?.patches, 0, 99, 0)), needles: Math.round(num(d.pack?.needles, 0, 99, C.kitNeedles)) },
    kit: { mats, owned, leash, bread, active, toothFirst: d.kit?.toothFirst !== false,
      traits: Array.isArray(d.kit?.traits) ? d.kit!.traits.filter(t => TRAITS.some(x => x.id === t)) : [], oar: d.kit?.oar === true },
    world, savedAt: num(d.savedAt, 0, 8.64e15, 0),
  };
}

/** Put the sim where the save says. */
export function applySave(sim: Sim, s: SaveData): void {
  const k = sim.kit;
  Object.assign(k.mats, s.kit.mats);
  k.owned = new Set(s.kit.owned); k.leash = s.kit.leash;
  Object.assign(k.bread, s.kit.bread); k.active = s.kit.active; k.toothFirst = s.kit.toothFirst; k.traits = new Set(s.kit.traits ?? []); k.oar = !!s.kit.oar;
  sim.world = structuredClone(s.world);
  sim.pack.water = s.pack.water; sim.pack.holes = s.pack.holes; sim.pack.patches = s.pack.patches; sim.pack.needles = s.pack.needles;
  sim.player.hp = s.hp;
  sim.enterRoom(ROOMS[s.room]!, s.door, false, false);
}

export function encodeSave(s: SaveData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'GOOSE1.' + btoa(bin);
}

export function decodeSave(code: string): SaveData | null {
  try {
    const body = code.trim().replace(/^GOOSE1\./, '');
    const bin = atob(body);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return validateSave(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
}

/** localStorage can be missing or throw (private windows, blocked storage): saves are best-effort. */
export function storeSave(s: SaveData): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function loadStoredSave(): SaveData | null {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? validateSave(JSON.parse(raw)) : null; } catch { return null; }
}
export function clearStoredSave(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ } }
