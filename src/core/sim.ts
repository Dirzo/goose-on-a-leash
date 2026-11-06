/**
 * The whole game simulation: the current room, plus what carries between rooms (kit, pack, room memory).
 * In world rooms (those with water) Bimbo's water is Rocco's life; hearts only apply in the gray-box Room 01.
 * No Phaser imports: everything here runs headless in tests. Room 01 behaviour is ported 1:1 from the prototype.
 */
import { C, DEFAULT_TUNING, type Tuning } from './config';
import { Kit } from './crafting';
import { angDiff, clamp, dirTo, inRect, mulberry32, type Rng, type Vec } from './math';
import { Room } from './room';
import { Rope } from './rope';
import { ROOMS, ROOM_01, type Door, type EnemyKind, type RoomDef } from '../data/rooms';
import { ITEMS, breadById, isCatalyst, leashById, type BreadId, type ItemId, type LeashId } from '../data/recipes';
import { TRAITS, TRAIT_COST, traitById, type TraitId } from '../data/traits';

// ---------------------------------------------------------------- types

export type GooseState = 'held' | 'flying' | 'latched' | 'loose' | 'returning';
export type { EnemyKind };

/** How close Rocco must get before an entranced critter notices him. Room 01's pests see across the room. */
const AGGRO: Partial<Record<EnemyKind, number>> = { elder: 620, frog: 160, snapper: 210, heron: 520, squirrel: 260, badger: 230, king: 700 };
const HEAVY: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['knight', 'snapper', 'heron', 'badger', 'king', 'elder']);
/** Animals under the blood moon's trance. Beaten, they wake up and wander off instead of dying. */
const ENTRANCED: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['frog', 'snapper', 'heron', 'squirrel', 'badger', 'king', 'elder']);
/** Bosses stand their ground: no knockback, they never fall in, and they stay once woken. */
const BOSS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['heron', 'king', 'elder']);
export const ELDER_HP = 24;
export const HERON_HP = 40;
export const KING_HP = 50;
/** Seconds a woken critter takes to hop away. */
const WAKE_TIME = 1.6;

/** What a room remembers after you leave it. */
export interface RoomMemory { gateOpen: boolean; bread: boolean[]; chest: boolean; rang: boolean; kits?: boolean[]; spools?: boolean[]; feathers?: boolean[]; nests?: boolean[]; boss?: boolean;
  bushes?: boolean[]; barrels?: number[] }

export interface Player {
  x: number; y: number; r: number; vx: number; vy: number;
  hp: number; inv: number; air: boolean; pull: Target | null;
  /** Dodge roll: seconds left (0 = not rolling), cooldown, and its direction. */
  roll: number; rollCd: number; rdx: number; rdy: number;
  /** Seconds the oar has been held up (0 = not guarding). */
  guard: number;
  /** Last movement direction; the goose trails behind it. */
  fx: number; fy: number;
  dead: number; // seconds left of the death pause, 0 when alive
}

export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; r: number;
  hp: number; max: number; heavy: boolean; stun: number;
  vx: number; vy: number; falling: number; dead: boolean; hitT: number; spd: number;
  /** Seconds since it woke from the trance (0 = still entranced). A woken critter is harmless and leaving. */
  woke: number;
  /** Entranced critters' attack state machine (Room 01 pests just chase). */
  mode: CritterMode; modeT: number; cd: number;
  /** Where the current attack is aimed (Bimbo, as he was when it wound up). */
  tx: number; ty: number;
  /** The attack already landed (one hit per attack). */
  hit: boolean;
  attack: AttackKind;
  /** Seconds Biscuit has been hanging on (bosses shake him off). */
  grip: number;
  /** Has been in the water once already (the first splash shakes loose some Pond Muck). */
  wet: boolean;
  /** Height in the air (the Heron flies); above 30 he can't be bitten or honked. */
  air: number;
  /** Where a boss returns to (the Heron's rock). */
  hx: number; hy: number;
  /** A boss's second timer (peck wind-up). */
  grip2: number;
}

/**
 * stalk: circle round to Rocco's back, where Bimbo is. wind: telegraph (flash + marker) before a strike.
 * leap: a frog's flying jump at the pack. lash: a frog's tongue, out and back. charge: Old Snapper's rush.
 * recover: a beat of vulnerability after an attack.
 */
export type CritterMode = 'stalk' | 'wind' | 'leap' | 'lash' | 'charge' | 'recover' | 'spear' | 'gust' | 'darts' | 'call' | 'swim'
  | 'takeoff' | 'fly' | 'slam' | 'grounded' | 'return' | 'perch' | 'tunnel' | 'surface' | 'dazed'
  /** Old Snapper: winded after a charge, hiding in his shell, flipped on his back. */
  | 'tired' | 'shell' | 'flipped';
export type AttackKind = 'leap' | 'lash' | 'charge' | 'bite' | 'spear' | 'gust' | 'dart' | 'slam' | 'peck' | 'acorn' | 'erupt' | 'rock' | 'thorn' | 'dig' | 'rocks';

/** A feather dart lobbed at Bimbo: it lands on the marked spot when t reaches T. */
export interface Dart { x0: number; y0: number; tx: number; ty: number; t: number; T: number; kind?: 'feather' | 'acorn' | 'rock'; /** batted back by the oar: hits critters and bells, not Rocco */ back?: boolean; /** the critter it's batted at (it follows him) */ at?: number }

export interface PostTarget { x: number; y: number; r: number; post: true }
export type Target = Enemy | PostTarget;
const isPost = (t: Target): t is PostTarget => 'post' in t;

export interface Goose {
  x: number; y: number; vx: number; vy: number; state: GooseState; feral: boolean;
  strain: number; target: Target | null; ox: number; oy: number; face: 1 | -1;
  t: number; fury: number; furious: number; tug: number; honkCd: number; biteT: number; grabCd: number;
  /** Seconds left of being hauled along by the leash (after Rocco rolls away): he scrambles and flaps. */
  drag: number;
}

export interface Item { mat: ItemId; x: number; y: number; vx: number; vy: number; t: number; got?: boolean }

export interface Buffs { noFury: number; bagel: number; mega: number }

/** The backpack that keeps Bimbo the Moon Koi alive. Active in rooms that have water to refill from. */
export interface Pack {
  enabled: boolean;
  water: number;          // 0-1: Bimbo's life, and Rocco's
  holes: number;          // open tears; each adds to the leak rate
  patches: number;        // sewn on so far (shown on the backpack screen)
  needles: number;        // needle uses left from sewing kits; each patch spends one
  lastWater: Vec;         // the last shore Rocco refilled at
  refilling: boolean;
}

/** One step's worth of player intent. Verb flags are edges: true only on the step they were pressed. */
export interface InputFrame {
  moveX: number; moveY: number;
  aimX: number; aimY: number;
  fling?: boolean; yank?: boolean; honk?: boolean; letGo?: boolean; feed?: boolean; cycle?: boolean; patch?: boolean; roll?: boolean;
  /** Held: raise the Ferryman's Oar. */
  guard?: boolean;
}

export type FxKind = 'block' | 'parry' | 'honk' | 'chomp' | 'boing' | 'poof' | 'ring' | 'snap' | 'bread' | 'pick' | 'tear' | 'splash' | 'faint' | 'patch' | 'wake' | 'chest' | 'gust' | 'slam'
  | 'thud' | 'dust' | 'spores' | 'bush';
export type SimEvent =
  | { type: 'say'; text: string }
  | { type: 'fx'; kind: FxKind; x: number; y: number; a?: number; cone?: number; range?: number; text?: string }
  | { type: 'won' }
  | { type: 'reset' }
  /** Rocco arrived in a room through a door (or a save was loaded). */
  | { type: 'room'; id: string }
  /** Rocco stepped up to Biscuit's shrine. */
  | { type: 'shrine' }
  /** Rocco honked at a ferry stop with the Ferryman awake: choose where to sail. */
  | { type: 'ferry' }
  /** A tutorial prompt: shown on screen for a few seconds. */
  | { type: 'hint'; text: string };

const QUIPS = {
  fling: ['HONK!', 'Airborne goose', 'Yeet.', 'Go get em'],
  bite: ['CHOMP', 'The goose has chosen violence', 'Bite secured'],
  boing: ['BOING. Leash tight.', 'Leash limit!'],
  refuse: ['The goose refuses.', 'Goose says no.', 'Not now, Rocco.'],
  pit: ['Down the hole!', 'Pit disposal complete', 'Bye bye'],
  splash: ['SPLASH! Into the pond.', 'Glub glub.', 'Back to the water with you.'],
  fall: ['You fell in. The goose laughs.'],
  swim: ['Rocco fell in the pond. Biscuit honks with laughter.'],
  honk: ['HONK'],
  furious: ['FURY MODE. You are not in charge.'],
  slurp: ['SLURP. A frog tongue in the pack.', 'The frog drank some of Bimbo\'s water!', 'Tongue! Bimbo: "HEY."'],
  swimback: ['Splash! The frog paddles back to shore.', 'Plop. It swims for the bank.', 'Into the drink! It will be back.'],
  parry: ['PARRY! Right back at you.', 'THWACK! Batted back.', 'Clean parry. The Ferryman would approve.'],
  wake: ['The frog blinks awake. Ribbit?', 'Trance broken. The frog hops home.', 'Red eyes fade. Frog says thanks.'],
} as const;

// ---------------------------------------------------------------- sim

export class Sim {
  tuning: Tuning;
  readonly kit: Kit;
  rng: Rng;
  room!: Room;
  player!: Player;
  goose!: Goose;
  enemies: Enemy[] = [];
  items: Item[] = [];
  darts: Dart[] = [];
  /** Where Rocco is aiming (world), from the last input. */
  aim: Vec = { x: 0, y: 0 };
  breadGot: boolean[] = [];
  /** Sewing kits and twine spools already taken in this room. */
  kitsGot: boolean[] = [];
  spoolsGot: boolean[] = [];
  feathersGot: boolean[] = [];
  /** Nests knocked down in this room. */
  nestsDown: boolean[] = [];
  /** Standing at Biscuit's shrine (traits can be learned). */
  atShrine = false;
  buff: Buffs = { noFury: 0, bagel: 0, mega: 0 };
  pack!: Pack;
  rope!: Rope;
  time = 0;
  won = false;
  clearT = 0;
  handled = 0;
  spawnT = 4;
  knightT = 0;
  clapperCd = 0;
  rang = false;
  bucketCd = 0;
  events: SimEvent[] = [];
  /** Per-room memory: open gates, eaten bread, opened chests. Persists across rooms and saves. */
  world: Record<string, RoomMemory> = {};
  /** The door Rocco came in through; dying or restarting puts him back there. Null: the room's start. */
  entryDoor: string | null = null;
  /** Last spot on solid ground well away from water, for respawning after a fall in rooms without fixed respawns. */
  lastSafe: Vec = { x: 0, y: 0 };
  private nextId = 1;

