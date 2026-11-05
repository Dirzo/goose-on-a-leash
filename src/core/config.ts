/** Tuning values exposed on the tuning bench. Crafted leashes add on top of these. */
export interface Tuning {
  /** Base leash length in world units. */
  leash: number;
  /** Fling launch speed, units/s. */
  fling: number;
  /** Yank pull speed, units/s. */
  yank: number;
  /** Fury gain multiplier. */
  fury: number;
  /** Goose Power level, 1-5. */
  power: number;
  /** Base Leash Strength level, 1-5. */
  strength: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  leash: 230,
  fling: 950,
  yank: 850,
  fury: 1,
  power: 2,
  strength: 2,
});

export const TUNING_RANGES: Record<keyof Tuning, { min: number; max: number; step: number; label: string; unit: string }> = {
  leash: { min: 120, max: 360, step: 10, label: 'Leash length', unit: 'px' },
  fling: { min: 400, max: 1600, step: 50, label: 'Fling speed', unit: 'px/s' },
  yank: { min: 400, max: 1500, step: 50, label: 'Yank pull speed', unit: 'px/s' },
  fury: { min: 0, max: 3, step: 0.25, label: 'Fury gain', unit: '×' },
  power: { min: 1, max: 5, step: 1, label: 'Goose power', unit: 'Lv' },
  strength: { min: 1, max: 5, step: 1, label: 'Leash strength', unit: 'Lv' },
};

/** Fixed simulation step. The view interpolates between steps. */
export const STEP = 1 / 60;

/** Gameplay constants that are not on the tuning bench. */
export const C = {
  playerSpeed: 205,
  playerRadius: 14,
  gooseRadius: 10,
  furiousSeconds: 5,
  honkCooldown: 0.9,
  ropeSegments: 12,
  ropeIterations: 10,
  ropeDamping: 0.86,
  grabCooldown: 1.2,
  maxHp: 5,
  invulnerable: 1.1,
  bunnySpawnEvery: 6,
  maxBunnies: 4,
  knightRespawn: 25,
  bucketCooldown: 15,
  // backpack: Bimbo's water is Rocco's life in the world rooms. Fractions of a full pack.
  packDrain: 0.004,       // a sound pack lasts about 4 minutes away from water
  holeDrain: 0.012,       // each tear adds this per second; 3 tears empty a full pack in about 25 s
  refillRate: 0.45,
  hitSpill: 0.12,         // a hit that doesn't tear splashes this much water out
  heavySpill: 0.22,       // Old Snapper hits harder
  holeChance: 0.4,        // chance a light hit tears the pack instead of splashing
  heavyHoleChance: 0.6,
  maxHoles: 5,
  patchCost: 1,           // twine per patch (plus one needle use from a sewing kit)
  kitNeedles: 3,          // patches in one sewing kit
  spoolTwine: 2,          // twine on one spool
  faintHolesKept: 2,      // after Bimbo faints, Rocco ties emergency knots: at most this many tears stay open
} as const;
