/** Art assets bundled by Vite (inlined as data URIs in the single-file build). */
import type Phaser from 'phaser';
import manifest from '../assets/sprites/sprites.json';
import movieMeta from '../assets/movie/movie.json';

export const MOVIE = movieMeta as { surface: number; dockY: number; moon: [number, number, number]; rocco: { w: number; h: number; frames: number; at: [number, number]; rodTip: [number, number] }; koi: { w: number; h: number; frames: number }; shark: { w: number; h: number; frames: number; eye: [number, number] } };

export interface StripDef { w: number; h: number; frames: number; anchor: [number, number]; points: Record<string, [number, number]> }
export const SPRITES = manifest as unknown as Record<string, StripDef>;

const URLS = import.meta.glob('../assets/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (path: string): string => {
  const u = URLS[`../assets/${path}`];
  if (!u) throw new Error(`missing asset ${path}`);
  return u;
};

/** Rooms that have painted backgrounds (any src/assets/rooms/<id>.png). Others use the gray-box renderer. */
export const ROOM_ART: Record<string, string> = Object.fromEntries(
  Object.keys(URLS).filter(k => k.startsWith('../assets/rooms/')).map(k => [k.slice('../assets/rooms/'.length, -4), k.slice('../assets/'.length)]));

export function preloadArt(scene: Phaser.Scene): void {
  for (const [name, s] of Object.entries(SPRITES)) {
    scene.load.spritesheet(name, url(`sprites/${name}.png`), { frameWidth: s.w, frameHeight: s.h });
  }
  for (const [id, path] of Object.entries(ROOM_ART)) scene.load.image(`room_${id}`, url(path));
  // the opening film
  for (const k of ['sky', 'far', 'near', 'water', 'weeds']) scene.load.image(`mv_${k}`, url(`movie/${k}.png`));
  scene.load.spritesheet('mv_rocco', url('movie/m_rocco.png'), { frameWidth: MOVIE.rocco.w, frameHeight: MOVIE.rocco.h });
  scene.load.spritesheet('mv_koi', url('movie/m_koi.png'), { frameWidth: MOVIE.koi.w, frameHeight: MOVIE.koi.h });
  scene.load.spritesheet('mv_shark', url('movie/m_shark.png'), { frameWidth: MOVIE.shark.w, frameHeight: MOVIE.shark.h });
}

export const MOVIE_KEYS = ['mv_sky', 'mv_far', 'mv_near', 'mv_water', 'mv_weeds', 'mv_rocco', 'mv_koi', 'mv_shark'];

/** Pixel art stays crisp under camera zoom; text and UI keep linear filtering. */
export function nearestFilter(scene: Phaser.Scene, nearest: number): void {
  for (const key of [...Object.keys(SPRITES), ...Object.keys(ROOM_ART).map(id => `room_${id}`), ...MOVIE_KEYS]) {
    scene.textures.get(key).setFilter(nearest);
  }
}
