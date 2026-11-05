/** Art assets bundled by Vite (inlined as data URIs in the single-file build). */
import type Phaser from 'phaser';
import manifest from '../assets/sprites/sprites.json';

export interface StripDef { w: number; h: number; frames: number; anchor: [number, number]; points: Record<string, [number, number]> }
export const SPRITES = manifest as unknown as Record<string, StripDef>;

const URLS = import.meta.glob('../assets/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (path: string): string => {
  const u = URLS[`../assets/${path}`];
  if (!u) throw new Error(`missing asset ${path}`);
  return u;
};

/** Rooms that have painted backgrounds. Others fall back to the gray-box renderer. */
export const ROOM_ART: Record<string, string> = { willowmere: 'rooms/willowmere.png' };

export function preloadArt(scene: Phaser.Scene): void {
  for (const [name, s] of Object.entries(SPRITES)) {
    scene.load.spritesheet(name, url(`sprites/${name}.png`), { frameWidth: s.w, frameHeight: s.h });
  }
  for (const [id, path] of Object.entries(ROOM_ART)) scene.load.image(`room_${id}`, url(path));
}

/** Pixel art stays crisp under camera zoom; text and UI keep linear filtering. */
export function nearestFilter(scene: Phaser.Scene, nearest: number): void {
  for (const key of [...Object.keys(SPRITES), ...Object.keys(ROOM_ART).map(id => `room_${id}`)]) {
    scene.textures.get(key).setFilter(nearest);
  }
}
