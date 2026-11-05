import type { Circle, Rect, Vec } from '../core/math';
import type { LeashId } from './recipes';

export type EnemyKind = 'bunny' | 'knight' | 'frog' | 'snapper' | 'heron' | 'squirrel' | 'badger' | 'king';

/** A doorway on a room edge. Walking into it travels to `toDoor` in room `to` (or ends the slice when `to` is 'END'). */
export interface Door {
  id: string; x: number; y: number; w: number; h: number;
  to: string; toDoor: string;
  /** Where Rocco appears when he arrives through this door. */
  spawn: Vec;
  /** Closed until the room's bell is rung (the room's `gate` blocks it). */
  gated?: boolean;
  label?: string;
}

/** A hand-built room. Until LDtk arrives (M2), rooms are authored here in world units (960×600). */
export interface RoomDef {
  id: string;
  name: string;
  width: number;
  height: number;
  playerStart: Vec;
  /** Respawn points after falling in a pit, by side (Room 01). Rooms without them respawn at the last safe ground. */
  respawns?: { left: Vec; right: Vec };
  walls: Rect[];
  /** Removed once the gate opens. */
  gate: Rect | null;
  /** Single pit (Room 01). Rooms with water use `pits` instead. */
  pit?: Rect | null;
  /** Water or holes: several rects; touching one means falling in. */
  pits?: Rect[];
  /** Walkable rects laid over pits (docks, bridges). */
  bridges?: Rect[];
  /** Shoreline zones that refill the backpack. A room with refills turns the backpack system on. */
  refills?: Rect[];
  posts: Circle[];
  bell: Circle | null;
  exit: Rect | null;
  vents: Vec[];
  bucket: Vec | null;
  breadSpots: Vec[];
  enemies: { kind: EnemyKind; x: number; y: number }[];
  knightSpawn: Vec | null;
  /** Which enemy the vents spawn and which heavy enemy respawns (defaults: bunny / knight). */
  lightKind?: EnemyKind;
  heavyKind?: EnemyKind;
  lantern?: Vec;
  /** Several lanterns (areas stitched from rooms). */
  lanterns?: Vec[];
  /** Named parts of an area (the rooms it was stitched from): the name shows as you walk in. */
  zones?: (Rect & { name: string })[];
  /** The room rects the area is made of (for the painter); outside them is solid. */
  rooms?: Rect[];
  exitLabel?: string;
  /** Rooms linked into the world. A room with doors ignores `exit`. */
  doors?: Door[];
  /** Sewing kits (needle uses for patching) and twine spools lying in the room, each picked up once. */
  kits?: Vec[];
  spools?: Vec[];
  /** Thorn brambles: touching one tears the pack. */
  brambles?: Rect[];
  /** Bramble bushes: solid until Biscuit is flung into one and chews through it (remembered). */
  bushes?: Circle[];
  /** Rain barrels: each holds a little water for the pack, then it's empty (remembered). */
  barrels?: Vec[];
  /** Glowing mushroom rings: honk one and its spores put nearby critters to sleep. */
  shrooms?: Vec[];
  /** Which art set paints the room. */
  biome?: 'pond' | 'marsh' | 'woods';
  /** Golden Feathers hidden in the room, each picked up once. */
  feathers?: Vec[];
  /** Biscuit's shrine (Willowmere): stand by it to learn traits. */
  shrine?: Vec;
  /** A tackle chest holding a leash, opened once. */
  chest?: { x: number; y: number; leash: LeashId };
  /** 'rain': a storm while the boss is up: puddles slow Rocco, refills are slow and the pack drains faster. */
  weather?: 'rain';
  stormRefill?: number;
  stormDrain?: number;
  /** False: the burrows don't spawn on their own (a boss calls frogs instead). */
  ventSpawns?: boolean;
  /** A boss fight: beating the boss (waking him) opens the room's gate. */
  boss?: EnemyKind;
  /** Shown under the room name on arrival. */
  subtitle?: string;
  /** Shown when the slice ends through an 'END' door. */
  winText?: string;
}

/** Room 01: the test room from the HTML prototype, kept 1:1 for parity checks. */
export const ROOM_01: RoomDef = {
  id: 'room-01',
  name: 'Room 01',
  width: 960,
  height: 600,
  playerStart: { x: 110, y: 300 },
  respawns: { left: { x: 110, y: 300 }, right: { x: 640, y: 300 } },
  walls: [
    { x: 0, y: 0, w: 960, h: 20 }, { x: 0, y: 580, w: 960, h: 20 },
    { x: 0, y: 0, w: 20, h: 600 }, { x: 940, y: 0, w: 20, h: 600 },
    { x: 150, y: 70, w: 60, h: 40 }, { x: 640, y: 380, w: 70, h: 30 },
    { x: 836, y: 470, w: 12, h: 110 },
  ],
  gate: { x: 836, y: 470, w: 104, h: 12 },
  pit: { x: 400, y: 24, w: 150, h: 552 },
  posts: [{ x: 612, y: 300, r: 13 }, { x: 612, y: 110, r: 13 }],
  bell: { x: 890, y: 96, r: 18 },
  exit: { x: 852, y: 488, w: 84, h: 88 },
  vents: [{ x: 60, y: 220 }, { x: 300, y: 560 }, { x: 900, y: 300 }],
  bucket: { x: 56, y: 150 }, // moved down from (52, 52) so it no longer sits under the HUD hearts
  breadSpots: [{ x: 90, y: 520 }, { x: 330, y: 90 }, { x: 700, y: 120 }, { x: 780, y: 540 }],
  enemies: [
    { kind: 'bunny', x: 230, y: 150 }, { kind: 'bunny', x: 260, y: 470 }, { kind: 'bunny', x: 330, y: 300 },
    { kind: 'bunny', x: 720, y: 470 }, { kind: 'knight', x: 760, y: 210 },
  ],
  knightSpawn: { x: 760, y: 210 },
};

/**
 * World rooms are authored as JSON in src/data/rooms/ (Willowmere by hand, Reedmarsh generated by
 * art/rooms/reedmarsh_layout.py). The art scripts read the same files.
 */
const JSON_ROOMS = import.meta.glob('./rooms/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const ROOMS: Record<string, RoomDef> = { 'room-01': ROOM_01 };
for (const v of Object.values(JSON_ROOMS)) { const d = v as RoomDef; ROOMS[d.id] = d; }

/** Willowmere Pond: the Act 1 hub. */
export const WILLOWMERE: RoomDef = ROOMS.willowmere!;
