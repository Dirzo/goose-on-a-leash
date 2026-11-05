/**
 * Biscuit's traits: learned at his shrine in Willowmere with Golden Feathers (bosses give them; a few are
 * hidden in hard-to-reach spots). Four branches of three, learned in order. Every two traits raise his
 * Goose Power by one, so a stronger Biscuit also needs a stronger leash.
 */
import type { BuildId } from './recipes';

export type TraitId = 'b1' | 'b2' | 'b3' | 'h1' | 'h2' | 'h3' | 'f1' | 'f2' | 'f3' | 'z1' | 'z2' | 'z3';

export interface TraitDef { id: TraitId; branch: BuildId; tier: 1 | 2 | 3; name: string; effect: string; lore: string }

export const TRAITS: TraitDef[] = [
  { id: 'b1', branch: 'brawler', tier: 1, name: 'Thick Neck', effect: 'Bites hit 35% harder.', lore: 'He has been doing neck curls. Nobody taught him.' },
  { id: 'b2', branch: 'brawler', tier: 2, name: 'Iron Beak', effect: 'Bites stun 0.4 s longer.', lore: 'Clamps like a mooring cleat.' },
  { id: 'b3', branch: 'brawler', tier: 3, name: 'Headbutt Buddy', effect: 'Yanking into a heavy foe headbutts twice as hard and stuns longer.', lore: 'Rocco supplies the head. Biscuit supplies the butt.' },
  { id: 'h1', branch: 'honker', tier: 1, name: 'Big Lungs', effect: 'Honk reaches 25% further.', lore: 'You can hear him from the next marsh.' },
  { id: 'h2', branch: 'honker', tier: 2, name: 'Stunning Voice', effect: 'Honks stun 0.7 s longer.', lore: 'Frogs forget their own names.' },
  { id: 'h3', branch: 'honker', tier: 3, name: 'Quick Breath', effect: 'Honk recovers 40% faster.', lore: 'In through the beak, HONK out through the beak.' },
  { id: 'f1', branch: 'flinger', tier: 1, name: 'Aerodynamic', effect: 'Flings 15% faster.', lore: 'Sleeked his feathers back. Looks fast. Is fast.' },
  { id: 'f2', branch: 'flinger', tier: 2, name: 'Hook Beak', effect: 'Catches targets from further away when flung.', lore: 'If it is close, it is bitten.' },
  { id: 'f3', branch: 'flinger', tier: 3, name: 'Reel Master', effect: 'Yanks pull Rocco 25% faster.', lore: 'Rocco has stopped screaming on the way across. Mostly.' },
  { id: 'z1', branch: 'berserker', tier: 1, name: 'Short Fuse', effect: 'Fury builds 30% faster.', lore: 'He was born angry. Now he is efficient about it.' },
  { id: 'z2', branch: 'berserker', tier: 2, name: 'Wild Heart', effect: 'Fury lasts 2 s longer.', lore: 'The red mist lingers.' },
  { id: 'z3', branch: 'berserker', tier: 3, name: "Bimbo's Bodyguard", effect: 'While Biscuit is furious, hits on Rocco tear the pack half as often.', lore: 'Nobody touches the fish. Nobody.' },
];

export const BRANCHES: BuildId[] = ['brawler', 'honker', 'flinger', 'berserker'];
export const traitById = (id: TraitId): TraitDef => TRAITS.find(t => t.id === id)!;
export const TRAIT_COST = 1;