  constructor(opts: { tuning?: Partial<Tuning>; seed?: number; room?: RoomDef; kit?: Kit } = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning };
    this.kit = opts.kit ?? new Kit();
    this.rng = mulberry32(opts.seed ?? 1);
    this.reset(opts.room ?? ROOM_01);
  }

  // ------------------------------------------------ derived stats

  /** Effective leash strength: bench base + equipped leash + Chain Bagel buff. */
  str(): number { return this.tuning.strength + this.kit.stat('str') + (this.buff.bagel > 0 ? 2 : 0); }
  leashLen(): number { return this.tuning.leash + this.kit.stat('len'); }
  /** Goose damage multiplier from Goose Power. */
  /** Goose Power: the bench base plus one for every two traits Biscuit has learned. */
  power(): number { return this.tuning.power + Math.floor(this.kit.traits.size / 2); }
  pw(): number { return (0.6 + 0.4 * this.power()) * (this.kit.has('b1') ? 1.35 : 1); }
  /** Positive when the goose outclasses the leash. */
  gap(): number { return this.power() - this.str(); }
  refuseChance(): number {
    const g = this.gap();
    return this.goose.furious > 0 ? clamp(0.3 + 0.18 * g, 0.05, 0.8) : clamp(0.1 * g, 0, 0.4);
  }
  strainRate(): number { return Math.max(0, 0.15 + 0.35 * this.gap()) * this.kit.stat('strain'); }

  // ------------------------------------------------ lifecycle

  /** Start fresh in a room: full hearts, a full pack, room memory kept. */
  reset(def: RoomDef = this.room?.def ?? ROOM_01): void {
    const s = def.playerStart;
    this.player = { x: s.x, y: s.y, r: C.playerRadius, vx: 0, vy: 0, hp: C.maxHp, inv: 0, air: false, pull: null, fx: 1, fy: 0, dead: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, guard: 0 };
    this.pack = { enabled: !!(def.refills?.length || def.barrels?.length), water: 1, holes: 0, patches: 0, needles: C.kitNeedles, lastWater: { ...s }, refilling: false };
    this.buff = { noFury: 0, bagel: 0, mega: 0 };
    this.time = 0; this.won = false; this.clearT = 0; this.handled = 0;
    this.entryDoor = null;
    this.setupRoom(def, s);
    this.events.push({ type: 'reset' });
    this.say(this.pack.enabled ? `${def.name}. Keep the koi wet. Biscuit is already mad.` : `${def.name}. The goose is already mad.`);
  }

  /**
   * Travel into a room through one of its doors (or its start when `doorId` is null).
   * Pack, kit and buffs carry over. `revive` (after Bimbo faints, or a restart) refills the pack and closes all
   * but a couple of tears with emergency knots.
   * `keepMemory` false skips recording the room being left (loading a save replaces room memory wholesale).
   */
  enterRoom(def: RoomDef, doorId: string | null, revive = false, keepMemory = true): void {
    if (keepMemory) this.remember();
    const door = doorId ? def.doors?.find(d => d.id === doorId) : undefined;
    const s = door ? door.spawn : def.playerStart;
    const hp = revive ? C.maxHp : this.player?.hp ?? C.maxHp;
    this.player = { x: s.x, y: s.y, r: C.playerRadius, vx: 0, vy: 0, hp, inv: 0.8, air: false, pull: null,
      fx: door ? Math.sign(def.width / 2 - s.x) || 1 : 1, fy: 0, dead: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, guard: 0 };
    const pk = this.pack;
    this.pack = { enabled: !!(def.refills?.length || def.barrels?.length), water: revive ? 1 : pk?.water ?? 1,
      holes: revive ? Math.min(pk?.holes ?? 0, C.faintHolesKept) : pk?.holes ?? 0, patches: pk?.patches ?? 0,
      needles: pk?.needles ?? C.kitNeedles, lastWater: { ...s }, refilling: false };
    this.won = false;
    this.entryDoor = door ? door.id : null;
    this.setupRoom(def, s);
    this.events.push({ type: 'reset' }, { type: 'room', id: def.id });
    if (this.storming) this.say('A storm breaks over the pool. Puddles will slow you, and the water is hard to reach.');
  }

  /** Back to where Rocco entered the current room, hearts refilled. */
  restartRoom(): void {
    if (!this.room.def.doors) { this.reset(); return; }
    this.enterRoom(this.room.def, this.entryDoor, true);
  }

  /** The closest spot a critter can climb out onto: dry, inside the room, clear of walls (docks and islands count). */
  nearestLand(x: number, y: number, r: number): Vec {
    const room = this.room, { width, height } = room.def;
    for (let d = 12; d < 900; d += 12) {
      const n = Math.max(12, Math.round(d / 6));
      let best: Vec | null = null, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (px < r + 20 || py < r + 20 || px > width - r - 20 || py > height - r - 20) continue;
        if (room.inPit(px, py, -r)) continue;
        const o = { x: px, y: py, r }; if (room.collide(o)) continue;
        const dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = { x: px, y: py }; }
      }
      if (best) return best;
    }
    return { x, y };
  }

  /** Where Bimbo is: on Rocco's back, opposite the way he faces. */
  packPoint(dist = 10): Vec {
    const p = this.player, l = Math.hypot(p.fx, p.fy) || 1;
    return { x: p.x - (p.fx / l) * dist, y: p.y - (p.fy / l) * dist };
  }

  /**
   * Entranced critters want Bimbo. They circle to Rocco's back, wind up (telegraphed), then strike at the pack:
   * frogs leap or lash their tongues, Old Snapper rears and charges. Returns the critter's walking velocity.
   */
  private critterAI(e: Enemy, dt: number, d: number, slow: number): [number, number] {
    const p = this.player, frog = !e.heavy;
    e.modeT += dt; e.cd -= dt;
    if (e.stun > 0 && e.mode !== 'recover' && e.mode !== 'stalk') { e.mode = 'recover'; e.modeT = 0; }
    if (e.stun > 0) return [0, 0];
    const aware = d < (AGGRO[e.kind] ?? 200) || e.mode !== 'stalk';
    const to = (x: number, y: number, sp: number): [number, number] => {
      const [ux, uy, l] = dirTo(e, { x, y }); return l < 2 ? [0, 0] : [ux * sp, uy * sp];
    };
    const bimbo = this.packPoint(10);
    const hitsBimbo = (reach: number) => Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < e.r + reach;
    switch (e.mode) {
      case 'stalk': {
        if (!aware || p.dead) return [0, 0];
        // sneak round behind: aim for a point past the pack, wobbling side to side so a pack of frogs fans out
        const back = this.packPoint(frog ? 46 : 30), perp = { x: -p.fy, y: p.fx };
        const wob = Math.sin(this.time * (frog ? 2.3 : 1.1) + e.id * 1.7) * (frog ? 38 : 18);
        const tx = back.x + perp.x * wob, ty = back.y + perp.y * wob;
        const db = Math.hypot(bimbo.x - e.x, bimbo.y - e.y);
        if (e.cd <= 0 && db < (frog ? 150 : 170)) {
          e.mode = 'wind'; e.modeT = 0; e.hit = false;
          // lead the target a little: Rocco is probably still moving
          e.tx = bimbo.x + p.vx * 0.25; e.ty = bimbo.y + p.vy * 0.25;
          e.attack = !frog ? (db < 50 ? 'bite' : 'charge') : db < 70 || this.rng() < 0.45 ? 'leap' : 'lash';
          if (e.attack === 'lash' && db > 140) e.attack = 'leap';
          return [0, 0];
        }
        // the odd sideways hop makes frogs hard to read
        if (frog && this.rng() < dt * 0.8) { const a = this.rng() * Math.PI * 2; e.vx += Math.cos(a) * 160; e.vy += Math.sin(a) * 160; }
        return to(tx, ty, e.spd * slow);
      }
      case 'wind': {
        const wind = e.attack === 'lash' ? 0.38 : e.attack === 'bite' ? 0.32 : frog ? 0.42 : 0.7;
        if (e.modeT < wind) return [0, 0];
        e.mode = e.attack === 'lash' ? 'lash' : e.attack === 'leap' ? 'leap' : 'charge'; e.modeT = 0;
        if (e.mode !== 'lash') {
          const [ux, uy] = dirTo(e, { x: e.tx, y: e.ty });
          const sp = e.attack === 'leap' ? 360 : e.attack === 'bite' ? 260 : 330;
          e.vx = ux * sp; e.vy = uy * sp;
        }
        return [0, 0];
      }
      case 'leap': case 'charge': {
        // momentum carries it (velocity set at launch; friction applies). It can overshoot into the water.
        const len = e.mode === 'leap' ? 0.34 : e.attack === 'bite' ? 0.22 : 0.75;
        if (e.mode === 'charge' && e.attack === 'charge') { const [ux, uy] = dirTo({ x: 0, y: 0 }, { x: e.vx, y: e.vy }); e.vx = ux * 330; e.vy = uy * 330; }
        if (!e.hit && hitsBimbo(p.r + 4)) { e.hit = true; this.hurtPlayer(1, e.heavy, e, e.attack); e.vx *= -0.3; e.vy *= -0.3; }
        if (e.modeT > len) { e.mode = 'recover'; e.modeT = 0; }
        return [0, 0];
      }
      case 'lash': {
        // the tongue shoots out to the marked spot and back (0.22 s); it slurps if Bimbo is on the line
        const out = Math.min(1, e.modeT / 0.11);
        if (!e.hit && out >= 1) {
          const [ux, uy, l] = dirTo(e, { x: e.tx, y: e.ty });
          const reach = Math.min(l + 10, 150);
          const bx = bimbo.x - e.x, by = bimbo.y - e.y, along = bx * ux + by * uy, off = Math.abs(bx * uy - by * ux);
          if (along > 0 && along < reach && off < 14) { e.hit = true; this.hurtPlayer(1, false, e, 'lash'); }
          else e.hit = true;    // missed: one try per lash
        }
        if (e.modeT > 0.22) { e.mode = 'recover'; e.modeT = 0; }
        return [0, 0];
      }
      case 'recover': {
        if (e.modeT > (frog ? 0.55 : 1.0)) { e.mode = 'stalk'; e.modeT = 0; e.cd = (frog ? 0.7 : 1.4) + this.rng() * 1.1; }
        return [0, 0];
      }
      default: e.mode = 'recover'; e.modeT = 0; return [0, 0];
    }
  }

  private useDoor(d: Door): void {
    if (d.to === 'END') {
      this.remember();
      this.won = true; this.clearT = this.time; this.events.push({ type: 'won' });
      return;
    }
    const next = ROOMS[d.to];
    if (!next) { this.say(`${d.label ?? 'That way'}: not built yet.`); return; }
    const g = this.goose;
    if (g.feral || g.state === 'loose') this.say('Biscuit stomps after you, still cross.');
    this.enterRoom(next, d.toDoor);
  }

  private openChest(): void {
    const c = this.room.def.chest!, id = this.room.def.id;
    this.world[id] = { ...(this.world[id] ?? { gateOpen: false, bread: [...this.breadGot], rang: this.rang }), chest: true };
    this.fx('chest', c.x, c.y - 10);
    if (this.kit.findLeash(c.leash)) {
      this.goose.strain = 0;
      this.say(`Found the ${leashById(c.leash).name}! Equipped. ${leashById(c.leash).effect}`);
    } else this.say('The chest is empty. You already have this one.');
  }

  /** Can Biscuit learn this trait now? Needs the shrine, a Golden Feather and the trait before it in the branch. */
  canLearn(id: TraitId): boolean {
    const t = traitById(id), k = this.kit;
    if (k.has(id) || !this.atShrine || k.mats.feather < TRAIT_COST) return false;
    return t.tier === 1 || k.has(TRAITS.find(o => o.branch === t.branch && o.tier === t.tier - 1)!.id);
  }

  learnTrait(id: TraitId): boolean {
    if (!this.canLearn(id)) return false;
    const before = this.power();
    this.kit.mats.feather -= TRAIT_COST; this.kit.traits.add(id);
    this.fx('chest', this.goose.x, this.goose.y - 20);
    this.say(`Biscuit learned ${traitById(id).name}!` + (this.power() > before ? ` Goose Power is now ${this.power()}. Mind the leash.` : ''));
    return true;
  }

  /** True once the room's chest has been opened. */
  chestOpen(): boolean { return !!this.world[this.room.def.id]?.chest; }

  /** Store the current room's gate, bread and chest state. */
  private remember(): void {
    if (!this.room) return;
    const id = this.room.def.id;
    this.world[id] = { gateOpen: !!this.room.def.gate && !this.room.gateClosed, bread: [...this.breadGot],
      chest: this.world[id]?.chest ?? false, rang: this.rang, kits: [...this.kitsGot], spools: [...this.spoolsGot], feathers: [...this.feathersGot], nests: [...this.nestsDown],
      bushes: [...this.room.bushAlive], barrels: [...this.barrelWater],
      boss: this.world[id]?.boss || this.enemies.some(e => BOSS.has(e.kind) && e.woke > 0) };
  }

  private setupRoom(def: RoomDef, s: Vec): void {
    this.room = new Room(def);
    const mem = this.world[def.id];
    if (mem?.gateOpen) this.room.gateClosed = false;
    this.goose = { x: s.x - 30 * (this.player.fx || 1), y: s.y, vx: 0, vy: 0, state: 'held', feral: false, strain: 0, target: null, ox: 0, oy: 0, face: 1,
      t: 0, fury: 0, furious: 0, tug: 0, honkCd: 0, biteT: 0, grabCd: 0, drag: 0 };
    this.enemies = def.enemies.map(e => this.mkEnemy(e.kind, e.x, e.y));
    if (mem?.boss) for (const e of this.enemies) if (BOSS.has(e.kind)) { e.woke = 0.001; e.hp = 0; }   // already beaten: friendly
    this.items = []; this.darts = []; this.puddles = []; this.puddleT = 1;
    this.breadGot = def.breadSpots.map((_, i) => mem?.bread[i] ?? false);
    this.kitsGot = (def.kits ?? []).map((_, i) => mem?.kits?.[i] ?? false);
    this.spoolsGot = (def.spools ?? []).map((_, i) => mem?.spools?.[i] ?? false);
    this.feathersGot = (def.feathers ?? []).map((_, i) => mem?.feathers?.[i] ?? false);
    this.nestsDown = (def.nests ?? []).map((_, i) => mem?.nests?.[i] ?? false);
    if (mem?.bushes) this.room.bushAlive = (def.bushes ?? []).map((_, i) => mem.bushes![i] ?? true);
    this.barrelWater = (def.barrels ?? []).map((_, i) => mem?.barrels?.[i] ?? 0.6);
    this.shroomCd = (def.shrooms ?? []).map(() => 0);
    this.atShrine = false;
    this.rope = new Rope(s);
    this.lastSafe = { ...s };
    this.spawnT = 4; this.knightT = 0; this.clapperCd = 0; this.rang = mem?.rang ?? false; this.bucketCd = 0;
  }

  /** True while an enemy can fight: alive, not sinking, not woken. */
  private active(e: Enemy): boolean { return !e.dead && !e.falling && !e.woke && e.air <= 30 && e.mode !== 'tunnel'; }

  mkEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const k = HEAVY.has(kind), boss = BOSS.has(kind);
    const stats: Partial<Record<EnemyKind, [number, number, number]>> = {   // hp, radius, speed
      heron: [HERON_HP, 24, 0], king: [KING_HP, 34, 48], elder: [ELDER_HP, 26, 46], squirrel: [2, 10, 115], badger: [10, 18, 50],
    };
    const [hp, r, spd] = stats[kind] ?? [k ? 8 : 3, k ? 20 : 13, k ? 42 : 78];
    return { id: this.nextId++, kind, x, y, r, hp, max: hp, heavy: k, stun: 0,
      vx: 0, vy: 0, falling: 0, dead: false, hitT: 0, spd, woke: 0,
      mode: 'stalk', modeT: 0, cd: boss ? 2 : 0.8 + this.rng() * 1.2, tx: x, ty: y, hit: false, attack: 'leap', grip: 0, wet: false, air: 0, hx: x, hy: y, grip2: 0 };
  }

  /** Take and clear the events produced since the last drain. */
  drainEvents(): SimEvent[] { const e = this.events; this.events = []; return e; }

  private say(text: string): void { this.events.push({ type: 'say', text }); }
  private fx(kind: FxKind, x: number, y: number, extra: Partial<Extract<SimEvent, { type: 'fx' }>> = {}): void {
    this.events.push({ type: 'fx', kind, x, y, ...extra });
  }
  private pick<K extends keyof typeof QUIPS>(k: K): string {
    const a = QUIPS[k];
    return a[Math.floor(this.rng() * a.length)]!;
  }

  // ------------------------------------------------ verbs

  fling(aim: Vec): void {
    const g = this.goose, p = this.player;
    if (this.won || p.dead || g.state !== 'held') return;
    let [dx, dy] = dirTo(p, aim);
    if (g.furious > 0) {
      const a = Math.atan2(dy, dx) + (this.rng() - 0.5) * 0.7;
      dx = Math.cos(a); dy = Math.sin(a);
    }
    const fs = this.tuning.fling * this.kit.stat('fling') * (this.kit.has('f1') ? 1.15 : 1);
    g.x = p.x + dx * 18; g.y = p.y + dy * 18; g.vx = dx * fs; g.vy = dy * fs;
    g.state = 'flying'; g.face = dx >= 0 ? 1 : -1;
    this.say(this.pick('fling'));
  }

  /** The Ferryman rows once he's awake (he gave you his oar). */
  ferryReady(): boolean { return this.kit.oar; }

  /** Sail to another ferry stop you've visited: arrive on its landing, with the room as you left it. */
  ferryTo(id: string): boolean {
    const def = ROOMS[id];
    if (!def?.ferry || !this.kit.ferries.has(id) || !this.ferryReady() || id === this.room.def.id) return false;
    this.enterRoom(def, null);
    const p = this.player, g = this.goose, f = def.ferry;
    const spots = [[0, 30], [30, 22], [-30, 22], [40, 0], [-40, 0], [0, -30]];
    const ok = spots.find(([dx, dy]) => !this.room.inPit(f.x + dx!, f.y + dy!, 8) && !this.room.collide({ x: f.x + dx!, y: f.y + dy!, r: p.r })) ?? [0, 30];
    p.x = f.x + ok[0]!; p.y = f.y + ok[1]!; p.vx = p.vy = 0;
    g.x = p.x - 30; g.y = p.y; g.state = 'held';
    this.rope = new Rope(p);
    this.lastSafe = { x: p.x, y: p.y };
    this.say(`The Ferryman sets you down at ${f.name}. "Mind the fish."`);
    return true;
  }

  /** True in the safe opening of a roll. */
  rollSafe(): boolean { return this.player.roll > C.rollTime - C.rollIframes; }

  /**
   * Dodge roll in the direction Rocco is moving (or facing). Being yanked through the air, a roll is
   * impossible. The leash still applies: see stepGoose, where the rope can catch him mid-roll.
   */
  roll(input?: InputFrame): void {
    const p = this.player, g = this.goose, pk = this.pack;
    if (this.won || p.dead || p.pull || p.air || p.roll > 0 || p.rollCd > 0) return;
    let dx = input?.moveX ?? 0, dy = input?.moveY ?? 0;
    let l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = p.fx; dy = p.fy; l = Math.hypot(dx, dy) || 1; }
    p.rdx = dx / l; p.rdy = dy / l;
    p.roll = C.rollTime; p.rollCd = C.rollTime + C.rollCooldown;
    p.vx = p.rdx * C.rollSpeed; p.vy = p.rdy * C.rollSpeed;
    if (pk.enabled) {
      const slosh = C.rollSlosh * (1 + 0.5 * pk.holes);
      pk.water = Math.max(0.001, pk.water - slosh);
      if (pk.holes) this.fx('splash', p.x - p.rdx * 14, p.y - 30);
    }
    if (g.state === 'held') g.drag = 0.5;       // he didn't see that coming
  }

  /**
   * How much of the rope's pull Biscuit wins when it goes taut between them (0 = Rocco drags him
   * wherever, 1 = he drags Rocco). A goose stronger than his leash, or furious, pulls harder.
   */
  gooseWeight(): number {
    const g = this.goose;
    return clamp(0.28 + 0.12 * this.gap() + (g.furious > 0 ? 0.15 : 0), 0.15, 0.65);
  }

  /** The rope is taut between Rocco and Biscuit: split the correction and the separating speed between them. */
  private taut(dx: number, dy: number, d: number, L: number, w: number): void {
    const p = this.player, g = this.goose, room = this.room;
    const nx = dx / d, ny = dy / d, ex = d - L;
    // Rocco gets pulled toward Biscuit by his share, unless that would drag him into the water: he braces
    let pw = p.pull || p.air ? 0 : w * (p.guard > 0 ? C.guardBrace : 1);   // the planted oar braces him
    if (pw > 0 && (room.inPit(p.x + nx * ex * pw, p.y + ny * ex * pw, 6) || room.inPit(p.x + nx * 26, p.y + ny * 26, 6))) pw = 0;
    p.x += nx * ex * pw; p.y += ny * ex * pw; room.collide(p);
    const gx = p.x + nx * L, gy = p.y + ny * L;
    g.x = gx; g.y = gy;
    // inelastic rope: remove the separating speed, shared by weight
    const vr = (g.vx - p.vx) * nx + (g.vy - p.vy) * ny;
    if (vr > 0) {
      g.vx -= nx * vr * (1 - pw); g.vy -= ny * vr * (1 - pw);
      p.vx += nx * vr * pw; p.vy += ny * vr * pw;
    }
  }

  yank(): void {
    const g = this.goose, p = this.player;
    if (this.won || p.dead) return;
    if (this.rng() < this.refuseChance() && g.state !== 'held') { this.say(this.pick('refuse')); return; }
    if (g.state === 'flying') { g.state = 'held'; g.vx *= -0.3; g.vy *= -0.3; return; }
    if (g.state !== 'latched' || !g.target) return;
    const t = g.target;
    if (!isPost(t) && t.kind === 'elder' && t.mode === 'shell') {
      t.mode = 'flipped'; t.modeT = 0;
      this.fx('slam', t.x, t.y); this.say('HEAVE! Old Snapper flips onto his back!');
      this.hint('flip', 'Flipped! He can\'t get up for a moment: bite, bite, bite!');
      return;
    }
    if (isPost(t) || t.heavy) {
      p.pull = t; p.air = true;
      this.say(isPost(t) ? 'Wheee!' : t.kind === 'knight' ? 'The knight drags you in. HEADBUTT incoming.' : 'Biscuit drags you across. HEADBUTT incoming!');
    } else {
      const [dx, dy] = dirTo(t, p);
      const ys = this.tuning.yank * this.kit.stat('yank') * 0.66;
      t.vx = dx * ys; t.vy = dy * ys; t.stun = Math.max(t.stun, 0.6);
      g.state = 'held';
    }
  }

  honk(aim: Vec): void {
    const g = this.goose;
    if (this.won || this.player.dead || g.honkCd > 0 || g.state === 'loose') return;
    g.honkCd = C.honkCooldown * (this.kit.has('h3') ? 0.6 : 1);
    const mega = this.buff.mega > 0;
    if (mega) this.buff.mega--;
    const shed = this.kit.stat('honkStrain');
    if (shed) g.strain *= 1 - shed;
    const furyB = g.furious > 0 || mega;
    const range = (furyB ? 220 : 155) * (0.85 + 0.15 * this.power()) * this.kit.stat('honkR') * (this.kit.has('h1') ? 1.25 : 1);
    const cone = furyB ? 0.9 : 0.62;
    const [dx, dy] = dirTo(g, aim);
    const ang = Math.atan2(dy, dx);
    this.fx('honk', g.x, g.y, { a: ang, cone, range });
    this.honkShrooms(g.x, g.y, ang, range, cone);
    g.face = dx >= 0 ? 1 : -1;
    for (const e of this.enemies) {
      if (!this.active(e)) continue;
      const ex = e.x - g.x, ey = e.y - g.y, d = Math.hypot(ex, ey);
      if (d < range + e.r && Math.abs(angDiff(Math.atan2(ey, ex), ang)) < cone) {
        if (e.kind === 'elder') {
          if (e.mode === 'stalk' || e.mode === 'wind' || e.mode === 'tired') {
            e.mode = 'shell'; e.modeT = 0;
            this.say('HONK! Old Snapper yanks his head into his shell.');
            this.hint('shell', 'He\'s hiding! Fling Biscuit at him [Click], then YANK [E] to flip him over.');
          }
          continue;
        }
        const k = (e.heavy ? 260 : 470) * (furyB ? 1.4 : 1) * (0.8 + 0.1 * this.power());
        e.vx += (ex / (d || 1)) * k; e.vy += (ey / (d || 1)) * k; e.stun = Math.max(e.stun, 1.3 + (this.kit.has('h2') ? 0.7 : 0));
        if (g.state === 'latched' && g.target === e) g.state = 'held';
      }
    }
    const fy = this.room.def.ferry;
    if (fy && this.ferryReady() && Math.hypot(fy.x - this.player.x, fy.y - this.player.y) < 90) {
      this.fx('ring', fy.x, fy.y - 30);
      this.say('HONK! Far off, a heron answers. Where to?');
      this.events.push({ type: 'ferry' });
      return;
    }
    const bell = this.room.def.bell;
    if (bell && !bell.parryOnly) {
      const bx = bell.x - g.x, by = bell.y - g.y, bd = Math.hypot(bx, by);
      if (bd < range + bell.r + 30 && Math.abs(angDiff(Math.atan2(by, bx), ang)) < cone + 0.2) {
        this.fx('ring', bell.x, bell.y);
        if (this.room.gateClosed) { this.room.gateClosed = false; this.say('DING! The cage is open.'); }
        else this.say('DING!');
        if (!this.rang || (this.clapperCd <= 0 && this.rng() < 0.35)) { this.drop('clapper', bell.x - 30, bell.y + 30); this.clapperCd = 6; }
        this.rang = true;
        return;
      }
    }
    this.say(mega ? 'MEGA HONK' : this.pick('honk'));
  }

  letGo(): void {
    const g = this.goose;
    if (this.won || this.player.dead) return;
    if (g.state !== 'held' && g.state !== 'latched') return;
    g.target = null;
    if (g.furious > 0) this.goFeral('You let a furious goose go. Bad idea.');
    else { g.grabCd = C.grabCooldown; g.state = 'loose'; g.feral = false; g.t = 4; this.say('Goose unleashed. Good luck everyone.'); }
  }

  private goFeral(msg: string): void {
    const g = this.goose, p = this.player;
    g.grabCd = C.grabCooldown; g.state = 'loose'; g.feral = true; g.t = 99; g.target = null;
    p.pull = null; p.air = false;
    this.say(msg);
  }

  private calm(): void {
    const g = this.goose;
    g.fury = 0; g.furious = 0; g.strain = 0;
    if (g.state === 'loose') g.state = 'returning';
    g.feral = false;
  }

  feedBread(): void {
    if (this.won || this.player.dead) return;
    const k = this.kit;
    if (!(k.bread[k.active] > 0)) {
      const alt = (Object.keys(k.bread) as BreadId[]).find(id => k.bread[id] > 0);
      if (alt) { k.active = alt; this.feedBread(); return; }
      this.say('No bread. The goose notices.');
      return;
    }
    const id = k.active, g = this.goose;
    k.bread[id]--;
    this.fx('bread', g.x, g.y);
    const wasFeral = g.feral;
    if (id === 'pepper') {
      g.fury = 100;
      if (g.furious <= 0) g.furious = this.furyTime();
      this.say('Ghost Pepper Roll. Oh no. Oh YES.');
      return;
    }
    this.calm();
    if (id === 'stale') this.say(wasFeral ? 'Bread accepted. Truce.' : 'Bread. The goose is (briefly) at peace.');
    if (id === 'sour') { this.buff.noFury = 8; this.say('Sourdough of Serenity. Zen goose for 8 s.'); }
    if (id === 'bagel') { this.buff.bagel = 20; this.say('Chain Bagel. Leash reinforced +2 for 20 s.'); }
    if (id === 'muffin') {
      if (this.pack.enabled) { this.pack.water = Math.min(1, this.pack.water + 0.25); this.say('Biscuit spits a beakful of pond water into the pack. Bimbo: "...thanks?"'); }
      else { this.player.hp = Math.min(C.maxHp, this.player.hp + 1); this.say('The goose coughs up a heart. +1 HP. Gross.'); }
    }
    if (id === 'bun') { this.buff.mega = 5; this.say('Clapper Bun. He rings inside. 5 mega honks.'); }
  }

  cycleBread(): void {
    const id = this.kit.cycleBread();
    this.say(`Bread ready: ${breadById(id).name} ×${this.kit.bread[id]}`);
  }

  /** Sew a patch over one tear: one twine and one needle use from a sewing kit. */
  patchPack(): boolean {
    const pk = this.pack;
    if (!pk.enabled || this.won || this.player.dead) return false;
    if (pk.holes <= 0) { this.say('No tears to patch. Bimbo blows you a bubble.'); return false; }
    if (pk.needles <= 0) { this.say('No needle left! Find a sewing kit before Bimbo runs dry.'); return false; }
    if (this.kit.mats.fluff < C.patchCost) { this.say('No twine! Frogs carry it, and spools lie around the marsh.'); return false; }
    this.kit.mats.fluff -= C.patchCost; pk.needles--;
    pk.holes--; pk.patches++;
    this.fx('patch', this.player.x - 10, this.player.y - 30);
    this.say(pk.holes ? `Patched one. ${pk.holes} tear${pk.holes > 1 ? 's' : ''} still leaking.` : 'All patched. Bimbo stops glaring at you.');
    return true;
  }

  /** Leak in pack fractions per second. */
  leakRate(): number { return C.packDrain + C.holeDrain * this.pack.holes; }

  private stepPack(dt: number): void {
    const pk = this.pack, p = this.player;
    if (!pk.enabled || p.dead) return;
    const was = pk.refilling;
    pk.refilling = !p.air && this.room.inRefill(p.x, p.y);
    if (pk.refilling) {
      pk.water = Math.min(1, pk.water + C.refillRate * (this.storming ? this.room.def.stormRefill ?? 1 : 1) * dt);
      pk.lastWater = { x: p.x, y: p.y };
      if (!was && pk.water < 0.98) { this.fx('splash', p.x - 10, p.y - 34); this.say('Refilling the pack. Bimbo perks up.'); }
      return;
    }
    const before = pk.water;
    pk.water = Math.max(0, pk.water - this.leakRate() * (this.storming ? this.room.def.stormDrain ?? 1 : 1) * dt);
    this.waterWarnings(before);
  }

  private waterWarnings(before: number): void {
    const pk = this.pack, p = this.player;
    if (before >= 0.3 && pk.water < 0.3) this.say('Bimbo is gasping! Find water, or a sewing kit for those tears.');
    if (pk.water <= 0 && !p.dead) {
      this.fx('faint', p.x, p.y - 40);
      this.say('Bimbo fainted! Rocco dunks him and ties emergency knots…');
      p.dead = 1.2; p.vx = p.vy = 0; p.pull = null; p.air = false;
    }
  }

  craftLeash(id: LeashId): boolean {
    const ok = this.kit.craftLeash(id);
    if (ok) { this.goose.strain = 0; this.say(`Crafted & equipped: ${leashById(id).name}`); }
    return ok;
  }
  equipLeash(id: LeashId): boolean {
    const ok = this.kit.equipLeash(id);
    if (ok) { this.goose.strain = 0; this.say(`Equipped: ${leashById(id).name}`); }
    return ok;
  }
  craftBread(id: BreadId): boolean { return this.kit.craftBread(id); }

  // ------------------------------------------------ helpers

  drop(mat: ItemId, x: number, y: number, n = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, sp = 60 + this.rng() * 80;
      this.items.push({ mat, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
    }
  }

  private addFury(v: number): void {
    const g = this.goose;
    if (g.furious > 0 || this.buff.noFury > 0) return;
    g.fury = Math.min(100, g.fury + v * this.tuning.fury * this.kit.stat('furyGain') * (this.kit.has('z1') ? 1.3 : 1));
    if (g.fury >= 100) { g.furious = this.furyTime(); this.say(this.pick('furious')); }
  }

  /** Seconds a Fury lasts. */
  furyTime(): number { return C.furiousSeconds * this.kit.stat('furyDur') + (this.kit.has('z2') ? 2 : 0);
  }

  nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!this.active(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  damage(e: Enemy, amt: number): void {
    if (e.dead) return;
    if (e.kind === 'elder' && !e.woke) {
      if (e.mode === 'shell') {
        if (this.elderClonkT <= 0) { this.say('CLONK. He\'s in his shell. Yank [E] while Biscuit holds on to flip him!'); this.elderClonkT = 3; }
        this.fx('block', e.x, e.y - 10);
        return;
      }
      amt *= e.mode === 'flipped' ? 2.5 : e.mode === 'tired' ? 2 : 0.5;    // armoured unless winded or flipped
    }
    e.hp -= amt; e.hitT = 0.15;
    if (e.hp > 0) return;
    this.handled++;
    if (ENTRANCED.has(e.kind)) {
      e.woke = 0.001; e.stun = 0; e.hp = 0;
      this.fx('wake', e.x, e.y);
      if (BOSS.has(e.kind)) {
        this.darts = [];
        for (const o of this.enemies) if (o !== e && this.active(o)) { o.woke = 0.001; this.fx('wake', o.x, o.y); }   // his frogs wake too
        this.room.gateClosed = false;
        this.world[this.room.def.id] = { ...(this.world[this.room.def.id] ?? { gateOpen: true, bread: [...this.breadGot], chest: false, rang: this.rang }), boss: true, gateOpen: true };
        if (e.kind === 'elder') this.say('Old Snapper blinks. The red drains away. "Hmph. Bimbo, is it? Go on through, the both of you."');
        else if (e.kind === 'king' || this.kit.oar) this.say(e.kind === 'king' ? 'The Burrow King shakes his great head. "...What was I digging for? Go on, little raccoon. Mind the fish."'
          : 'The red drains from the Heron\'s eyes. "...Raccoon. I am the Ferryman. The way on is open."');
        // his gifts go straight into the satchel (wherever the fight ended), and he refills Bimbo
        const elder = e.kind === 'elder';
        this.kit.mats.crest++; this.kit.mats.chain += elder ? 2 : 3; this.kit.mats.fluff += elder ? 3 : 4; this.kit.mats.feather += elder ? 1 : 2;
        if (!elder) this.kit.mats.egg++;
        const oarGift = e.kind === 'heron' && !this.kit.oar;
        if (oarGift) {
          this.kit.oar = true;
          this.say('"...Raccoon. I am the Ferryman. Take my oar: hold it up [G / right mouse] to guard the fish. Raise it as a blow lands and bat it back."');
        }
        this.pack.needles += C.kitNeedles; this.pack.water = 1;
        if (e.kind === 'heron') { e.air = 0; e.x = e.hx; e.y = e.hy; }
        this.puddles = [];
        this.fx('pick', this.player.x, this.player.y - 46, { text: elder ? "A Golden Feather, Snapper's Crest, 2 Scute, 3 Twine, a sewing kit" : (oarGift ? "THE FERRYMAN'S OAR · " : '') + "2 Golden Feathers, Snapper's Crest, Golden Egg, 3 Scute, 4 Twine, a sewing kit" });
        this.fx('chest', this.player.x, this.player.y - 20);
      } else this.say(e.heavy ? 'Old Snapper blinks. The red fades from his eyes.' : this.pick('wake'));
    } else { e.dead = true; this.fx('poof', e.x, e.y); }
    if (BOSS.has(e.kind)) { /* gifts went straight to the satchel */ }
    else if (!e.heavy) { this.drop('fluff', e.x, e.y); if (this.rng() < 0.45) this.drop('crust', e.x, e.y); }
    else { this.drop('chain', e.x, e.y, 2); if (e.kind === 'snapper' || e.kind === 'knight') this.drop('crest', e.x, e.y); }
    if (this.goose.target === e && this.goose.state === 'latched') this.goose.state = 'held';
  }

  /**
   * A hit on Rocco. In world rooms it lands on the backpack: it either tears it (the leak rate goes up)
   * or splashes water out. In Room 01 it costs hearts, as in the prototype.
   */
  hurtPlayer(amt = 1, heavy = false, from?: Vec, kind?: AttackKind): void {
    const p = this.player, pk = this.pack;
    if (p.inv > 0 || p.air || p.dead || this.rollSafe()) return;
    if (from && kind !== 'thorn' && kind !== 'erupt' && kind !== 'slam' && this.blocks(from)) { this.blocked(from, heavy, kind); return; }
    p.inv = C.invulnerable;
    if (!pk.enabled) {
      p.hp -= amt;
      if (p.hp <= 0) { p.dead = 0.9; this.say('The janitor is out. Resetting…'); }
      return;
    }
    const before = pk.water;
    // which side did it come from? Bimbo rides on Rocco's back, so hits there tear far more often
    let side = 1;
    if (from) {
      const fl = Math.hypot(p.fx, p.fy) || 1, ox = from.x - p.x, oy = from.y - p.y;
      side = (ox * -p.fx + oy * -p.fy) / fl > 0 ? C.backHitTear : C.frontHitTear;
    }
    if (kind === 'acorn') side *= 0.5;
    if (kind === 'thorn') side *= 1.5;
    const bk = this.packPoint(14);
    if (kind === 'lash') {
      pk.water = Math.max(0, pk.water - C.slurpSpill * amt);
      this.fx('splash', bk.x, bk.y - 34);
      if (pk.water > 0.3) this.say(this.pick('slurp'));
    } else if (pk.holes < C.maxHoles && this.rng() < (heavy ? C.heavyHoleChance : C.holeChance) * side * (this.kit.has('z3') && this.goose.furious > 0 ? 0.5 : 1)) {
      pk.holes++;
      this.fx('tear', bk.x, bk.y - 30);
      this.say(pk.holes === 1 ? 'RIP! It went for Bimbo and tore the pack. [P] to patch.' : `Another tear! ${pk.holes} leaking now.`);
    } else {
      pk.water = Math.max(0, pk.water - (heavy ? C.heavySpill : C.hitSpill) * amt * (side < 1 ? 0.6 : 1));
      this.fx('splash', bk.x, bk.y - 34);
      const heavyLine = kind === 'slam' ? 'THOOM! The Heron lands right on the pack!' : kind === 'dart' ? 'A feather dart smacks into the pack!'
        : kind === 'erupt' ? 'The ground bursts open under Bimbo!' : kind === 'rock' ? 'A rock clonks the pack!'
        : kind === 'charge' && this.enemies.some(o => o.kind === 'king') ? 'The Burrow King bowls you over!'
        : kind === 'spear' || kind === 'peck' ? 'The beak jabs at Bimbo!' : 'WHAM. Old Snapper rams the pack.';
      if (pk.water > 0.3) this.say(heavy ? heavyLine : kind === 'thorn' ? 'Thorns! They snag the pack.' : kind === 'acorn' ? 'Bonk! An acorn hits the pack.' : side > 1 ? 'It leapt at Bimbo! Water everywhere.' : 'Splash! Rocco blocks most of it.');
    }
    if (from && pk.enabled) {                        // knocked back, away from the hit, but never off a dock into the water
      const [ux, uy] = dirTo(from, p), k = heavy ? 340 : 200, reach = k * 0.12;
      if (!this.room.inPit(p.x + ux * (reach + 10), p.y + uy * (reach + 10), 0)) { p.vx += ux * k; p.vy += uy * k; }
    }
    this.waterWarnings(before);
  }

  // ------------------------------------------------ step

  step(dt: number, input?: InputFrame): void {
    const p = this.player, g = this.goose, room = this.room, T = this.tuning;
    this.time += dt;
    if (this.won) return;
    if (p.dead) { p.dead -= dt; if (p.dead <= 0) this.restartRoom(); return; }

    if (input) {
      const aim = { x: input.aimX, y: input.aimY };
      this.aim = aim;
      if (input.fling) this.fling(aim);
      if (input.yank) this.yank();
      if (input.honk) this.honk(aim);
      if (input.letGo) this.letGo();
      if (input.feed) this.feedBread();
      if (input.cycle) this.cycleBread();
      if (input.patch) this.patchPack();
      if (input.roll) this.roll(input);
      const canGuard = this.kit.oar && !!input.guard && p.roll <= 0 && !p.air && !p.pull && !p.dead && !this.won;
      p.guard = canGuard ? p.guard + dt : 0;
    }

    // timers and buffs
    this.buff.noFury = Math.max(0, this.buff.noFury - dt);
    this.buff.bagel = Math.max(0, this.buff.bagel - dt);
    this.clapperCd = Math.max(0, this.clapperCd - dt);
    g.honkCd = Math.max(0, g.honkCd - dt);
    g.grabCd = Math.max(0, g.grabCd - dt);

    // fury
    if (g.furious > 0) {
      g.furious -= dt * (g.feral ? 0.5 : 1);
      if (g.furious <= 0) {
        g.furious = 0; g.fury = 35;
        if (g.feral) { g.feral = false; g.state = 'returning'; this.say('The goose has calmed down. For now.'); }
        else {
          this.drop('down', g.x, g.y);
          if (this.rng() < 0.35) { this.drop('egg', g.x, g.y); this.say('Fury survived. He molted… and laid a GOLDEN EGG?'); }
          else this.say('Fury survived. The goose molts.');
        }
      }
    } else g.fury = Math.max(0, g.fury - 4 * dt);

    // leash strain: only builds while the goose is furious and on the leash
    const onLeash = g.state === 'held' || g.state === 'latched' || g.state === 'flying';
    if (g.furious > 0 && onLeash) {
      g.strain += this.strainRate() * dt;
      if (g.strain >= 1) { g.strain = 0; this.fx('snap', (p.x + g.x) / 2, (p.y + g.y) / 2); this.goFeral('SNAP! The leash broke. Run.'); }
    } else g.strain = Math.max(0, g.strain - 0.25 * dt);

    // pickups
    room.def.breadSpots.forEach((b, i) => {
      if (!this.breadGot[i] && Math.hypot(b.x - p.x, b.y - p.y) < 24) { this.breadGot[i] = true; this.kit.bread.stale++; this.say('Stale Crust +1'); }
    });
    (room.def.kits ?? []).forEach((k, i) => {
      if (this.kitsGot[i] || Math.hypot(k.x - p.x, k.y - p.y) > 24) return;
      this.kitsGot[i] = true; this.pack.needles += C.kitNeedles;
      this.fx('pick', p.x, p.y - 40, { text: `+${C.kitNeedles} needle uses` });
      this.say(this.pack.holes ? `Sewing kit! ${this.pack.holes} tear${this.pack.holes > 1 ? 's' : ''} to patch: press P.` : 'Sewing kit! Needle and thread for three patches.');
    });
    (room.def.feathers ?? []).forEach((k, i) => {
      if (this.feathersGot[i] || Math.hypot(k.x - p.x, k.y - p.y) > 24) return;
      this.feathersGot[i] = true; this.kit.mats.feather++;
      this.fx('chest', k.x, k.y - 10);
      this.say(`✦ A Golden Feather! (${this.kit.mats.feather}) Spend it at Biscuit's shrine in Willowmere.`);
    });
    const fy = room.def.ferry;
    if (fy && Math.hypot(fy.x - p.x, fy.y - p.y) < 70 && !this.kit.ferries.has(room.def.id)) {
      this.kit.ferries.add(room.def.id);
      this.fx('ring', fy.x, fy.y - 30);
      this.say(this.ferryReady() ? `Ferry stop: ${fy.name}. Honk here to call the Ferryman.` : `A ferry stop: ${fy.name}. Nobody to row it... yet.`);
    }
    const sh = room.def.shrine;
    if (sh) {
      const near = Math.hypot(sh.x - p.x, sh.y - p.y) < 34;
      if (near && !this.atShrine) { this.events.push({ type: 'shrine' }); this.say("Biscuit's shrine. He looks at it. He looks at you. He wants feathers."); }
      this.atShrine = near;
    }
    (room.def.spools ?? []).forEach((k, i) => {
      if (this.spoolsGot[i] || Math.hypot(k.x - p.x, k.y - p.y) > 24) return;
      this.spoolsGot[i] = true; this.kit.mats.fluff += C.spoolTwine;
      this.fx('pick', p.x, p.y - 40, { text: `+${C.spoolTwine} Twine` });
    });
    for (const it of this.items) {
      it.t += dt;
      const [dx, dy, d] = dirTo(it, p);
      if (it.t > 0.4 && d < 80) { it.vx += dx * 900 * dt; it.vy += dy * 900 * dt; }
      it.x += it.vx * dt; it.y += it.vy * dt;
      const dec = Math.exp(-4 * dt); it.vx *= dec; it.vy *= dec;
      const o = { x: it.x, y: it.y, r: 6 }; room.collide(o); it.x = o.x; it.y = o.y;
      if (room.inPit(it.x, it.y, 0)) { const b = room.bankPoint(it.x, it.y, 10); it.x = b.x; it.y = b.y; it.vx *= -0.3; it.vy *= -0.3; }
      if (it.t > 0.4 && d < 20) {
        it.got = true; this.kit.mats[it.mat]++;
        if (isCatalyst(it.mat)) this.say(`✦ Catalyst: ${ITEMS[it.mat].name}!`);
        else this.fx('pick', p.x, p.y - 18, { text: `+1 ${ITEMS[it.mat].name}` });
      }
    }
    this.items = this.items.filter(i => !i.got);

    // mop bucket
    const bk = room.def.bucket;
    this.bucketCd = Math.max(0, this.bucketCd - dt);
    if (bk && this.bucketCd <= 0 && Math.hypot(bk.x - p.x, bk.y - p.y) < 34) {
      this.bucketCd = C.bucketCooldown; this.kit.mats.mop += 2; this.fx('pick', p.x, p.y - 18, { text: '+2 Fishing Line' });
    }

    // respawns so there is something to farm
    this.spawnT -= dt;
    const light = room.def.lightKind ?? 'bunny', heavy = room.def.heavyKind ?? 'knight';
    const bunnies = this.enemies.filter(e => this.active(e) && !e.heavy).length;
    if (this.spawnT <= 0) {
      this.spawnT = C.bunnySpawnEvery;
      const vents = room.def.vents;
      if (bunnies < C.maxBunnies && vents.length && room.def.ventSpawns !== false) {
        const v = vents[Math.floor(this.rng() * vents.length)]!;
        this.enemies.push(this.mkEnemy(light, v.x, v.y)); this.fx('ring', v.x, v.y);
      }
    }
    const ks = room.def.knightSpawn;
    if (ks && !this.enemies.some(e => this.active(e) && e.heavy)) {
      this.knightT += dt;
      if (this.knightT > C.knightRespawn) {
        this.knightT = 0; this.enemies.push(this.mkEnemy(heavy, ks.x, ks.y));
        this.say(heavy === 'snapper' ? 'Old Snapper hauls himself back out of the water.' : 'A new knight clanks in.');
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead || e.falling);
    p.inv = Math.max(0, p.inv - dt);

    // ---- player
    const calmTug = g.furious <= 0 && this.gap() > 0;
    if (p.pull) {
      const t = p.pull, [dx, dy, d] = dirTo(p, t);
      const ysp = T.yank * this.kit.stat('yank') * (this.kit.has('f3') ? 1.25 : 1);
      const tDead = !isPost(t) && (t.dead || t.woke > 0);
      if (d < t.r + p.r + 4 || tDead) {
        p.pull = null; p.air = false; p.vx *= 0.2; p.vy *= 0.2; g.state = 'held';
        if (!isPost(t) && t.heavy && !t.dead) {
          const buddy = this.kit.has('b3');
          this.damage(t, buddy ? 4 : 2); t.stun = buddy ? 2.4 : 1.6; t.vx += dx * 380; t.vy += dy * 380; this.say(buddy ? 'DOUBLE HEADBUTT!' : 'HEADBUTT!');
        }
      } else { p.vx = dx * ysp; p.vy = dy * ysp; }
    } else {
      let mx = input?.moveX ?? 0, my = input?.moveY ?? 0;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      if (ml > 0.01) { const l = Math.hypot(mx, my); p.fx = mx / l; p.fy = my / l; }
      // In world rooms Rocco faces where you aim, so you can turn to keep Bimbo (on his back) away from a critter.
      if (this.pack.enabled && input) {
        const ax2 = input.aimX - p.x, ay2 = input.aimY - p.y, al = Math.hypot(ax2, ay2);
        if (al > 24) { p.fx = ax2 / al; p.fy = ay2 / al; }
      }
      const acc = 1 - Math.exp(-14 * dt);
      const wade = this.puddles.length && this.inPuddle(p.x, p.y) ? 0.5 : 1;   // wading through a puddle
      if (p.roll > 0) {
        // committed to the tumble: fast, easing out, steerable only a little
        if (ml > 0.2) {
          const t = Math.min(1, dt * 4), nx = p.rdx + (mx - p.rdx) * t, ny = p.rdy + (my - p.rdy) * t, nl = Math.hypot(nx, ny) || 1;
          p.rdx = nx / nl; p.rdy = ny / nl;
        }
        const u = 1 - p.roll / C.rollTime, sp = C.rollSpeed * (1 - 0.65 * u) * (wade < 1 ? 0.7 : 1);
        const k = 1 - Math.exp(-30 * dt);
        p.vx += (p.rdx * sp - p.vx) * k; p.vy += (p.rdy * sp - p.vy) * k;
        p.fx = p.rdx; p.fy = p.rdy;
      } else {
        const sp = C.playerSpeed * wade * (p.guard > 0 ? C.guardSpeed : 1);
        p.vx += (mx * sp - p.vx) * acc; p.vy += (my * sp - p.vy) * acc;
      }
      // a goose stronger than his leash tugs you around
      if ((g.furious > 0 || calmTug) && g.state === 'held') {
        g.tug -= dt;
        if (g.tug <= 0) {
          g.tug = calmTug ? 1.6 - 0.25 * this.gap() + this.rng() * 0.5 : 0.55 + this.rng() * 0.4;
          const e = this.nearestEnemy(p.x, p.y);
          let a = e ? Math.atan2(e.y - p.y, e.x - p.x) : this.rng() * Math.PI * 2;
          a += (this.rng() - 0.5) * 1.2;
          const tug = (calmTug ? 110 * this.gap() : 300 * Math.max(0.35, 1 + 0.5 * this.gap())) * this.kit.stat('tug') * (p.roll > 0 ? 0.5 : 1) * (p.guard > 0 ? C.guardBrace : 1);
          p.vx += Math.cos(a) * tug; p.vy += Math.sin(a) * tug;
        }
      }
    }
    {
      // Yank pulls can exceed 1,500 units/s, so the janitor sub-steps too.
      const sub = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / (p.r * 0.8)));
      for (let i = 0; i < sub; i++) { p.x += (p.vx * dt) / sub; p.y += (p.vy * dt) / sub; room.collide(p); }
      this.keepInside(p);
    }
    if (p.roll > 0) { p.roll = Math.max(0, p.roll - dt); if (p.roll === 0) { p.vx *= 0.45; p.vy *= 0.45; } }
    p.rollCd = Math.max(0, p.rollCd - dt);
    if (!p.air && room.inPit(p.x, p.y, 6)) {
      p.roll = 0;
      const pond = this.pack.enabled;
      if (!pond) this.hurtPlayer();
      const sp = room.def.respawns ? room.def.respawns[room.pitSide(p.x)] : this.lastSafe;
      p.x = sp.x; p.y = sp.y; p.vx = p.vy = 0;
      g.state = 'held'; g.x = p.x - 30; g.y = p.y;
      if (pond) this.fx('splash', p.x, p.y - 20);
      this.say(this.pick(pond ? 'swim' : 'fall'));
    }
    if (!p.air && !p.pull && !room.inPit(p.x, p.y, -22)) this.lastSafe = { x: p.x, y: p.y };
    this.stepPack(dt);
    this.stepWoods(dt);
    const chest = room.def.chest;
    if (chest && !this.world[room.def.id]?.chest && Math.hypot(chest.x - p.x, chest.y - p.y) < 30) this.openChest();
    if (room.def.doors) {
      for (const d of room.def.doors) {
        if (p.air || p.dead || !inRect(p.x, p.y, d) || (d.gated && room.gateClosed)) continue;
        this.useDoor(d);
        return;
      }
    } else {
      const exit = room.def.exit;
      if (exit && !room.gateClosed && inRect(p.x, p.y, exit)) { this.won = true; this.clearT = this.time; this.events.push({ type: 'won' }); }
    }

    // ---- enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.falling) { e.falling += dt; if (e.falling > 0.6) { e.falling = 0; e.dead = true; } continue; }
      e.stun = Math.max(0, e.stun - dt); e.hitT = Math.max(0, e.hitT - dt);
      const [dx, dy, d] = dirTo(e, p);
      if (e.woke && BOSS.has(e.kind)) { e.woke += dt; continue; }   // the Ferryman stays, friendly
      if (e.woke) {
        // awake and grateful: hop away from Rocco (frogs are happy to swim), then gone
        e.woke += dt;
        e.x -= dx * e.spd * 1.2 * dt; e.y -= dy * e.spd * 1.2 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt; const dk = Math.exp(-5 * dt); e.vx *= dk; e.vy *= dk;
        room.collide(e); this.keepInside(e);
        if (e.woke > WAKE_TIME) e.dead = true;
        continue;
      }
      let ax = 0, ay = 0;
      const slow = g.state === 'latched' && g.target === e ? 0.35 : 1;
      const critter = ENTRANCED.has(e.kind);
      if (critter && !BOSS.has(e.kind) && e.mode !== 'tunnel' && room.inPit(e.x, e.y, 2)) {
        // Frogs and turtles swim. In the water a critter is harmless: it paddles back to the nearest bank.
        if (e.mode !== 'swim') {
          e.mode = 'swim'; e.modeT = 0;
          const land = this.nearestLand(e.x, e.y, e.r); e.tx = land.x; e.ty = land.y;
          this.fx('splash', e.x, e.y - 6);
          if (!e.wet) { e.wet = true; this.drop('goo', room.bankPoint(e.x, e.y, 14).x, room.bankPoint(e.x, e.y, 14).y); }
          this.say(this.pick('swimback'));
        }
        e.modeT += dt;
        if (e.modeT > 4) { const land = this.nearestLand(e.x, e.y, e.r); e.tx = land.x; e.ty = land.y; e.modeT = 0; }   // re-plan if stuck
        const [bx, by] = dirTo(e, { x: e.tx, y: e.ty }), sp = e.heavy ? 40 : 62;
        e.x += (bx * sp + e.vx) * dt; e.y += (by * sp + e.vy) * dt;
        const dk = Math.exp(-4 * dt); e.vx *= dk; e.vy *= dk;
        room.collide(e); this.keepInside(e);
        continue;
      }
      if (e.mode === 'swim') { e.mode = 'recover'; e.modeT = 0; e.cd = 1.2; }   // climbed out, shaking off
      if (e.kind === 'heron') [ax, ay] = this.heronAI(e, dt, d);
      else if (e.kind === 'king') [ax, ay] = this.kingAI(e, dt);
      else if (e.kind === 'elder') [ax, ay] = this.elderAI(e, dt, d);
      else if (e.kind === 'squirrel') [ax, ay] = this.squirrelAI(e, dt, d, slow);
      else if (e.kind === 'badger') [ax, ay] = this.badgerAI(e, dt, slow);
      else if (critter) [ax, ay] = this.critterAI(e, dt, d, slow);
      else if (!e.stun && d < (AGGRO[e.kind] ?? 300)) { ax = dx * e.spd * slow; ay = dy * e.spd * slow; }
      // AI won't walk into the pit; knockback can push them in
      let nx = e.x + ax * dt, ny = e.y + ay * dt;
      if (room.inPit(nx, e.y, -e.r)) nx = e.x;
      if (room.inPit(e.x, ny, -e.r)) ny = e.y;
      e.x = nx; e.y = ny;
      if (BOSS.has(e.kind)) { e.vx = e.vy = 0; continue; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      const dec = Math.exp(-5 * dt); e.vx *= dec; e.vy *= dec;
      room.collide(e);
      if (!critter && room.inPit(e.x, e.y, 2) && Math.hypot(e.vx, e.vy) > 0) {   // Room 01 pests fall; critters swim (above)
        e.falling = 0.001; this.handled++;
        const bank = room.bankPoint(e.x, e.y, 14);
        this.drop('goo', bank.x, bank.y);
        this.say(this.pick(this.pack.enabled ? 'splash' : 'pit'));
        if (g.target === e) g.state = 'held';
        continue;
      }
      if (!critter && !e.stun && d < e.r + p.r) this.hurtPlayer(1, e.heavy);
    }
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i]!, b = this.enemies[j]!;
      if (!this.active(a) || !this.active(b)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0) { const q = (m - d) / 2; a.x -= (dx / d) * q; a.y -= (dy / d) * q; b.x += (dx / d) * q; b.y += (dy / d) * q; }
    }

    this.stepDarts(dt);
    this.stepStorm(dt);
    this.stepGoose(dt);
  }

  private stepDarts(dt: number): void {
    const p = this.player;
    for (const d of [...this.darts]) {   // a copy: parries add darts while we go
      d.t += dt;
      if (d.back && d.at !== undefined) { const e = this.enemies.find(o => o.id === d.at && this.active(o)); if (e) { d.tx = e.x; d.ty = e.y; } }
      if (d.t >= d.T) {
        const kind = d.kind ?? 'feather', b = this.packPoint(10);
        this.fx(kind === 'feather' ? 'splash' : 'thud', d.tx, d.ty - 6);
        if (kind === 'feather') this.addPuddle(d.tx, d.ty, 20);
        const radius = kind === 'acorn' ? 18 : kind === 'rock' ? 26 : 28;
        if (d.back) { this.batted(d); continue; }
        if (Math.hypot(b.x - d.tx, b.y - d.ty) < radius + (p.guard > 0 ? 10 : 0) && !p.air) {
          const src = { x: d.x0, y: d.y0 };
          if (kind !== 'feather' && this.parrying() && this.blocks(src) && !this.rollSafe()) { this.parryDart(d); continue; }
          this.hurtPlayer(1, kind !== 'acorn', src, kind === 'feather' ? 'dart' : kind);
        }
      }
    }
    this.darts = this.darts.filter(d => d.t < d.T);
  }

  // ------------------------------------------------ the Ferryman's Oar

  /** Is the oar up and facing where this blow comes from? */
  blocks(from: Vec): boolean {
    const p = this.player;
    if (p.guard <= 0) return false;
    const ox = from.x - p.x, oy = from.y - p.y, l = Math.hypot(ox, oy);
    if (l < 1) return true;
    const fl = Math.hypot(p.fx, p.fy) || 1;
    return (ox * p.fx + oy * p.fy) / (l * fl) > Math.cos(C.guardArc);
  }

  /** Raised just now: a blow landing in this window is parried. */
  parrying(): boolean { const g = this.player.guard; return g > 0 && g <= C.parryWindow; }

  /** The oar takes a blow. Critters that hit it bounce off; a parried charge staggers the Burrow King. */
  private blocked(from: Vec, heavy: boolean, kind?: AttackKind): void {
    const p = this.player, parry = this.parrying();
    p.inv = 0.25;
    const [ux, uy] = dirTo(from, p), shove = heavy ? (parry ? 90 : 260) : 60;
    if (!this.room.inPit(p.x + ux * 30, p.y + uy * 30, 0)) { p.vx += ux * shove; p.vy += uy * shove; }
    const ox = p.x + p.fx * 18, oy = p.y - 18 + p.fy * 10;
    this.fx(parry ? 'parry' : 'block', ox, oy);
    if ('kind' in from) {
      const e = from as Enemy;
      if (e.kind === 'king' && kind === 'charge' && parry) {
        e.mode = 'dazed'; e.modeT = 0; this.damage(e, 2);
        this.say('PARRY! The oar stops the Burrow King dead. He sees stars. Bite him now!');
        return;
      }
      if (!BOSS.has(e.kind)) { e.vx -= ux * (parry ? 420 : 240); e.vy -= uy * (parry ? 420 : 240); e.stun = Math.max(e.stun, parry ? 1.6 : 0.7); if (parry) this.damage(e, 1); }
      else e.stun = Math.max(e.stun, parry ? 0.8 : 0.2);
    }
    if (parry) this.say(this.pick('parry'));
    else if (this.rng() < 0.4) this.say(heavy ? 'CLONK. The oar holds, but it shoves you back.' : 'Clack! The oar takes it.');
  }

  /** Bat an acorn or rock back: it flies toward the aim (snapping to a critter or bell near it). */
  private parryDart(d: Dart): void {
    const p = this.player, aim = this.aim;
    const dx = aim.x - p.x, dy = aim.y - p.y, l = Math.hypot(dx, dy) || 1;
    const reach = Math.min(C.parryRange, Math.max(80, l));
    let tx = p.x + (dx / l) * reach, ty = p.y + (dy / l) * reach;
    // help the aim a little: the nearest thing worth hitting close to where you pointed
    const cands: (Vec & { id?: number })[] = this.enemies.filter(e => this.active(e) && !e.woke).map(e => ({ x: e.x, y: e.y, id: e.id }));
    const bell = this.room.def.bell; if (bell && this.room.gateClosed) cands.push(bell);
    (this.room.def.nests ?? []).forEach((n, i) => { if (!this.nestsDown[i]) cands.push(n); });
    let best: (Vec & { id?: number }) | null = null, bd = 90;
    for (const c of cands) {
      const k = Math.hypot(c.x - tx, c.y - ty), r = Math.hypot(c.x - p.x, c.y - p.y);
      if (k < bd && r < C.parryRange + 40) { bd = k; best = c; }
    }
    if (best) { tx = best.x; ty = best.y; }
    this.darts.push({ x0: p.x + p.fx * 16, y0: p.y - 26, tx, ty, t: 0, T: 0.32, kind: d.kind, back: true, at: best?.id });
    this.fx('parry', p.x + p.fx * 18, p.y - 22);
    this.say(this.pick('parry'));
  }

  /** A batted-back acorn or rock lands: it bonks a critter, staggers the Burrow King, or rings a bell. */
  private batted(d: Dart): void {
    const rock = d.kind === 'rock';
    this.fx('thud', d.tx, d.ty - 6);
    const nests = this.room.def.nests ?? [];
    for (let i = 0; i < nests.length; i++) {
      const n = nests[i]!;
      if (this.nestsDown[i] || Math.hypot(n.x - d.tx, n.y - d.ty) > 30) continue;
      this.nestsDown[i] = true;
      this.fx('poof', n.x, n.y); this.fx('chest', n.x, n.y + 30);
      const k = this.kit.mats, pk = this.pack;
      if (n.drop === 'feather') { k.feather++; this.say(`The nest tumbles down. ✦ A Golden Feather inside! (${k.feather})`); }
      else if (n.drop === 'kit') { pk.needles += C.kitNeedles; this.say('The nest tumbles down. Someone hoarded a sewing kit in it!'); }
      else if (n.drop === 'spool') { k.fluff += 3; this.say('The nest tumbles down: it was woven from twine. +3 Twine.'); }
      else { k.egg++; this.say('The nest tumbles down. A Golden Egg rolls out!'); }
      return;
    }
    const bell = this.room.def.bell;
    if (bell && Math.hypot(bell.x - d.tx, bell.y - d.ty) < bell.r + 26) {
      this.fx('ring', bell.x, bell.y);
      if (this.room.gateClosed) { this.room.gateClosed = false; this.say(bell.parryOnly ? 'TOCK! The acorn smacks the chime. The way opens.' : 'DING! The cage is open.'); }
      else this.say('DING!');
      this.rang = true;
      return;
    }
    for (const e of this.enemies) {
      if (!this.active(e) || e.woke) continue;
      if (Math.hypot(e.x - d.tx, e.y - d.ty) > e.r + (rock ? 30 : 22)) continue;
      if (e.kind === 'king') {
        if (rock) { e.mode = 'dazed'; e.modeT = 0; this.damage(e, 3); this.say('Your own rock, Your Majesty. He sees stars!'); }
        else this.damage(e, 1);
      } else { e.stun = Math.max(e.stun, rock ? 2 : 1.4); this.damage(e, rock ? 2 : 1); }
      this.fx('chomp', e.x, e.y - 10);
      return;
    }
  }

  // ------------------------------------------------ storm (rooms with weather: 'rain')

  /** Rain puddles: Rocco wades through them at half speed. They grow in, linger, and dry up. */
  puddles: { x: number; y: number; r: number; life: number; max: number }[] = [];
  private puddleT = 0;

  addPuddle(x: number, y: number, r: number): void {
    if (this.room.inPit(x, y, -r * 0.5) || this.puddles.length > 22) return;
    this.puddles.push({ x, y, r: 4, life: 10 + this.rng() * 6, max: r });
  }

  inPuddle(x: number, y: number): boolean { return this.puddles.some(q => Math.hypot(q.x - x, (q.y - y) * 1.6) < q.r); }

  /** While the boss is up in a storm room: the rain keeps pooling around Rocco. */
  get storming(): boolean { return this.room.def.weather === 'rain' && !this.enemies.some(e => BOSS.has(e.kind) && e.woke > 0); }

  private stepStorm(dt: number): void {
    for (const q of this.puddles) { q.life -= dt; q.r = q.life < 2 ? q.max * Math.max(0, q.life / 2) : Math.min(q.max, q.r + dt * 20); }
    this.puddles = this.puddles.filter(q => q.life > 0);
    if (!this.storming) return;
    this.puddleT -= dt;
    if (this.puddleT <= 0) {
      this.puddleT = 1.1 + this.rng() * 0.9;
      const p = this.player, a = this.rng() * Math.PI * 2, d = 40 + this.rng() * 220;
      this.addPuddle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 22 + this.rng() * 22);
    }
  }

  // ------------------------------------------------ the Heron Ferryman

  /**
   * The Heron Ferryman, entranced. From his rock in deep water he stabs (spear), lobs feather darts onto
   * marked spots, blasts a wing gust and calls frogs. Then he takes to the air: a landing mark hunts Bimbo,
   * he dives onto it (slam), and fights on the bank for a few seconds, pecking at the pack, before flying home.
   * Grounded is when he is easiest to bite. Below half health everything comes faster and harder.
   */
  private heronAI(e: Enemy, dt: number, d: number): [number, number] {
    const p = this.player, g = this.goose, angry = e.hp < e.max / 2;
    e.modeT += dt; e.cd -= dt;
    const latched = g.state === 'latched' && g.target === e;
    if (latched) {
      e.grip += dt;
      if (e.grip > (angry ? 1.4 : 2.0)) {
        e.grip = 0; g.state = 'held'; const [ux, uy] = dirTo(e, g); g.vx = ux * 500; g.vy = uy * 500;
        this.say('The Heron flicks Biscuit off with one wing.');
        if (e.mode !== 'grounded') { e.mode = 'gust'; e.modeT = 0; e.hit = false; }
      }
    } else e.grip = 0;
    if (e.stun > 0 && e.air <= 0) { if (e.mode !== 'stalk' && e.mode !== 'grounded') { e.mode = 'recover'; e.modeT = 0; } return [0, 0]; }
    if (p.dead) return [0, 0];
    const bimbo = this.packPoint(10);
    const db = Math.hypot(bimbo.x - e.x, bimbo.y - e.y);
    const home = { x: e.hx, y: e.hy }, onRock = Math.hypot(e.x - home.x, e.y - home.y) < 4;
    const takeOff = (next: CritterMode) => { e.mode = next; e.modeT = 0; e.hit = false; if (latched) { g.state = 'held'; } };
    switch (e.mode) {
      case 'stalk': case 'recover': {
        if (e.mode === 'recover' && e.modeT < (angry ? 0.4 : 0.7)) return [0, 0];
        if (e.cd > 0) return [0, 0];
        e.modeT = 0; e.hit = false;
        const frogs = this.enemies.filter(o => o.kind === 'frog' && this.active(o)).length;
        const roll = this.rng();
        if (db < 150) { e.mode = 'wind'; e.attack = 'spear'; e.tx = bimbo.x; e.ty = bimbo.y; }
        else if (roll < (angry ? 0.45 : 0.38)) { takeOff('takeoff'); this.say(angry ? 'The Heron rises, furious!' : 'The Heron takes to the air. It wants Bimbo!'); }
        else if (frogs < (angry ? 3 : 2) && this.room.def.vents.length && roll < 0.52) e.mode = 'call';
        else if (roll < 0.62 && db < 320) { e.mode = 'wind'; e.attack = 'gust'; }
        else { e.mode = 'wind'; e.attack = 'dart'; }
        return [0, 0];
      }
      case 'takeoff': {
        e.air = Math.min(120, e.air + dt * 240);
        if (e.air >= 120) { e.mode = 'fly'; e.modeT = 0; }
        return [0, 0];
      }
      case 'fly': {
        // the landing mark hunts Bimbo; the Heron glides above it. Then it commits and dives.
        const hunt = angry ? 0.95 : 1.3;
        if (e.modeT < hunt * 0.75) {
          const spot = this.room.inPit(bimbo.x, bimbo.y, -24) ? this.nearestLand(bimbo.x, bimbo.y, 24) : bimbo;
          const k = 1 - Math.exp(-dt * 5); e.tx += (spot.x - e.tx) * k; e.ty += (spot.y - e.ty) * k;
        }
        const k2 = 1 - Math.exp(-dt * 4); e.x += (e.tx - e.x) * k2; e.y += (e.ty - e.y) * k2;
        if (e.modeT > hunt) { e.mode = 'slam'; e.modeT = 0; e.hit = false; }
        return [0, 0];
      }
      case 'slam': {
        e.air = Math.max(0, e.air - dt * 600); e.x = e.tx; e.y = e.ty;
        if (e.air <= 0 && !e.hit) {
          e.hit = true;
          this.fx('slam', e.x, e.y);
          for (let i = 0; i < 3; i++) this.addPuddle(e.x + (this.rng() - 0.5) * 80, e.y + (this.rng() - 0.5) * 50, 24);
          const bb = this.packPoint(10);
          if (Math.hypot(bb.x - e.x, bb.y - e.y) < 50) this.hurtPlayer(1, true, e, 'slam');
          else if (Math.hypot(p.x - e.x, p.y - e.y) < 90) { const [ux, uy] = dirTo(e, p); p.vx += ux * 260; p.vy += uy * 260; }
          e.mode = 'grounded'; e.modeT = 0; e.cd = 0.5;
          this.say('THOOM. The Heron lands on the bank. Bite him now!');
        }
        return [0, 0];
      }
      case 'grounded': {
        // on the bank: pecks at the pack, then flies home
        const stay = angry ? 2.6 : 3.4;
        if (e.stun > 0) return [0, 0];
        if (e.modeT > stay) { takeOff('return'); return [0, 0]; }
        if (e.cd <= 0 && !e.hit && db < 110) { e.hit = true; e.attack = 'peck'; e.tx = bimbo.x; e.ty = bimbo.y; e.grip2 = 0; }
        if (e.hit && e.attack === 'peck') {
          e.grip2 += dt;
          if (e.grip2 < 0.35) { e.tx = bimbo.x; e.ty = bimbo.y; }       // aiming (telegraphed)
          else if (e.grip2 >= 0.42) {
            const [ux, uy] = dirTo(e, { x: e.tx, y: e.ty });
            const bx = bimbo.x - e.x, by = bimbo.y - e.y, along = bx * ux + by * uy, off = Math.abs(bx * uy - by * ux);
            if (along > 0 && along < 100 && off < 18) this.hurtPlayer(1, true, e, 'spear');
            e.hit = false; e.attack = 'leap'; e.cd = angry ? 0.5 : 0.8;
          }
        } else if (db > 60) {                        // stalks after Bimbo on foot, slowly, avoiding the water
          const [ux, uy] = dirTo(e, bimbo), nx = e.x + ux * 55 * dt, ny = e.y + uy * 55 * dt;
          if (!this.room.inPit(nx, ny, -e.r)) { e.x = nx; e.y = ny; }
        }
        return [0, 0];
      }
      case 'return': {
        e.air = Math.min(120, e.air + dt * 260);
        const k = 1 - Math.exp(-dt * 5); e.x += (home.x - e.x) * k; e.y += (home.y - e.y) * k;
        if (Math.hypot(home.x - e.x, home.y - e.y) < 6 && e.air >= 100) { e.x = home.x; e.y = home.y; e.mode = 'perch'; e.modeT = 0; }
        return [0, 0];
      }
      case 'perch': {
        e.air = Math.max(0, e.air - dt * 300);
        if (e.air <= 0) { e.mode = 'recover'; e.modeT = 0; e.cd = (angry ? 0.5 : 0.9) + this.rng() * 0.5; }
        return [0, 0];
      }
      case 'wind': {
        if (!onRock && e.attack !== 'spear') { e.mode = 'recover'; return [0, 0]; }
        const wind = e.attack === 'spear' ? (angry ? 0.45 : 0.6) : e.attack === 'gust' ? 0.8 : (angry ? 0.5 : 0.7);
        if (e.attack === 'spear' && e.modeT < wind * 0.6) { e.tx = bimbo.x; e.ty = bimbo.y; }   // tracks, then commits
        if (e.modeT < wind) return [0, 0];
        e.modeT = 0;
        if (e.attack === 'spear') e.mode = 'spear';
        else if (e.attack === 'gust') e.mode = 'gust';
        else {
          e.mode = 'darts';
          const n = angry ? 8 : 5;
          for (let i = 0; i < n; i++) {
            // the first lands on Bimbo, the next where he is headed, the rest bracket him
            const lead = i === 0 ? 0 : 0.6, spread = i < 2 ? 0 : 1;
            const sx = (this.rng() - 0.5) * 140 * spread, sy = (this.rng() - 0.5) * 100 * spread;
            this.darts.push({ x0: e.x, y0: e.y - 40, tx: bimbo.x + p.vx * lead + sx, ty: bimbo.y + p.vy * lead + sy, t: 0, T: 0.8 + i * 0.1 });
          }
          this.say(angry ? 'A storm of feathers!' : 'Feather darts! Watch the marks.');
        }
        return [0, 0];
      }
      case 'spear': {
        const [ux, uy] = dirTo(e, { x: e.tx, y: e.ty });
        const bx = bimbo.x - e.x, by = bimbo.y - e.y, along = bx * ux + by * uy, off = Math.abs(bx * uy - by * ux);
        if (!e.hit && e.modeT > 0.08) { e.hit = true; if (along > 0 && along < 150 && off < 18) this.hurtPlayer(1, true, e, 'spear'); }
        if (e.modeT > 0.3) { e.mode = 'recover'; e.modeT = 0; e.cd = (angry ? 0.5 : 0.9) + this.rng() * 0.5; }
        return [0, 0];
      }
      case 'gust': {
        if (!e.hit) {
          e.hit = true;
          const [ux, uy, l] = dirTo(e, p);
          if (l < 360) {
            const push = 640 * (1 - l / 440);
            p.vx += ux * push; p.vy += uy * push;
            if (g.state !== 'latched') { g.vx += ux * push; g.vy += uy * push; }
            if (this.pack.enabled) { this.pack.water = Math.max(0, this.pack.water - 0.05); this.fx('splash', p.x, p.y - 30); }
          }
          this.fx('gust', e.x, e.y, { a: Math.atan2(p.y - e.y, p.x - e.x) });
          this.say('WHOOSH. A wing gust sprays the pack.');
        }
        if (e.modeT > 0.4) { e.mode = 'recover'; e.modeT = 0; e.cd = 0.6 + this.rng() * 0.6; }
        return [0, 0];
      }
      case 'darts': {
        if (e.modeT > 0.4) { e.mode = 'recover'; e.modeT = 0; e.cd = (angry ? 0.7 : 1.1) + this.rng() * 0.6; }
        return [0, 0];
      }
      case 'call': {
        if (!e.hit) {
          e.hit = true;
          const vents = this.room.def.vents;
          for (let i = 0; i < (angry ? 2 : 1); i++) {
            const v = vents[Math.floor(this.rng() * vents.length)]!;
            const f = this.mkEnemy('frog', v.x, v.y); f.cd = 1.2; this.enemies.push(f); this.fx('ring', v.x, v.y);
          }
          this.say('KRAAAK! The Heron calls up frogs from the burrows.');
        }
        if (e.modeT > 0.6) { e.mode = 'recover'; e.modeT = 0; e.cd = 0.8 + this.rng() * 0.8; }
        return [0, 0];
      }
      default: e.mode = 'recover'; e.modeT = 0; return [0, 0];
    }
  }

  // ------------------------------------------------ Hollowbark Woods critters

  /** Squirrels keep their distance, lob acorns at Bimbo, and bolt when Rocco or Biscuit gets close. */
  private squirrelAI(e: Enemy, dt: number, d: number, slow: number): [number, number] {
    const p = this.player, g = this.goose;
    e.modeT += dt; e.cd -= dt;
    if (e.stun > 0) { e.mode = 'stalk'; return [0, 0]; }
    if (p.dead || d > (AGGRO.squirrel ?? 260) && e.mode === 'stalk') return [0, 0];
    const bimbo = this.packPoint(10);
    const away = (x: number, y: number, sp: number): [number, number] => { const [ux, uy] = dirTo({ x, y }, e); return [ux * sp, uy * sp]; };
    switch (e.mode) {
      case 'wind':
        if (e.modeT < 0.45) return [0, 0];
        this.darts.push({ x0: e.x, y0: e.y - 14, tx: e.tx, ty: e.ty, t: 0, T: 0.55, kind: 'acorn' });
        e.mode = 'recover'; e.modeT = 0;
        return [0, 0];
      case 'recover':
        if (e.modeT > 0.4) { e.mode = 'stalk'; e.modeT = 0; e.cd = 1.4 + this.rng() * 1.2; }
        return [0, 0];
      default: {
        if (d < 80 || Math.hypot(g.x - e.x, g.y - e.y) < 60) return away(p.x, p.y, e.spd * 1.3);   // skittish
        if (e.cd <= 0 && d < 250) {
          e.mode = 'wind'; e.modeT = 0; e.attack = 'acorn';
          e.tx = bimbo.x + p.vx * 0.45; e.ty = bimbo.y + p.vy * 0.45;
          return [0, 0];
        }
        // hold a ring 140-200 out, circling
        const [ux, uy] = dirTo(e, p), perp = Math.sin(this.time * 1.3 + e.id) > 0 ? 1 : -1;
        const radial = d > 200 ? 1 : d < 140 ? -1 : 0;
        return [(ux * radial - uy * perp * 0.8) * e.spd * slow, (uy * radial + ux * perp * 0.8) * e.spd * slow];
      }
    }
  }

  /**
   * Badgers dig in, tunnel under the ground toward Bimbo (a dust trail shows where), surface under him
   * with a telegraph, and erupt. Afterwards they are dazed for a moment: the time to bite.
   */
  private badgerAI(e: Enemy, dt: number, slow: number): [number, number] {
    const p = this.player;
    e.modeT += dt; e.cd -= dt;
    if (e.stun > 0 && e.mode !== 'tunnel') { if (e.mode !== 'stalk') { e.mode = 'recover'; e.modeT = 0; } return [0, 0]; }
    if (p.dead) return [0, 0];
    const bimbo = this.packPoint(10), db = Math.hypot(bimbo.x - e.x, bimbo.y - e.y);
    switch (e.mode) {
      case 'stalk': {
        if (db > (AGGRO.badger ?? 230)) return [0, 0];
        if (e.cd <= 0) {
          e.mode = 'wind'; e.modeT = 0; e.hit = false;
          e.attack = db < 60 ? 'bite' : 'dig';
          e.tx = bimbo.x; e.ty = bimbo.y;
          return [0, 0];
        }
        const [ux, uy] = dirTo(e, bimbo); return [ux * e.spd * slow, uy * e.spd * slow];
      }
      case 'wind': {
        if (e.modeT < (e.attack === 'bite' ? 0.3 : 0.5)) return [0, 0];
        e.modeT = 0;
        if (e.attack === 'bite') { const [ux, uy] = dirTo(e, bimbo); e.vx = ux * 270; e.vy = uy * 270; e.mode = 'charge'; }
        else { e.mode = 'tunnel'; this.fx('dust', e.x, e.y); }
        return [0, 0];
      }
      case 'charge': {   // the short lunging bite
        if (!e.hit && Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < e.r + p.r + 2) { e.hit = true; this.hurtPlayer(1, true, e, 'bite'); e.vx *= -0.3; e.vy *= -0.3; }
        if (e.modeT > 0.24) { e.mode = 'recover'; e.modeT = 0; }
        return [0, 0];
      }
      case 'tunnel': {
        // under the ground: walls and water don't stop him; heads for where Bimbo is
        const [ux, uy, l] = dirTo(e, bimbo);
        const sp = 135 * dt;
        if (l > 14) { e.x += ux * Math.min(sp, l); e.y += uy * Math.min(sp, l); }
        if (l < 16 || e.modeT > 1.8) {
          const spot = this.room.inPit(e.x, e.y, -e.r) || this.room.collide({ x: e.x, y: e.y, r: e.r }) ? this.nearestLand(e.x, e.y, e.r) : { x: e.x, y: e.y };
          e.x = spot.x; e.y = spot.y; e.tx = spot.x; e.ty = spot.y;
          e.mode = 'surface'; e.modeT = 0;
        }
        return [0, 0];
      }
      case 'surface': {
        if (e.modeT < 0.45) return [0, 0];
        this.fx('dust', e.x, e.y);
        if (Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < 46) this.hurtPlayer(1, true, e, 'erupt');
        e.mode = 'dazed'; e.modeT = 0;
        return [0, 0];
      }
      case 'dazed': case 'recover': {
        if (e.modeT > (e.mode === 'dazed' ? 1.4 : 0.6)) { e.mode = 'stalk'; e.modeT = 0; e.cd = 1.2 + this.rng() * 1.2; }
        return [0, 0];
      }
      default: e.mode = 'stalk'; return [0, 0];
    }
  }

  /**
   * The Burrow King, Hollowbark's boss: a giant entranced badger. He charges (bait him into a tree and he
   * is dazed: bite him then), tunnels and erupts under Bimbo with a spray of rocks, lobs rocks, and calls
   * squirrels. Below half health he charges faster and erupts twice in a row.
   */
  /** Tutorial prompts, each shown once per playthrough of a fight. */
  private hintsShown = new Set<string>();
  private elderClonkT = 0;
  hint(id: string, text: string): void {
    if (this.hintsShown.has(id)) return;
    this.hintsShown.add(id);
    this.events.push({ type: 'hint', text });
  }

  /**
   * Old Snapper, the tutorial boss. He stalks, winds up and charges (roll aside), and is winded
   * afterwards (bite: double damage). A honk sends him into his shell, where bites only clonk; bite
   * and yank to flip him on his back for the big damage. Below half he charges twice, and snaps at
   * Bimbo when you're close. Armoured otherwise: bites do half.
   */
  private elderAI(e: Enemy, dt: number, d: number): [number, number] {
    const p = this.player, bimbo = this.packPoint(10), room = this.room, angry = e.hp < e.max / 2;
    this.elderClonkT = Math.max(0, this.elderClonkT - dt);
    e.modeT += dt; e.stun = 0;
    if (d < 520) this.hint('elder', 'OLD SNAPPER! Watch him: roll away from his charge, then bite him while he\'s winded.');
    switch (e.mode) {
      case 'stalk': {
        e.cd -= dt;
        if (e.cd <= 0 && d < 420) {
          const close = Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < 70;
          e.mode = 'wind'; e.modeT = 0; e.attack = close && angry ? 'bite' : 'charge';
          e.tx = bimbo.x; e.ty = bimbo.y; e.hit = false;
          if (e.attack === 'charge') this.hint('roll', 'He\'s winding up a charge! ROLL out of the way [Shift / B].');
          return [0, 0];
        }
        const [ux, uy] = dirTo(e, p);
        return [ux * e.spd, uy * e.spd];
      }
      case 'wind': {
        const T = e.attack === 'bite' ? 0.4 : e.grip2 > 0 ? 0.45 : 0.9;
        if (e.attack === 'charge') { e.tx = bimbo.x; e.ty = bimbo.y; }       // tracks you while rearing
        if (e.modeT >= T) {
          if (e.attack === 'bite') {
            if (Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < e.r + 30) this.hurtPlayer(1, true, e, 'bite');
            e.mode = 'stalk'; e.cd = 1.2; return [0, 0];
          }
          const [ux, uy] = dirTo(e, { x: e.tx, y: e.ty }); e.hx = ux; e.hy = uy;
          e.mode = 'charge'; e.modeT = 0;
        }
        return [0, 0];
      }
      case 'charge': {
        const sp = (angry ? 400 : 340) * dt, sub = 4;
        for (let i = 0; i < sub; i++) {
          const nx = e.x + (e.hx * sp) / sub, ny = e.y + (e.hy * sp) / sub;
          if (room.inPit(nx, ny, -e.r * 0.5) || e.modeT > 1.1) { this.elderTired(e, angry); return [0, 0]; }
          e.x = nx; e.y = ny;
          if (room.collide(e) || e.x < e.r + 22 || e.y < e.r + 22 || e.x > room.def.width - e.r - 22 || e.y > room.def.height - e.r - 22) {
            this.keepInside(e); this.fx('slam', e.x, e.y); this.elderTired(e, angry, true); return [0, 0];
          }
          if (!e.hit && Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < e.r + 14) { e.hit = true; this.hurtPlayer(1, true, e, 'charge'); }
        }
        return [0, 0];
      }
      case 'tired': {
        if (e.modeT > (angry ? 1.4 : 1.9)) {
          if (angry && e.grip2 <= 0) { e.grip2 = 1; e.mode = 'wind'; e.modeT = 0; e.attack = 'charge'; e.hit = false; return [0, 0]; }   // and again!
          e.grip2 = 0; e.mode = 'stalk'; e.cd = angry ? 1 : 1.6;
          if (this.hintsShown.has('tired') && !this.hintsShown.has('honk')) this.hint('honk', 'Another way in: HONK [Space] at him to scare him into his shell.');
        }
        return [0, 0];
      }
      case 'shell': {
        if (e.modeT > 2.8) { e.mode = 'stalk'; e.cd = 0.6; }
        return [0, 0];
      }
      case 'flipped': {
        if (e.modeT > 3.2) { e.mode = 'stalk'; e.cd = 1; this.say('Old Snapper rocks himself back onto his feet.'); }
        return [0, 0];
      }
      default: e.mode = 'stalk'; return [0, 0];
    }
  }

  private elderTired(e: Enemy, angry: boolean, crashed = false): void {
    e.mode = 'tired'; e.modeT = 0;
    if (crashed) this.say('THUD. He ploughs into it and stands there wheezing.');
    this.hint('tired', 'He\'s winded! Fling Biscuit at him [Click]: bites do double damage now.');
    void angry;
  }

  private kingAI(e: Enemy, dt: number): [number, number] {
    const p = this.player, g = this.goose, angry = e.hp < e.max / 2;
    e.modeT += dt; e.cd -= dt;
    if (g.state === 'latched' && g.target === e && e.mode !== 'dazed') {
      e.grip += dt;
      if (e.grip > 1.2) { e.grip = 0; g.state = 'held'; const [ux, uy] = dirTo(e, g); g.vx = ux * 520; g.vy = uy * 520; this.say('The Burrow King shrugs Biscuit off.'); }
    } else e.grip = 0;
    if (p.dead) return [0, 0];
    if (e.stun > 0 && (e.mode === 'stalk' || e.mode === 'recover')) return [0, 0];
    const bimbo = this.packPoint(10), db = Math.hypot(bimbo.x - e.x, bimbo.y - e.y);
    const room = this.room;
    switch (e.mode) {
      case 'stalk': case 'recover': {
        if (e.mode === 'recover' && e.modeT < (angry ? 0.4 : 0.7)) return [0, 0];
        if (e.cd > 0) {
          const [ux, uy] = dirTo(e, bimbo), nx = e.x + ux * e.spd * dt, ny = e.y + uy * e.spd * dt;
          if (!room.inPit(nx, ny, -e.r)) { e.x = nx; e.y = ny; room.collide(e); }
          return [0, 0];
        }
        e.mode = 'wind'; e.modeT = 0; e.hit = false; e.grip2 = 0;
        const roll = this.rng(), squirrels = this.enemies.filter(o => o.kind === 'squirrel' && this.active(o)).length;
        if (squirrels < 2 && room.def.vents.length && roll < 0.18) e.attack = 'call' as AttackKind;
        else if (roll < 0.55) e.attack = 'charge';
        else if (roll < 0.8) e.attack = 'dig';
        else e.attack = 'rocks';
        e.tx = bimbo.x; e.ty = bimbo.y;
        return [0, 0];
      }
      case 'wind': {
        const wind = e.attack === 'charge' ? (angry ? 0.55 : 0.75) : e.attack === 'dig' ? 0.5 : 0.6;
        if (e.attack === 'charge' && e.modeT < wind * 0.7) { e.tx = bimbo.x; e.ty = bimbo.y; }
        if (e.modeT < wind) return [0, 0];
        e.modeT = 0;
        if (e.attack === 'charge') {
          const [ux, uy] = dirTo(e, { x: e.tx, y: e.ty }); e.hx = ux; e.hy = uy; e.mode = 'charge';   // vx is zeroed for bosses
          this.say('The Burrow King charges!');
        } else if (e.attack === 'dig') { e.mode = 'tunnel'; this.fx('dust', e.x, e.y); }
        else if ((e.attack as string) === 'call') {
          for (let i = 0; i < 2; i++) {
            const v = room.def.vents[Math.floor(this.rng() * room.def.vents.length)]!;
            const sq = this.mkEnemy('squirrel', v.x, v.y); sq.cd = 1.5; this.enemies.push(sq); this.fx('ring', v.x, v.y);
          }
          this.say('The Burrow King thumps the ground. Squirrels pour out!');
          e.mode = 'recover'; e.cd = 0.8;
        } else {
          const n = angry ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const sx = i ? (this.rng() - 0.5) * 130 : 0, sy = i ? (this.rng() - 0.5) * 90 : 0;
            this.darts.push({ x0: e.x, y0: e.y - 30, tx: bimbo.x + p.vx * 0.5 + sx, ty: bimbo.y + p.vy * 0.5 + sy, t: 0, T: 0.75 + i * 0.1, kind: 'rock' });
          }
          this.say('He hurls clods of rock!');
          e.mode = 'recover'; e.cd = 0.9 + this.rng() * 0.6;
        }
        return [0, 0];
      }
      case 'charge': {
        const sp = (angry ? 440 : 380) * dt, sub = 4;
        for (let i = 0; i < sub; i++) {
          const nx = e.x + (e.hx * sp) / sub, ny = e.y + (e.hy * sp) / sub;
          if (room.inPit(nx, ny, -e.r * 0.5)) { e.mode = 'recover'; e.modeT = 0; e.cd = 0.8; return [0, 0]; }   // pulls up at the ravine edge
          e.x = nx; e.y = ny;
          if (room.collide(e) || e.x < e.r + 22 || e.y < e.r + 22 || e.x > room.def.width - e.r - 22 || e.y > room.def.height - e.r - 22) {
            this.keepInside(e);
            e.mode = 'dazed'; e.modeT = 0;
            this.fx('slam', e.x, e.y);
            this.say('CRUNCH! He rams the tree and sees stars. Bite him now!');
            return [0, 0];
          }
          if (!e.hit && Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < e.r + 12) { e.hit = true; this.hurtPlayer(1, true, e, 'charge'); }
        }
        if (e.modeT > 1.3) { e.mode = 'recover'; e.modeT = 0; e.cd = 0.6; }
        return [0, 0];
      }
      case 'dazed': {
        if (e.modeT > (angry ? 2.0 : 2.6)) { e.mode = 'recover'; e.modeT = 0; e.cd = 0.4; }
        return [0, 0];
      }
      case 'tunnel': {
        const [ux, uy, l] = dirTo(e, bimbo), sp = 175 * dt;
        if (l > 14) { e.x += ux * Math.min(sp, l); e.y += uy * Math.min(sp, l); }
        if (l < 16 || e.modeT > 1.6) {
          const spot = room.inPit(e.x, e.y, -e.r) || room.collide({ x: e.x, y: e.y, r: e.r }) ? this.nearestLand(e.x, e.y, e.r) : { x: e.x, y: e.y };
          e.x = spot.x; e.y = spot.y; e.tx = spot.x; e.ty = spot.y;
          e.mode = 'surface'; e.modeT = 0;
        }
        return [0, 0];
      }
      case 'surface': {
        if (e.modeT < 0.6) return [0, 0];
        this.fx('slam', e.x, e.y); this.fx('dust', e.x, e.y);
        if (Math.hypot(bimbo.x - e.x, bimbo.y - e.y) < 64) this.hurtPlayer(1, true, e, 'erupt');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.rng() * 0.5, r = 70 + this.rng() * 50;
          this.darts.push({ x0: e.x, y0: e.y - 20, tx: e.x + Math.cos(a) * r, ty: e.y + Math.sin(a) * r * 0.7, t: 0, T: 0.55 + this.rng() * 0.2, kind: 'rock' });
        }
        e.grip2++;
        if (angry && e.grip2 < 2) { e.mode = 'tunnel'; e.modeT = 0; }       // and again
        else { e.mode = 'recover'; e.modeT = 0; e.cd = 1.0; e.grip2 = 0; }
        return [0, 0];
      }
      default: e.mode = 'recover'; e.modeT = 0; return [0, 0];
    }
  }

  // ------------------------------------------------ woods features

  /** Barrel water left in this room (fractions of a pack). */
  barrelWater: number[] = [];
  shroomCd: number[] = [];

  private stepWoods(dt: number): void {
    const p = this.player, room = this.room, def = room.def;
    for (let i = 0; i < this.shroomCd.length; i++) this.shroomCd[i] = Math.max(0, this.shroomCd[i]! - dt);
    // thorns snag the pack
    if (!p.air && !p.dead && def.brambles?.length && room.inBramble(p.x, p.y)) {
      const r = def.brambles.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)!;
      if (p.inv <= 0) { this.hurtPlayer(1, false, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 'thorn'); }
    }
    // a rain barrel tips into the pack
    if (this.pack.enabled && !p.air) (def.barrels ?? []).forEach((b, i) => {
      if (Math.hypot(b.x - p.x, b.y - p.y) > 30 || this.barrelWater[i]! <= 0 || this.pack.water >= 1) return;
      const take = Math.min(this.barrelWater[i]!, C.refillRate * dt, 1 - this.pack.water);
      if (!this.pack.refilling) this.fx('splash', p.x - 10, p.y - 34);
      this.barrelWater[i]! -= take; this.pack.water += take; this.pack.refilling = true;
      if (this.barrelWater[i]! <= 0) this.say('The barrel is empty. Find another, or a spring.');
    });
  }

  /** Honk reaching a mushroom ring: spores put the critters around it to sleep. */
  private honkShrooms(gx: number, gy: number, ang: number, range: number, cone: number): void {
    (this.room.def.shrooms ?? []).forEach((m, i) => {
      if (this.shroomCd[i]! > 0) return;
      const dx = m.x - gx, dy = m.y - gy, d = Math.hypot(dx, dy);
      if (d > range + 30 || Math.abs(angDiff(Math.atan2(dy, dx), ang)) > cone + 0.25) return;
      this.shroomCd[i] = 6;
      this.fx('spores', m.x, m.y);
      let n = 0;
      for (const e of this.enemies) {
        if (!this.active(e) || Math.hypot(e.x - m.x, e.y - m.y) > 130) continue;
        e.stun = Math.max(e.stun, BOSS.has(e.kind) ? 1.5 : 4); n++;
        if (e.mode !== 'stalk') { e.mode = 'recover'; e.modeT = 0; }
      }
      this.say(n ? `Spores! ${n} critter${n > 1 ? 's' : ''} nod off.` : 'Poof. A cloud of sleepy spores.');
    });
  }

  private stepGoose(dt: number): void {
    const g = this.goose, p = this.player, room = this.room, L = this.leashLen();
    g.t -= dt;
    if (g.state === 'held' || g.state === 'returning') {
      if (g.state === 'held') {
        g.drag = Math.max(0, g.drag - dt);
        // hauled along after a roll he scrambles to catch up, lagging behind; otherwise he trots at heel
        const tx = p.x - p.fx * 34, ty = p.y - p.fy * 34, k = 1 - Math.exp(-(g.drag > 0 ? 3.5 : 9) * dt);
        g.vx = ((tx - g.x) / Math.max(dt, 1e-3)) * k; g.vy = ((ty - g.y) / Math.max(dt, 1e-3)) * k;
      } else {
        const [dx, dy, d] = dirTo(g, p);
        g.vx = dx * 300; g.vy = dy * 300;
        if (d < 30) g.state = 'held';
      }
    } else if (g.state === 'flying') {
      const drag = Math.exp(-1.6 * dt); g.vx *= drag; g.vy *= drag;
      for (const e of this.enemies) {
        if (!this.active(e)) continue;
        if (Math.hypot(e.x - g.x, e.y - g.y) < e.r + 11 + (this.kit.has('f2') ? 8 : 0)) {
          g.state = 'latched'; g.target = e; g.ox = g.x - e.x; g.oy = g.y - e.y;
          this.damage(e, this.pw()); e.stun = Math.max(e.stun, 0.3); this.addFury(14);
          this.say(this.pick('bite')); this.fx('chomp', g.x, g.y);
          break;
        }
      }
      if (g.state === 'flying') (room.def.bushes ?? []).forEach((b, i) => {
        if (g.state !== 'flying' || !room.bushAlive[i] || Math.hypot(b.x - g.x, b.y - g.y) > b.r + 16) return;
        room.bushAlive[i] = false; room.dirty();
        this.fx('bush', b.x, b.y); this.fx('chomp', g.x, g.y);
        this.say('Biscuit chews straight through the bramble bush!');
        g.state = 'held'; g.vx *= -0.2; g.vy *= -0.2;
      });
      if (g.state === 'flying') for (const post of room.def.posts) {
        // Biscuit flies past the post Rocco is standing beside, so a post at the end of a dock
        // does not block flings out over the water.
        if (Math.hypot(post.x - p.x, post.y - p.y) < post.r + 34) continue;
        if (Math.hypot(post.x - g.x, post.y - g.y) < post.r + 11) {
          g.state = 'latched'; g.target = { ...post, post: true }; g.ox = g.x - post.x; g.oy = g.y - post.y;
          this.say('Latched onto the post.');
          break;
        }
      }
      if (g.state === 'flying' && Math.hypot(g.vx, g.vy) < 140) g.state = 'held';
    } else if (g.state === 'latched') {
      const t = g.target;
      if (!t || (!isPost(t) && !this.active(t))) g.state = 'held';
      else {
        const ol = Math.hypot(g.ox, g.oy) || 1, off = t.r + 9;
        g.x = t.x + (g.ox / ol) * off; g.y = t.y + (g.oy / ol) * off; g.vx = g.vy = 0;
        if (!isPost(t)) {
          g.biteT -= dt;
          if (g.biteT <= 0) {
            g.biteT = 0.5;
            t.stun = Math.max(t.stun, this.kit.stat('biteStun') + (this.kit.has('b2') ? 0.4 : 0));
            this.damage(t, (g.furious > 0 ? this.kit.stat('furyDmg') : 1) * 0.75 * this.pw());
            this.addFury(7);
          }
        }
        const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
        if (d > L && !p.pull) {
          const ex = d - L;
          if (isPost(t) || t.heavy) {
            // the rope holds Rocco to the anchor: he can swing round it, not away from it
            p.x -= (dx / d) * ex; p.y -= (dy / d) * ex;
            const vr = (p.vx * dx + p.vy * dy) / d;
            if (vr > 0) {
              p.vx -= (dx / d) * vr; p.vy -= (dy / d) * vr;
              if (p.roll > 0 && vr > 160) {      // rolled out to the end of the rope: it catches him with a jolt
                p.roll = 0; p.vx -= (dx / d) * vr * 0.35; p.vy -= (dy / d) * vr * 0.35;
                this.fx('boing', p.x - (dx / d) * 20, p.y - (dy / d) * 20);
                this.say(isPost(t) ? 'The leash catches you mid-roll.' : 'Oof. Biscuit is still hanging on to that.');
                if (g.furious > 0) g.strain = Math.min(0.99, g.strain + 0.08);
              }
            }
            room.collide(p);
          } else {
            // a little critter gets dragged along, and a roll yanks it off its feet
            t.x += (dx / d) * ex; t.y += (dy / d) * ex; room.collide(t);
            if (p.roll > 0) { t.vx += (dx / d) * 260 * dt * 20; t.vy += (dy / d) * 260 * dt * 20; t.stun = Math.max(t.stun, 0.5); }
          }
        }
      }
    } else if (g.state === 'loose') {
      let e = this.nearestEnemy(g.x, g.y);
      if (g.feral && (!e || Math.hypot(e.x - g.x, e.y - g.y) > 260)) e = null;
      if (g.feral && !e) {
        // nothing left to bite nearby: the janitor will do
        const [dx, dy, d] = dirTo(g, p);
        const sp = 215 + 12 * this.power();
        g.vx = dx * sp; g.vy = dy * sp;
        if (d < p.r + 12) {
          g.biteT -= dt;
          if (g.biteT <= 0) {
            g.biteT = 0.4;
            if (this.kit.stat('noBite')) {
              this.fx('chomp', p.x, p.y);
              if (this.rng() < 0.25) this.say('He chews the Toothed Leash instead of you.');
            } else if (p.inv <= 0) {
              this.hurtPlayer(this.power() >= 4 ? 2 : 1, false, g, 'bite');
              p.vx += dx * 260; p.vy += dy * 260;
              this.fx('chomp', p.x, p.y);
              if (this.kit.toothFirst || this.rng() < 0.4) { this.kit.toothFirst = false; this.drop('tooth', p.x, p.y); }
              if (p.hp > 0) this.say('The goose bit YOU.');
            }
          }
        }
      } else if (e) {
        const [dx, dy, d] = dirTo(g, e);
        const sp = g.furious > 0 ? 320 : 250;
        g.vx = dx * sp; g.vy = dy * sp;
        if (d < e.r + 12) {
          g.biteT -= dt;
          if (g.biteT <= 0) {
            g.biteT = 0.35; this.damage(e, this.pw()); this.addFury(6);
            e.vx += dx * 120; e.vy += dy * 120; this.fx('chomp', g.x, g.y);
          }
        }
      } else { g.vx *= 0.8; g.vy *= 0.8; }
      if (g.t <= 0 && !g.feral) { g.state = 'returning'; this.say('Goose is bored. Coming back.'); }
    }
    // Move in sub-steps no longer than the goose's radius so a fast fling cannot tunnel through a wall.
    const gb = { x: g.x, y: g.y, r: C.gooseRadius };
    const travel = g.state === 'latched' ? 0 : Math.hypot(g.vx, g.vy) * dt;
    const sub = Math.max(1, Math.ceil(travel / (C.gooseRadius * 0.8)));
    let bounced = false;
    for (let i = 0; i < sub; i++) {
      if (g.state !== 'latched') { gb.x += (g.vx * dt) / sub; gb.y += (g.vy * dt) / sub; }
      if (room.collide(gb) && g.state === 'flying' && !bounced) { g.vx *= -0.35; g.vy *= -0.35; bounced = true; }
    }
    this.keepInside(gb);
    g.x = gb.x; g.y = gb.y;
    if (Math.abs(g.vx) > 8) g.face = g.vx > 0 ? 1 : -1;

    // leash limit
    if (g.state === 'flying' || g.state === 'held') {
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d > L) {
        // the rope goes taut: they pull on each other. A fling reaching the end tugs Rocco a little;
        // Rocco rolling or running away hauls Biscuit along.
        const w = g.state === 'flying' ? this.gooseWeight() * 0.5 : (p.roll > 0 || g.drag > 0 ? this.gooseWeight() : 0);
        this.taut(dx, dy, d, L, w);
        if (g.state === 'flying') { g.state = 'held'; g.drag = 0.35; this.say(this.pick('boing')); this.fx('boing', g.x, g.y); }
      }
    }

    // rope: attached unless the goose is loose or returning on his own
    const attached = g.state !== 'loose' && g.state !== 'returning';
    this.rope.step(attached ? p : null, g, L);

    // grab the trailing leash of a loose goose
    const head = this.rope.head;
    if (!attached && !p.pull && g.grabCd <= 0 && Math.hypot(head.x - p.x, head.y - p.y) < 22) {
      const wasFeral = g.feral;
      g.state = 'held'; g.feral = false; g.t = 0;
      // The trailing end can sit up to a hand's reach past full length; reel him in to the leash limit.
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d > L) { g.x = p.x + (dx / d) * L; g.y = p.y + (dy / d) * L; }
      this.say(wasFeral ? 'Leash grabbed! Still furious, though.' : 'Got the leash.');
    }
  }

  /** Safety net: clamp a body inside the room's outer bounds. */
  private keepInside(o: { x: number; y: number; r: number }): void {
    const { width, height } = this.room.def;
    o.x = clamp(o.x, o.r, width - o.r);
    o.y = clamp(o.y, o.r, height - o.r);
  }

  /** True while the leash is held by the janitor. */
  get leashAttached(): boolean { return this.goose.state !== 'loose' && this.goose.state !== 'returning'; }
}
