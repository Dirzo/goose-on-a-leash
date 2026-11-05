/**
 * Materials, catalysts, leashes and breads. Designers tune these numbers without touching code.
 * Leash stat keys are read through `leashStat()` in core/crafting.ts.
 */

export type MaterialId = 'mop' | 'fluff' | 'crust' | 'chain' | 'goo' | 'down';
export type CatalystId = 'clapper' | 'crest' | 'egg' | 'tooth';
export type ItemId = MaterialId | CatalystId;
export type BuildId = 'any' | 'brawler' | 'honker' | 'flinger' | 'berserker' | 'chaos';
export type LeashId = 'mop' | 'chain' | 'bungee' | 'bell' | 'choke' | 'golden' | 'toothed';
export type BreadId = 'stale' | 'sour' | 'bagel' | 'muffin' | 'pepper' | 'bun';
export type Cost = Partial<Record<ItemId, number>>;

export interface ItemDef { name: string; color: string; source: string }

export const MATERIALS: Record<MaterialId, ItemDef> = {
  mop: { name: 'Fishing Line', color: '#ddd5be', source: 'The tackle box by the path. Restocks every 15 s.' },
  fluff: { name: 'Reed Fiber', color: '#8db07a', source: 'Frogs carry it. Also patches the backpack: 2 per hole [P].' },
  crust: { name: 'Old Crust', color: '#c98a3c', source: 'Frogs, sometimes. Frogs steal bread.' },
  chain: { name: 'Shell Scute', color: '#7c8794', source: 'Old Snapper and other shelled brutes.' },
  goo: { name: 'Pond Muck', color: '#5fbf6a', source: 'Splashes up when something falls in the water.' },
  down: { name: 'Goose Down', color: '#f4f1e8', source: 'The goose molts when a Fury ends without the leash snapping.' },
};

export const CATALYSTS: Record<CatalystId, ItemDef> = {
  clapper: { name: 'Bell Clapper', color: '#f2c230', source: 'Honk the fishing bell. The first ring always drops one.' },
  crest: { name: "Snapper's Crest", color: '#c94b3a', source: 'Defeat a heavy brute. Drownings do not count.' },
  egg: { name: 'Golden Egg', color: '#ffd84a', source: 'Sometimes laid when a Fury ends safely.' },
  tooth: { name: 'Goose Tooth', color: '#ffffff', source: 'Get bitten by a feral goose. Geese do not have teeth. Nobody knows.' },
};

export const ITEMS: Record<ItemId, ItemDef> = { ...MATERIALS, ...CATALYSTS };
export const isCatalyst = (id: ItemId): id is CatalystId => id in CATALYSTS;

export const BUILDS: Record<BuildId, { name: string; color: string }> = {
  any: { name: 'Basic', color: '#c9bea3' },
  brawler: { name: 'Brawler', color: '#e88a7b' },
  honker: { name: 'Honker', color: '#f2c94c' },
  flinger: { name: 'Flinger', color: '#8cc3e8' },
  berserker: { name: 'Berserker', color: '#f0a35e' },
  chaos: { name: 'Chaos', color: '#c9a3e6' },
};

/** Stat modifiers a leash can carry. Missing keys use the neutral default in leashStat(). */
export interface LeashStats {
  str?: number;        // + leash strength levels
  len?: number;        // + leash length units
  fling?: number;      // fling speed multiplier
  yank?: number;       // yank speed multiplier
  tug?: number;        // multiplier on goose tugs against the janitor
  honkR?: number;      // honk range multiplier
  honkStrain?: number; // fraction of strain shed per honk
  biteStun?: number;   // seconds of stun per held bite
  furyGain?: number;   // fury gain multiplier
  furyDur?: number;    // furious duration multiplier
  furyDmg?: number;    // furious bite multiplier (default 2)
  strain?: number;     // strain rate multiplier
  noBite?: boolean;    // feral goose chews the leash instead of the janitor
}

export interface LeashDef extends LeashStats {
  id: LeashId; name: string; build: BuildId; cost: Cost; effect: string; lore: string; ropeColor: string; heavy?: boolean;
}

