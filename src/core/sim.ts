/**
 * The whole game simulation for one room. No Phaser imports: everything here runs headless in tests.
 * Ported 1:1 from the HTML prototype (Room 01) so behaviour and tuning match.
 */
import { C, DEFAULT_TUNING, type Tuning } from './config';
import { Kit } from './crafting';
import { angDiff, clamp, dirTo, inRect, mulberry32, type Rng, type Vec } from './math';
import { Room } from './room';
import { Rope } from './rope';
import { ROOM_01, type EnemyKind, type RoomDef } from '../data/rooms';
import { ITEMS, breadById, isCatalyst, leashById, type BreadId, type ItemId, type LeashId } from '../data/recipes';

// ---------------------------------------------------------------- types

export type GooseState = 'held' | 'flying' | 'latched' | 'loose' | 'returning';
export type { EnemyKind };

/** How close Rocco must get before an entranced critter notices him. Room 01's pests see across the room. */
const AGGRO: Partial<Record<EnemyKind, number>> = { frog: 160, snapper: 210 };
const HEAVY: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['knight', 'snapper']);

export interface Player {
  x: number; y: number; r: number; vx: number; vy: number;
  hp: number; inv: number; air: boolean; pull: Target | null;
  /** Last movement direction; the goose trails behind it. */
  fx: number; fy: number;
  dead: number; // seconds left of the death pause, 0 when alive
}

export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; r: number;
  hp: number; max: number; heavy: boolean; stun: number;
  vx: number; vy: number; falling: number; dead: boolean; hitT: number; spd: number;
}

export interface PostTarget { x: number; y: number; r: number; post: true }
export type Target = Enemy | PostTarget;
const isPost = (t: Target): t is PostTarget => 'post' in t;

export interface Goose {
  x: number; y: number; vx: number; vy: number; state: GooseState; feral: boolean;
  strain: number; target: Target | null; ox: number; oy: number; face: 1 | -1;
  t: number; fury: number; furious: number; tug: number; honkCd: number; biteT: number; grabCd: number;
}

export interface Item { mat: ItemId; x: number; y: number; vx: number; vy: number; t: number; got?: boolean }

export interface Buffs { noFury: number; bagel: number; mega: number }

/** The backpack that keeps the Moon Koi alive. Only active in rooms that have refill zones. */
export interface Pack {
  enabled: boolean;
  water: number;          // 0-1
  holes: number;
  patches: number;        // sewn on so far (shown on the sprite)
  lastWater: Vec;         // where Rocco wakes if the koi faints
  refilling: boolean;
}

/** One step's worth of player intent. Verb flags are edges: true only on the step they were pressed. */
export interface InputFrame {
  moveX: number; moveY: number;
  aimX: number; aimY: number;
  fling?: boolean; yank?: boolean; honk?: boolean; letGo?: boolean; feed?: boolean; cycle?: boolean; patch?: boolean;
}

