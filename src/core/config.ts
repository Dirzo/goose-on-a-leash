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
  // dodge roll: a quick tumble with a moment of safety. The pack sloshes a little each time.
  rollTime: 0.36,
  rollSpeed: 470,
  rollIframes: 0.26,
  rollCooldown: 0.5,
  rollSlosh: 0.004,
  // power cast: Biscuit rides the fishing line. Hold to wind up (the meter swings up and back), release to cast.
  // Power sets how much line goes out; release in the sweet spot at the top for a perfect cast.
  castChargeTime: 0.7,     // seconds for the meter to swing from empty to full (then it swings back down)
  castReachMul: 1.7,      // a full cast runs this many times the leash's length of line
  reelReach: 0.5,         // the Spinning Reel: + this many leash lengths of line on a full cast
  reelSweet: 0.8,         // ...and a wider sweet spot
  castMinPower: 0.12,      // a tap still tosses him a little way
  castSweet: 0.86,         // release at or above this for a PERFECT cast
  castPerfectHit: 1.7,     // first-bite damage multiplier for a perfect cast (a weak cast bites at castWeakHit, scaling up with power)
  castWeakHit: 0.6,
  castChargeSlow: 0.65,    // Rocco's speed while winding up
  castHeel: 50,            // line out when he's back at your heel
  castCutFury: 60,         // rage needed before you can cut him loose to fight alone
  castCutTime: 8,
  grudgeTime: 8,           // cut him loose before castCutFury and he's after Rocco and Bimbo for this long (bread ends it)
  grudgePeck: 0.03,        // extra water each grudge bite pecks out of Bimbo's pack
  panicSpeed: 1.15,        // Rocco scrambles this much faster with a feral goose at his heels          // seconds he rampages after the line is cut, then comes back to be tied on
  // the Ferryman's Oar: hold to guard Bimbo from the front; raise it just as a blow lands to parry
  guardSpeed: 0.5,
  guardArc: 1.25,          // half-angle (radians) of the arc the oar covers
  parryWindow: 0.2,        // seconds after raising it in which a block becomes a parry
  parryRange: 320,         // how far a parried acorn or rock flies back toward the aim
  guardBrace: 0.3,         // how much of Biscuit's pull still moves Rocco while he plants the oar
  bunnySpawnEvery: 6,
  maxBunnies: 4,
  knightRespawn: 25,
  bucketCooldown: 15,
  // backpack: Bimbo's water is Rocco's life in the world rooms. Fractions of a full pack.
  packDrain: 0.002,       // a sound pack lasts about 8 minutes away from water
  holeDrain: 0.006,       // each tear adds this per second; 3 tears empty a full pack in about 50 s
  refillRate: 0.45,
  hitSpill: 0.07,         // a hit that doesn't tear splashes this much water out
  heavySpill: 0.13,       // Old Snapper hits harder
  slurpSpill: 0.05,       // a frog tongue that reaches Bimbo slurps this much
  holeChance: 0.25,       // chance a light hit tears the pack instead of splashing (more from behind, less from the front)
  heavyHoleChance: 0.45,
  backHitTear: 1.7,       // hits on the pack side multiply the tear chance; hits Rocco takes face-on multiply it by frontHitTear
  frontHitTear: 0.4,
  maxHoles: 5,
  patchCost: 1,           // twine per patch (plus one needle use from a sewing kit)
  kitNeedles: 3,          // patches in one sewing kit
  spoolTwine: 2,          // twine on one spool
  faintHolesKept: 2,      // after Bimbo faints, Rocco ties emergency knots: at most this many tears stay open
} as const;

/**
 * Difficulty. 'classic' is the original balance (the tests use it); the game starts on Normal, which is
 * meant to be hard. tempo speeds every critter's thinking (wind-ups, cooldowns, dives); hurt scales what
 * a hit spills and how often it tears; bossHp, spawn (seconds between burrow spawns) and fishPull (how hard
 * fish fight) scale the rest.
 */
export type Difficulty = 'classic' | 'story' | 'normal' | 'brutal';
export const DIFFICULTY: Record<Difficulty, { name: string; tempo: number; hurt: number; bossHp: number; spawn: number; fishPull: number; blurb: string }> = {
  classic: { name: 'Classic', tempo: 1, hurt: 1, bossHp: 1, spawn: 1, fishPull: 1, blurb: '' },
  story: { name: 'Story', tempo: 0.85, hurt: 0.7, bossHp: 0.85, spawn: 1.4, fishPull: 0.85, blurb: 'Gentler critters, more forgiving fish.' },
  normal: { name: 'Normal', tempo: 1.12, hurt: 1.3, bossHp: 1.2, spawn: 0.85, fishPull: 1.1, blurb: 'The way it is meant to be played: hard.' },
  brutal: { name: 'Brutal', tempo: 1.28, hurt: 1.65, bossHp: 1.45, spawn: 0.7, fishPull: 1.25, blurb: 'Everything is faster, angrier and thirstier.' },
};
