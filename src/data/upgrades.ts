/**
 * Backpack upgrades: one track each for Rocco (his fishing line), Biscuit (his bread) and Bimbo (the pack's patches).
 * Three tiers a track; each is made by hand in the backpack (weave, bake, sew), from supplies found on the way.
 */
import type { ItemId } from './recipes';

export type Track = 'line' | 'bread' | 'patch';

export interface UpgradeTier {
  name: string;
  /** What it does, in a few words. */
  does: string;
  /** Materials it uses; `needles` are sewing-kit needle uses (patches only). */
  cost: Partial<Record<ItemId, number>>;
  needles?: number;
  /** A line of flavour once it's made. */
  done: string;
}

export const TRACKS: Record<Track, { title: string; who: string; verb: string; tiers: UpgradeTier[] }> = {
  line: {
    title: 'Fishing Line', who: 'Rocco', verb: 'Weave',
    tiers: [
      { name: 'Twisted Line', does: '+10% cast reach · the line strains 12% slower', cost: { mop: 3, fluff: 2 }, done: 'Three strands, one tough little rope. Rocco gives it a proud tug.' },
      { name: 'Plaited Line', does: '+20% cast reach · strains 24% slower', cost: { mop: 5, fluff: 3, down: 2 }, done: 'Plaited with goose down. Biscuit is suspicious of where the down came from.' },
      { name: 'Moonsilk Line', does: '+30% cast reach · strains 36% slower', cost: { mop: 7, fluff: 4, glass: 3 }, done: 'Sea glass beads glint along the line. It hums when you cast.' },
    ],
  },
  bread: {
    title: 'Bread', who: 'Biscuit', verb: 'Bake',
    tiers: [
      { name: 'Twice-Baked Crust', does: 'Biscuit bites 15% harder', cost: { crust: 3, goo: 1 }, done: 'Crunchy. Biscuit eats it in one gulp and looks at you for more.' },
      { name: 'Seeded Cob', does: 'Biscuit bites 30% harder', cost: { crust: 5, goo: 2, down: 1 }, done: 'Full of seeds. Biscuit is now fifteen percent more goose.' },
      { name: 'Golden Brioche', does: 'Biscuit bites 45% harder', cost: { crust: 7, egg: 1 }, done: 'Glazed with a Golden Egg. Biscuit glows faintly. This seems fine.' },
    ],
  },
  patch: {
    title: 'Patches', who: 'Bimbo', verb: 'Sew',
    tiers: [
      { name: 'Tough Patch', does: 'the pack leaks 15% slower · tears 15% less', cost: { fluff: 2 }, needles: 2, done: 'A neat square patch. Bimbo presses his face against it. "Cosy."' },
      { name: 'Waxed Patch', does: 'leaks 30% slower · tears 30% less', cost: { fluff: 3, goo: 2 }, needles: 3, done: 'Waxed with pond muck. It smells awful and holds water beautifully.' },
      { name: 'Scute Patch', does: 'leaks 45% slower · tears 45% less', cost: { fluff: 4, chain: 3 }, needles: 4, done: 'Shell scute sewn in like armour. Bimbo now lives in a tank.' },
    ],
  },
};