export type FxKind = 'honk' | 'chomp' | 'boing' | 'poof' | 'ring' | 'snap' | 'bread' | 'pick' | 'tear' | 'splash' | 'faint' | 'patch';
export type SimEvent =
  | { type: 'say'; text: string }
  | { type: 'fx'; kind: FxKind; x: number; y: number; a?: number; cone?: number; range?: number; text?: string }
  | { type: 'won' }
  | { type: 'reset' };

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
  breadGot: boolean[] = [];
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
  pw(): number { return 0.6 + 0.4 * this.tuning.power; }
  /** Positive when the goose outclasses the leash. */
  gap(): number { return this.tuning.power - this.str(); }
  refuseChance(): number {
    const g = this.gap();
    return this.goose.furious > 0 ? clamp(0.3 + 0.18 * g, 0.05, 0.8) : clamp(0.1 * g, 0, 0.4);
  }
  strainRate(): number { return Math.max(0, 0.15 + 0.35 * this.gap()) * this.kit.stat('strain'); }

  // ------------------------------------------------ lifecycle

  reset(def: RoomDef = this.room?.def ?? ROOM_01): void {
    this.room = new Room(def);
    const s = def.playerStart;
    this.player = { x: s.x, y: s.y, r: C.playerRadius, vx: 0, vy: 0, hp: C.maxHp, inv: 0, air: false, pull: null, fx: 1, fy: 0, dead: 0 };
    this.goose = { x: s.x - 30, y: s.y, vx: 0, vy: 0, state: 'held', feral: false, strain: 0, target: null, ox: 0, oy: 0, face: 1,
      t: 0, fury: 0, furious: 0, tug: 0, honkCd: 0, biteT: 0, grabCd: 0 };
    this.enemies = def.enemies.map(e => this.mkEnemy(e.kind, e.x, e.y));
    this.items = [];
    this.breadGot = def.breadSpots.map(() => false);
    this.buff = { noFury: 0, bagel: 0, mega: 0 };
    this.pack = { enabled: !!def.refills?.length, water: 1, holes: 0, patches: 0, lastWater: { ...s }, refilling: false };
    this.rope = new Rope(s);
    this.time = 0; this.won = false; this.clearT = 0; this.handled = 0;
    this.spawnT = 4; this.knightT = 0; this.clapperCd = 0; this.rang = false; this.bucketCd = 0;
    this.events.push({ type: 'reset' });
    this.say(this.pack.enabled ? `${def.name}. Keep the koi wet. Biscuit is already mad.` : `${def.name}. The goose is already mad.`);
  }

  mkEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const k = HEAVY.has(kind);
    return { id: this.nextId++, kind, x, y, r: k ? 20 : 13, hp: k ? 8 : 3, max: k ? 8 : 3, heavy: k, stun: 0,
      vx: 0, vy: 0, falling: 0, dead: false, hitT: 0, spd: k ? 42 : 78 };
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
    const fs = this.tuning.fling * this.kit.stat('fling');
    g.x = p.x + dx * 18; g.y = p.y + dy * 18; g.vx = dx * fs; g.vy = dy * fs;
    g.state = 'flying'; g.face = dx >= 0 ? 1 : -1;
    this.say(this.pick('fling'));
  }

  yank(): void {
    const g = this.goose, p = this.player;
    if (this.won || p.dead) return;
    if (this.rng() < this.refuseChance() && g.state !== 'held') { this.say(this.pick('refuse')); return; }
    if (g.state === 'flying') { g.state = 'held'; g.vx *= -0.3; g.vy *= -0.3; return; }
    if (g.state !== 'latched' || !g.target) return;
    const t = g.target;
    if (isPost(t) || t.heavy) {
      p.pull = t; p.air = true;
      this.say(isPost(t) ? 'Wheee!' : 'The knight drags you in. HEADBUTT incoming.');
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
    g.honkCd = C.honkCooldown;
    const mega = this.buff.mega > 0;
    if (mega) this.buff.mega--;
    const shed = this.kit.stat('honkStrain');
    if (shed) g.strain *= 1 - shed;
    const furyB = g.furious > 0 || mega;
    const range = (furyB ? 220 : 155) * (0.85 + 0.15 * this.tuning.power) * this.kit.stat('honkR');
    const cone = furyB ? 0.9 : 0.62;
    const [dx, dy] = dirTo(g, aim);
    const ang = Math.atan2(dy, dx);
    this.fx('honk', g.x, g.y, { a: ang, cone, range });
    g.face = dx >= 0 ? 1 : -1;
    for (const e of this.enemies) {
      if (e.dead || e.falling) continue;
      const ex = e.x - g.x, ey = e.y - g.y, d = Math.hypot(ex, ey);
      if (d < range + e.r && Math.abs(angDiff(Math.atan2(ey, ex), ang)) < cone) {
        const k = (e.heavy ? 260 : 470) * (furyB ? 1.4 : 1) * (0.8 + 0.1 * this.tuning.power);
        e.vx += (ex / (d || 1)) * k; e.vy += (ey / (d || 1)) * k; e.stun = Math.max(e.stun, 1.3);
        if (g.state === 'latched' && g.target === e) g.state = 'held';
      }
    }
    const bell = this.room.def.bell;
    if (bell) {
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
      if (g.furious <= 0) g.furious = C.furiousSeconds * this.kit.stat('furyDur');
      this.say('Ghost Pepper Roll. Oh no. Oh YES.');
      return;
    }
    this.calm();
    if (id === 'stale') this.say(wasFeral ? 'Bread accepted. Truce.' : 'Bread. The goose is (briefly) at peace.');
    if (id === 'sour') { this.buff.noFury = 8; this.say('Sourdough of Serenity. Zen goose for 8 s.'); }
    if (id === 'bagel') { this.buff.bagel = 20; this.say('Chain Bagel. Leash reinforced +2 for 20 s.'); }
    if (id === 'muffin') { this.player.hp = Math.min(C.maxHp, this.player.hp + 1); this.say('The goose coughs up a heart. +1 HP. Gross.'); }
    if (id === 'bun') { this.buff.mega = 5; this.say('Clapper Bun. He rings inside. 5 mega honks.'); }
  }

  cycleBread(): void {
    const id = this.kit.cycleBread();
    this.say(`Bread ready: ${breadById(id).name} ×${this.kit.bread[id]}`);
  }

  /** Sew a patch over one hole, using Reed Fiber. */
  patchPack(): boolean {
    const pk = this.pack;
    if (!pk.enabled || this.won || this.player.dead) return false;
    if (pk.holes <= 0) { this.say('No holes to patch. The koi thanks you anyway.'); return false; }
    if (this.kit.mats.fluff < C.patchCost) { this.say(`Need ${C.patchCost} Reed Fiber to patch. Frogs drop it.`); return false; }
    this.kit.mats.fluff -= C.patchCost;
    pk.holes--; pk.patches++;
    this.fx('patch', this.player.x - 10, this.player.y - 30);
    this.say(pk.holes ? `Patched one. ${pk.holes} left.` : 'Pack patched. No more leaks.');
    return true;
  }

  private stepPack(dt: number): void {
    const pk = this.pack, p = this.player;
    if (!pk.enabled || p.dead) return;
    const was = pk.refilling;
    pk.refilling = !p.air && this.room.inRefill(p.x, p.y);
    if (pk.refilling) {
      pk.water = Math.min(1, pk.water + C.refillRate * dt);
      pk.lastWater = { x: p.x, y: p.y };
      if (!was && pk.water < 0.98) { this.fx('splash', p.x - 10, p.y - 34); this.say('Refilling the pack. The koi perks up.'); }
      return;
    }
    const before = pk.water;
    pk.water = Math.max(0, pk.water - (C.packDrain + C.holeDrain * pk.holes) * dt);
    if (before >= 0.3 && pk.water < 0.3) this.say('The Moon Koi is gasping. Find water!');
    if (pk.water <= 0) {
      this.fx('faint', p.x, p.y - 40);
      this.say('The Moon Koi fainted! Rocco runs it back to the water…');
      p.x = pk.lastWater.x; p.y = pk.lastWater.y; p.vx = p.vy = 0; p.pull = null; p.air = false; p.inv = 1.5;
      const g = this.goose; g.state = 'held'; g.feral = false; g.x = p.x - 30; g.y = p.y;
      pk.water = C.faintRefill;
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
    g.fury = Math.min(100, g.fury + v * this.tuning.fury * this.kit.stat('furyGain'));
    if (g.fury >= 100) { g.furious = C.furiousSeconds * this.kit.stat('furyDur'); this.say(this.pick('furious')); }
  }

  nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.falling) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  damage(e: Enemy, amt: number): void {
    if (e.dead) return;
    e.hp -= amt; e.hitT = 0.15;
    if (e.hp > 0) return;
    e.dead = true; this.handled++;
    this.fx('poof', e.x, e.y);
    if (!e.heavy) { this.drop('fluff', e.x, e.y); if (this.rng() < 0.45) this.drop('crust', e.x, e.y); }
    else { this.drop('chain', e.x, e.y, 2); this.drop('crest', e.x, e.y); }
    if (this.goose.target === e && this.goose.state === 'latched') this.goose.state = 'held';
  }

  hurtPlayer(amt = 1): void {
    const p = this.player;
    if (p.inv > 0 || p.air || p.dead) return;
    p.hp -= amt; p.inv = C.invulnerable;
    if (this.pack.enabled && this.pack.holes < C.maxHoles && this.rng() < C.holeChance) {
      this.pack.holes++;
      this.fx('tear', p.x - 10, p.y - 30);
      this.say(this.pack.holes === 1 ? 'Your pack tore! Water is leaking. [P] to patch.' : `Another hole! ${this.pack.holes} leaks now.`);
    }
    if (p.hp <= 0) { p.dead = 0.9; this.say(this.pack.enabled ? 'Rocco is out. Back to the dock…' : 'The janitor is out. Resetting…'); }
  }

  // ------------------------------------------------ step

  step(dt: number, input?: InputFrame): void {
    const p = this.player, g = this.goose, room = this.room, T = this.tuning;
    this.time += dt;
    if (this.won) return;
    if (p.dead) { p.dead -= dt; if (p.dead <= 0) this.reset(); return; }

    if (input) {
      const aim = { x: input.aimX, y: input.aimY };
      if (input.fling) this.fling(aim);
      if (input.yank) this.yank();
      if (input.honk) this.honk(aim);
      if (input.letGo) this.letGo();
      if (input.feed) this.feedBread();
      if (input.cycle) this.cycleBread();
      if (input.patch) this.patchPack();
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
    const bunnies = this.enemies.filter(e => !e.dead && !e.heavy).length;
    if (this.spawnT <= 0) {
      this.spawnT = C.bunnySpawnEvery;
      const vents = room.def.vents;
      if (bunnies < C.maxBunnies && vents.length) {
        const v = vents[Math.floor(this.rng() * vents.length)]!;
        this.enemies.push(this.mkEnemy(light, v.x, v.y)); this.fx('ring', v.x, v.y);
      }
    }
    const ks = room.def.knightSpawn;
    if (ks && !this.enemies.some(e => !e.dead && e.heavy)) {
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
      const ysp = T.yank * this.kit.stat('yank');
      const tDead = !isPost(t) && t.dead;
      if (d < t.r + p.r + 4 || tDead) {
        p.pull = null; p.air = false; p.vx *= 0.2; p.vy *= 0.2; g.state = 'held';
        if (!isPost(t) && t.heavy && !t.dead) {
          this.damage(t, 2); t.stun = 1.6; t.vx += dx * 380; t.vy += dy * 380; this.say('HEADBUTT!');
        }
      } else { p.vx = dx * ysp; p.vy = dy * ysp; }
    } else {
      let mx = input?.moveX ?? 0, my = input?.moveY ?? 0;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      if (ml > 0.01) { const l = Math.hypot(mx, my); p.fx = mx / l; p.fy = my / l; }
      const acc = 1 - Math.exp(-14 * dt);
      p.vx += (mx * C.playerSpeed - p.vx) * acc; p.vy += (my * C.playerSpeed - p.vy) * acc;
      // a goose stronger than his leash tugs you around
      if ((g.furious > 0 || calmTug) && g.state === 'held') {
        g.tug -= dt;
        if (g.tug <= 0) {
          g.tug = calmTug ? 1.6 - 0.25 * this.gap() + this.rng() * 0.5 : 0.55 + this.rng() * 0.4;
          const e = this.nearestEnemy(p.x, p.y);
          let a = e ? Math.atan2(e.y - p.y, e.x - p.x) : this.rng() * Math.PI * 2;
          a += (this.rng() - 0.5) * 1.2;
          const tug = (calmTug ? 110 * this.gap() : 300 * Math.max(0.35, 1 + 0.5 * this.gap())) * this.kit.stat('tug');
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
    if (!p.air && room.inPit(p.x, p.y, 6)) {
      const pond = this.pack.enabled;
      this.hurtPlayer();
      const sp = room.def.respawns[room.pitSide(p.x)];
      p.x = sp.x; p.y = sp.y; p.vx = p.vy = 0;
      g.state = 'held'; g.x = p.x - 30; g.y = p.y;
      if (pond) { this.pack.water = 1; this.fx('splash', p.x, p.y - 20); }   // at least the koi enjoyed it
      this.say(this.pick(pond ? 'swim' : 'fall'));
    }
    this.stepPack(dt);
    const exit = room.def.exit;
    if (exit && !room.gateClosed && inRect(p.x, p.y, exit)) { this.won = true; this.clearT = this.time; this.events.push({ type: 'won' }); }

    // ---- enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.falling) { e.falling += dt; if (e.falling > 0.6) { e.falling = 0; e.dead = true; } continue; }
      e.stun = Math.max(0, e.stun - dt); e.hitT = Math.max(0, e.hitT - dt);
      const [dx, dy, d] = dirTo(e, p);
      let ax = 0, ay = 0;
      const slow = g.state === 'latched' && g.target === e ? 0.35 : 1;
      if (!e.stun && d < (AGGRO[e.kind] ?? 300)) { ax = dx * e.spd * slow; ay = dy * e.spd * slow; }
      // AI won't walk into the pit; knockback can push them in
      let nx = e.x + ax * dt, ny = e.y + ay * dt;
      if (room.inPit(nx, e.y, -e.r)) nx = e.x;
      if (room.inPit(e.x, ny, -e.r)) ny = e.y;
      e.x = nx; e.y = ny;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const dec = Math.exp(-5 * dt); e.vx *= dec; e.vy *= dec;
      room.collide(e);
      if (room.inPit(e.x, e.y, 2) && Math.hypot(e.vx, e.vy) > 0) {
        e.falling = 0.001; this.handled++;
        const bank = room.bankPoint(e.x, e.y, 14);
        this.drop('goo', bank.x, bank.y);
        this.say(this.pick(this.pack.enabled ? 'splash' : 'pit'));
        if (g.target === e) g.state = 'held';
        continue;
      }
      if (!e.stun && d < e.r + p.r) this.hurtPlayer();
    }
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i]!, b = this.enemies[j]!;
      if (a.dead || b.dead || a.falling || b.falling) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0) { const q = (m - d) / 2; a.x -= (dx / d) * q; a.y -= (dy / d) * q; b.x += (dx / d) * q; b.y += (dy / d) * q; }
    }

    this.stepGoose(dt);
  }

  private stepGoose(dt: number): void {
    const g = this.goose, p = this.player, room = this.room, L = this.leashLen();
    g.t -= dt;
    if (g.state === 'held' || g.state === 'returning') {
      if (g.state === 'held') {
        const tx = p.x - p.fx * 34, ty = p.y - p.fy * 34, k = 1 - Math.exp(-9 * dt);
        g.vx = ((tx - g.x) / Math.max(dt, 1e-3)) * k; g.vy = ((ty - g.y) / Math.max(dt, 1e-3)) * k;
      } else {
        const [dx, dy, d] = dirTo(g, p);
        g.vx = dx * 300; g.vy = dy * 300;
        if (d < 30) g.state = 'held';
      }
    } else if (g.state === 'flying') {
      const drag = Math.exp(-1.6 * dt); g.vx *= drag; g.vy *= drag;
      for (const e of this.enemies) {
        if (e.dead || e.falling) continue;
        if (Math.hypot(e.x - g.x, e.y - g.y) < e.r + 11) {
          g.state = 'latched'; g.target = e; g.ox = g.x - e.x; g.oy = g.y - e.y;
          this.damage(e, this.pw()); e.stun = Math.max(e.stun, 0.3); this.addFury(14);
          this.say(this.pick('bite')); this.fx('chomp', g.x, g.y);
          break;
        }
      }
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
      if (!t || (!isPost(t) && (t.dead || t.falling))) g.state = 'held';
      else {
        const ol = Math.hypot(g.ox, g.oy) || 1, off = t.r + 9;
        g.x = t.x + (g.ox / ol) * off; g.y = t.y + (g.oy / ol) * off; g.vx = g.vy = 0;
        if (!isPost(t)) {
          g.biteT -= dt;
          if (g.biteT <= 0) {
            g.biteT = 0.5;
            t.stun = Math.max(t.stun, this.kit.stat('biteStun'));
            this.damage(t, (g.furious > 0 ? this.kit.stat('furyDmg') : 1) * 0.75 * this.pw());
            this.addFury(7);
          }
        }
        const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
        if (d > L && !p.pull) {
          const ex = d - L;
          if (isPost(t) || t.heavy) {
            p.x -= (dx / d) * ex; p.y -= (dy / d) * ex;
            const vr = (p.vx * dx + p.vy * dy) / d;
            if (vr > 0) { p.vx -= (dx / d) * vr; p.vy -= (dy / d) * vr; }
            room.collide(p);
          } else { t.x += (dx / d) * ex; t.y += (dy / d) * ex; room.collide(t); }
        }
      }
    } else if (g.state === 'loose') {
      let e = this.nearestEnemy(g.x, g.y);
      if (g.feral && (!e || Math.hypot(e.x - g.x, e.y - g.y) > 260)) e = null;
      if (g.feral && !e) {
        // nothing left to bite nearby: the janitor will do
        const [dx, dy, d] = dirTo(g, p);
        const sp = 215 + 12 * this.tuning.power;
        g.vx = dx * sp; g.vy = dy * sp;
        if (d < p.r + 12) {
          g.biteT -= dt;
          if (g.biteT <= 0) {
            g.biteT = 0.4;
            if (this.kit.stat('noBite')) {
              this.fx('chomp', p.x, p.y);
              if (this.rng() < 0.25) this.say('He chews the Toothed Leash instead of you.');
            } else if (p.inv <= 0) {
              this.hurtPlayer(this.tuning.power >= 4 ? 2 : 1);
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
        g.x = p.x + (dx / d) * L; g.y = p.y + (dy / d) * L;
        if (g.state === 'flying') { g.state = 'held'; this.say(this.pick('boing')); this.fx('boing', g.x, g.y); }
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
