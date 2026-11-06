import {
  BREADS, ITEMS, LEASHES, breadById, leashById,
  type BreadId, type Cost, type ItemId, type LeashDef, type LeashId, type LeashStats,
} from '../data/recipes';
import type { TraitId } from '../data/traits';

const NEUTRAL: Required<Omit<LeashStats, 'noBite'>> & { noBite: boolean } = {
  str: 0, len: 0, fling: 1, yank: 1, tug: 1, honkR: 1, honkStrain: 0,
  biteStun: 0, furyGain: 1, furyDur: 1, furyDmg: 2, strain: 1, noBite: false,
};

/** The janitor's satchel and leash rack. Persists across room resets. */
export class Kit {
  mats: Record<ItemId, number>;
  owned: Set<LeashId>;
  leash: LeashId;
  bread: Record<BreadId, number>;
  active: BreadId;
  toothFirst: boolean;
  /** Biscuit's learned traits (see data/traits.ts). */
  traits: Set<TraitId>;
  /** The Ferryman's Oar (from the Heron): guard, parry and brace. */
  oar = false;
  /** Ferry stops Rocco has stood at (room ids). */
  ferries = new Set<string>();
  /** The Spinning Reel (Pickett's Tackle): longer casts and a wider sweet spot. */
  reel = false;
  /** Legendary elixir ingredients gathered (see data/elixir.ts). */
  ingredients = new Set<string>();

  constructor() {
    this.mats = Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])) as Record<ItemId, number>;
    this.mats.mop = 4;
    this.owned = new Set<LeashId>(['mop']);
    this.leash = 'mop';
    this.bread = Object.fromEntries(BREADS.map(b => [b.id, 0])) as Record<BreadId, number>;
    this.bread.stale = 1;
    this.active = 'stale';
    this.toothFirst = true;
    this.traits = new Set<TraitId>();
  }

  has(t: TraitId): boolean { return this.traits.has(t); }

  get leashDef(): LeashDef { return leashById(this.leash); }

  /** A stat of the equipped leash, falling back to the neutral value. */
  stat<K extends keyof typeof NEUTRAL>(key: K): (typeof NEUTRAL)[K] {
    const v = this.leashDef[key as keyof LeashDef];
    return (v ?? NEUTRAL[key]) as (typeof NEUTRAL)[K];
  }

  canAfford(cost: Cost): boolean {
    return Object.entries(cost).every(([k, v]) => this.mats[k as ItemId] >= (v ?? 0));
  }

  private pay(cost: Cost): void {
    for (const [k, v] of Object.entries(cost)) this.mats[k as ItemId] -= v ?? 0;
  }

  /** Add a leash found in the world and equip it. */
  findLeash(id: LeashId): boolean {
    if (this.owned.has(id)) return false;
    this.owned.add(id); this.leash = id;
    return true;
  }

  craftLeash(id: LeashId): boolean {
    const r = leashById(id);
    if (this.owned.has(id) || r.found || !this.canAfford(r.cost)) return false;
    this.pay(r.cost);
    this.owned.add(id);
    this.leash = id;
    return true;
  }

  equipLeash(id: LeashId): boolean {
    if (!this.owned.has(id)) return false;
    this.leash = id;
    return true;
  }

  craftBread(id: BreadId): boolean {
    const r = breadById(id);
    if (!this.canAfford(r.cost)) return false;
    this.pay(r.cost);
    this.bread[id] += 1;
    this.active = id;
    return true;
  }

  /** Select the next bread type the player holds (or wrap to the next in the list). */
  cycleBread(): BreadId {
    const i = BREADS.findIndex(b => b.id === this.active);
    for (let j = 1; j <= BREADS.length; j++) {
      const b = BREADS[(i + j) % BREADS.length]!;
      if (this.bread[b.id] > 0 || j === BREADS.length) { this.active = b.id; break; }
    }
    return this.active;
  }

  /** Testing helper from the tuning bench. */
  stockAll(n = 5): void { for (const k of Object.keys(this.mats) as ItemId[]) this.mats[k] += n; }

  emptyAll(): void {
    const fresh = new Kit();
    Object.assign(this, { mats: fresh.mats, owned: fresh.owned, leash: fresh.leash, bread: fresh.bread, active: fresh.active });
    for (const k of Object.keys(this.mats) as ItemId[]) this.mats[k] = 0;
  }

  static leashes(): readonly LeashDef[] { return LEASHES; }
}