export const LEASHES: readonly LeashDef[] = [
  { id: 'mop', name: 'Frayed Fishing Line', build: 'any', cost: {}, str: 0, ropeColor: '#c9a46a',
    effect: 'No bonuses.', lore: 'Rated for trout. Not for geese.' },
  { id: 'chain', name: 'Scute-Plate Leash', build: 'brawler', cost: { chain: 3, mop: 2 }, str: 2, ropeColor: '#9aa6b2', heavy: true,
    effect: '+2 leash strength.', lore: 'Shell plates on a cord. Clacks. The goose hates the clacking.' },
  { id: 'bungee', name: 'Bungee Cord', build: 'flinger', cost: { fluff: 3, goo: 2, mop: 1 }, len: 90, fling: 1.25, yank: 1.4, tug: 0.5, ropeColor: '#5fbf6a',
    effect: '+90 leash length. Fling ×1.25, yank ×1.4. Goose tugs on you are halved.', lore: 'Smells like the pond. Bounces like a dream.' },
  { id: 'bell', name: 'Bell-Ringer Lead', build: 'honker', cost: { chain: 2, mop: 2, clapper: 1 }, str: 1, honkR: 1.3, honkStrain: 0.4, ropeColor: '#f2c230',
    effect: '+1 strength. Honk range ×1.3. Each honk shakes off 40% of the leash strain.', lore: 'Every honk rings. Every ring soothes. Everyone else suffers.' },
  { id: 'choke', name: 'Snapper-Shell Choke Chain', build: 'brawler', cost: { chain: 4, crest: 1 }, str: 3, biteStun: 1, furyGain: 0.7, ropeColor: '#b0485a', heavy: true,
    effect: '+3 strength. Bites stun for a full second. Fury builds 30% slower.', lore: 'Old Snapper wore it as a collar. The goose wears it better.' },
  { id: 'golden', name: 'Golden Tether', build: 'berserker', cost: { down: 2, chain: 1, egg: 1 }, str: 1, furyDur: 2, furyDmg: 3, strain: 0.5, ropeColor: '#ffd84a',
    effect: '+1 strength. Fury lasts twice as long. Furious bites hit ×3. Strain builds half as fast.', lore: 'Woven from his own feathers. He respects that.' },
  { id: 'toothed', name: 'The Toothed Leash', build: 'chaos', cost: { down: 2, fluff: 2, tooth: 1 }, noBite: true, strain: 2, ropeColor: '#e9e4d6',
    effect: 'A feral goose chews the leash instead of you. The leash snaps twice as fast.', lore: 'Studded with the tooth. Do not ask about the tooth.' },
];

export interface BreadDef { id: BreadId; name: string; build: BuildId; cost: Cost; effect: string; lore: string }

export const BREADS: readonly BreadDef[] = [
  { id: 'stale', name: 'Stale Crust', build: 'any', cost: { crust: 2 }, effect: 'Calms the goose. Clears Fury and strain.', lore: 'Also found lying around. Do not eat it yourself.' },
  { id: 'sour', name: 'Sourdough of Serenity', build: 'brawler', cost: { crust: 2, down: 1 }, effect: 'Calms, then Fury cannot build for 8 seconds.', lore: 'Bake with his own down so he feels heard.' },
  { id: 'bagel', name: 'Scute Bagel', build: 'any', cost: { crust: 2, chain: 1 }, effect: 'Calms and reinforces the leash: +2 strength for 20 seconds.', lore: 'Crunchy. Structurally load-bearing.' },
  { id: 'muffin', name: 'Reed Muffin', build: 'any', cost: { crust: 1, fluff: 2 }, effect: 'Calms. The goose coughs up a heart for you: +1 HP.', lore: 'Do not ask where the heart came from.' },
  { id: 'pepper', name: 'Ghost Pepper Roll', build: 'berserker', cost: { crust: 1, goo: 1 }, effect: 'Does NOT calm. Goose goes instantly FURIOUS.', lore: 'For when you want him angry on purpose.' },
  { id: 'bun', name: 'Clapper Bun', build: 'honker', cost: { crust: 2, clapper: 1 }, effect: 'Calms. His next 5 honks are mega honks.', lore: 'The clapper is baked inside. He swallows it. It rings.' },
];

export const leashById = (id: LeashId): LeashDef => LEASHES.find(l => l.id === id) ?? LEASHES[0]!;
export const breadById = (id: BreadId): BreadDef => BREADS.find(b => b.id === id) ?? BREADS[0]!;
