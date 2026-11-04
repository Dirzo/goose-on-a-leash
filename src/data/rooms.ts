import type { Circle, Rect, Vec } from '../core/math';

/** A hand-built room. Until LDtk arrives (M2), rooms are authored here in world units (960×600). */
export interface RoomDef {
  id: string;
  name: string;
  width: number;
  height: number;
  playerStart: Vec;
  /** Respawn points used after falling in a pit, chosen by which side of the pit the player was on. */
  respawns: { left: Vec; right: Vec };
  walls: Rect[];
  /** Removed once the gate opens. */
  gate: Rect | null;
  pit: Rect | null;
  posts: Circle[];
  bell: Circle | null;
  exit: Rect | null;
  vents: Vec[];
  bucket: Vec | null;
  breadSpots: Vec[];
  enemies: { kind: 'bunny' | 'knight'; x: number; y: number }[];
  knightSpawn: Vec | null;
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
