/**
 * A playtest bot that plays like a person, not like a perfect machine.
 *
 * It sees only what's on screen, notices a telegraph a reaction time after it starts, aims with a shaky hand,
 * lets go of the cast button a little early or late, forgets to patch the pack, panics when Bimbo is gasping,
 * stops to look around, and sometimes does the wrong thing (cuts the line too soon, walks into a fire bar).
 * Three skill profiles cover a first-time player, a typical one, and someone good at action games.
 *
 * It drives the real sim through the same InputFrame the keyboard does, at 60 Hz, deciding ten times a second.
 */
import { C, STEP } from '../src/core/config';
import type { Enemy, InputFrame, Sim, Dart } from '../src/core/sim';
import type { Vec } from '../src/core/math';
import { Nav, CELL } from './nav';

export type Skill = 'novice' | 'average' | 'skilled';

export interface Profile {
  /** Seconds from a telegraph starting to the bot reacting to it. */
  react: number;
  /** Aim error, px (1 sigma). */
  aimErr: number;
  /** Cast release error, in meter units (1 sigma) around the top of the swing. */
  castErr: number;
  /** Chance to dodge-roll a telegraphed attack it noticed; chance to raise the oar instead (if it has one). */
  dodge: number; guard: number;
  /** Goes for water below this. Patches once this many tears are open. */
  waterLow: number; patchAt: number;
  /** Uses honks in crowds; leads moving targets; keeps its distance. */
  honk: number; lead: number; kite: number;
  /** Chance per second of a pointless pause (looking around, reading). */
  dawdle: number;
  /** Chance per second, when swarmed, of mashing Q (cutting the line too soon). */
  panicCut: number;
  /** Chance to remember to throw bread at a feral goose. */
  bread: number;
  /** How much it cares about hazards when choosing a path (0 walks straight through fire bars). */
  care: number;
  /** Chance of noticing and going after a pickup it can see. */
  greed: number;
  /** Parry timing error (s, 1 sigma). */
  parryErr: number;
}

export const PROFILES: Record<Skill, Profile> = {
  novice: { react: 0.45, aimErr: 22, castErr: 0.14, dodge: 0.3, guard: 0.15, waterLow: 0.14, patchAt: 3, honk: 0.25, lead: 0, kite: 0.1, dawdle: 0.05, panicCut: 0.02, bread: 0.5, care: 0.3, greed: 0.35, parryErr: 0.14 },
  average: { react: 0.3, aimErr: 12, castErr: 0.08, dodge: 0.6, guard: 0.45, waterLow: 0.3, patchAt: 2, honk: 0.55, lead: 0.5, kite: 0.5, dawdle: 0.02, panicCut: 0.004, bread: 0.85, care: 0.8, greed: 0.6, parryErr: 0.08 },
  skilled: { react: 0.2, aimErr: 6, castErr: 0.045, dodge: 0.85, guard: 0.75, waterLow: 0.4, patchAt: 1, honk: 0.8, lead: 1, kite: 0.85, dawdle: 0.005, panicCut: 0, bread: 1, care: 1, greed: 0.8, parryErr: 0.045 },
};

/** Enemy modes that mean "an attack is coming". */
const TELL = new Set(['wind', 'aim', 'dive', 'leap', 'charge', 'lash', 'spear', 'swoop', 'snap', 'dart', 'scoop', 'flame', 'quills', 'slam', 'gust', 'surface', 'bash', 'takeoff', 'stir', 'glide']);
const BOSSES = new Set(['elder', 'heron', 'king', 'gullbeard', 'pelican', 'blackswan', 'queen']);
const HONK_REACH = 155 * (0.85 + 0.15 * 2);

export interface BotLog {
  perfect: number; casts: number; dodges: number; parries: number; patches: number; refills: number; breads: number;
  panicCuts: number; grapples: number; grappleFails: number; honks: number; stuckAt: Vec[]; notes: string[];
}

export class Bot {
  readonly p: Profile;
  private nav: Nav;
  private rng: () => number;
  private t = 0; private decideT = 0;
  private intent: InputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  /** When each enemy entered its current mode (so a telegraph is noticed a reaction time later). */
  private seen = new Map<number, { mode: string; since: number; handled: boolean }>();
  private path: { cells: number[]; posts: (Vec | undefined)[] } | null = null; private pathI = 0; private pathT = 0;
  private releaseAim: Vec | null = null;
  private castPlan: { target: Vec; err: Vec; want: number; prev: number; enemy?: number; post?: Vec; age?: number } | null = null;
  private latchT = 0; private rollT = 0; private guardT = 0; private dawdleT = 0; private refilling = false;
  private progress = { x: 0, y: 0, t: 0 }; private stuckN = 0; private wiggle = 0;
  grapple: { post: Vec; land: Vec; tries: number; t: number } | null = null;
  private parryPlan = new Map<Dart, number>();
  log: BotLog = { perfect: 0, casts: 0, dodges: 0, parries: 0, patches: 0, refills: 0, breads: 0, panicCuts: 0, grapples: 0, grappleFails: 0, honks: 0, stuckAt: [], notes: [] };
  /** The goal: a door to walk out of, or a point to fight round (a boss), or a fishing spot. */
  goal: { door?: string; fight?: boolean; point?: Vec; bell?: boolean } = {};
  blockDoors: string[] = [];

  constructor(private sim: Sim, readonly skill: Skill, seed: number) {
    this.p = PROFILES[skill];
    this.nav = new Nav(sim);
    let s = seed * 2654435761 >>> 0;
    this.rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  private gauss(): number { return Math.sqrt(-2 * Math.log(1 - this.rng())) * Math.cos(2 * Math.PI * this.rng()); }

  /** What's on screen: the 640x360 view round Rocco. */
  private visible(e: Vec): boolean { const pl = this.sim.player; return Math.abs(e.x - pl.x) < 330 && Math.abs(e.y - pl.y) < 190; }
  private foes(): Enemy[] { return this.sim.enemies.filter(e => !e.dead && !e.woke && !e.falling && this.visible(e)); }

  /** One fixed step of input. Decides ten times a second (with jitter), holds its intent in between. */
  frame(): InputFrame {
    const sim = this.sim, pl = sim.player;
    this.t += STEP; this.decideT -= STEP;
    // track modes for reaction delays
    for (const e of sim.enemies) {
      const s = this.seen.get(e.id);
      if (!s || s.mode !== e.mode) this.seen.set(e.id, { mode: e.mode, since: this.t, handled: false });
    }
    const f: InputFrame = { ...this.intent };
    // one-shot presses don't repeat between decisions
    this.intent.roll = false; this.intent.yank = false; this.intent.honk = false; this.intent.feed = false; this.intent.patch = false; this.intent.letGo = false; this.intent.fling = false;
    if (pl.dead) { this.path = null; this.castPlan = null; this.grapple = null; return { moveX: 0, moveY: 0, aimX: pl.x, aimY: pl.y }; }
    this.castTick(f);
    this.parryTick(f);
    if (this.decideT <= 0) {
      this.decideT = 0.08 + this.rng() * 0.07;
      this.decide();
      Object.assign(f, this.intent);
    }
    if (this.castPlan) { f.aimX = this.castPlan.target.x + this.castPlan.err.x; f.aimY = this.castPlan.target.y + this.castPlan.err.y; }
    if (this.releaseAim) { f.aimX = this.releaseAim.x; f.aimY = this.releaseAim.y; f.castHold = false; this.releaseAim = null; }
    // people don't stroll off a dock on purpose: drop a step that would put Rocco in the water (a roll still can)
    if ((f.moveX || f.moveY) && !f.roll) {
      const room = sim.room, l = Math.hypot(f.moveX, f.moveY) || 1, ax = pl.x + (f.moveX / l) * 22, ay = pl.y + (f.moveY / l) * 22;
      if (room.inPit(ax, ay, 2) && !room.inPit(pl.x, pl.y, 2)) {
        if (!room.inPit(pl.x + (f.moveX / l) * 22, pl.y, 2)) f.moveY = 0;
        else if (!room.inPit(pl.x, pl.y + (f.moveY / l) * 22, 2)) f.moveX = 0;
        else { f.moveX = 0; f.moveY = 0; }
      }
    }
    return f;
  }

  // ------------------------------------------------------------------ casting: hold, watch the meter, let go
  private castTick(f: InputFrame): void {
    const sim = this.sim, cp = this.castPlan;
    if (!cp) return;
    const g = sim.goose;
    if (g.state !== 'held' || sim.player.pull) { if (!sim.charging) { if (g.state === 'flying' || g.state === 'latched') this.castPlan = null; } }
    if (cp.enemy !== undefined) { const e = sim.enemies.find(x => x.id === cp.enemy); if (e && !e.dead) { const ld = this.p.lead * 0.25; cp.target = { x: e.x + e.vx * ld, y: e.y + e.vy * ld }; } }
    if (!this.castPlan) return;
    cp.age = (cp.age ?? 0) + STEP;
    if (!sim.charging && cp.age > 0.25) {                              // the button didn't take (held through a roll or a hit): let go and press again
      if (cp.age > 3) { this.castPlan = null; f.castHold = false; this.intent.castHold = false; return; }
      if (Math.floor(cp.age / STEP) % 6 < 2) { f.castHold = false; this.intent.castHold = false; return; }
    }
    const m = sim.charging ? sim.charge() : 0;
    let release = false;
    if (sim.charging) {
      if (m >= cp.want && m >= cp.prev) release = true;                // reached the mark on the way up
      else if (m < cp.prev - 0.02 && this.rng() < 0.35) release = true;  // missed the top: lets go late, weaker
    }
    cp.prev = m;
    if (release) {
      f.castHold = false; this.intent.castHold = false;
      this.releaseAim = { x: cp.target.x + cp.err.x, y: cp.target.y + cp.err.y };
      this.log.casts++; if (m >= sim.sweet()) this.log.perfect++;
      this.latchT = 0;
      this.castPlan = null;
    } else { f.castHold = true; this.intent.castHold = true; }
  }

  private startCast(target: Vec, enemy?: Enemy, post?: Vec): void {
    const sim = this.sim;
    if (sim.goose.state !== 'held' || this.castPlan || sim.player.pull) return;
    const d = Math.hypot(target.x - sim.player.x, target.y - sim.player.y);
    // a person aims for the gold at the top of the swing, unless the target is close (then less power)
    const need = d < sim.castReach(0.5) * 0.8 && this.rng() < 0.4 ? 0.55 : sim.sweet() + 0.06;
    const want = Math.max(0.15, Math.min(0.995, need + this.gauss() * this.p.castErr));
    const e = this.p.aimErr * (post ? 0.6 : 1);
    this.castPlan = { target, err: { x: this.gauss() * e, y: this.gauss() * e }, want, prev: 0, enemy: enemy?.id, post };
  }

  // ------------------------------------------------------------------ parrying: raise the oar as an acorn lands
  private parryTick(f: InputFrame): void {
    const sim = this.sim, pl = sim.player;
    if (!sim.kit.oar) return;
    for (const d of sim.darts) {
      if (d.back || (d.kind !== 'acorn' && d.kind !== 'rock' && d.kind !== 'bottle')) continue;
      if (Math.hypot(d.tx - pl.x, d.ty - pl.y) > 50) continue;
      if (!this.parryPlan.has(d)) {
        const wantParry = this.goal.bell || this.rng() < this.p.guard;
        this.parryPlan.set(d, wantParry ? d.T - 0.12 + this.gauss() * this.p.parryErr : Infinity);
      }
      const at = this.parryPlan.get(d)!;
      if (d.t >= at && d.t < d.T) {
        f.guard = true; this.guardT = 0.25;
        const bell = sim.room.def.bell;
        const aimAt = bell && bell.parryOnly && sim.room.gateClosed ? bell : this.nearestFoe() ?? { x: d.x0, y: d.y0 };
        f.aimX = aimAt.x; f.aimY = aimAt.y;
      }
    }
    for (const d of [...this.parryPlan.keys()]) if (!sim.darts.includes(d)) { this.parryPlan.delete(d); }
    if (this.guardT > 0) { this.guardT -= STEP; f.guard = true; }
  }
  private nearestFoe(): Enemy | null {
    const pl = this.sim.player; let best: Enemy | null = null, bd = Infinity;
    for (const e of this.foes()) { const d = Math.hypot(e.x - pl.x, e.y - pl.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ------------------------------------------------------------------ the decision, ten times a second
  branch = '';
  private decide(): void {
    const sim = this.sim, pl = sim.player, g = sim.goose, pk = sim.pack, I = this.intent, p = this.p;
    I.guard = false; this.branch = 'start';
    if (this.rollT > 0) { this.rollT -= 0.1; this.branch = 'rolling'; return; }
    // the goose has turned on us
    if (g.feral) { this.branch = 'feral';
      const has = Object.values(sim.kit.bread).some(n => n > 0);
      if (has && this.rng() < p.bread) { I.feed = true; this.log.breads++; return; }
      const [ux, uy] = norm(pl.x - g.x, pl.y - g.y); I.moveX = ux; I.moveY = uy; I.castHold = false;
      if (Math.hypot(g.x - pl.x, g.y - pl.y) < 50 && pl.roll <= 0 && this.rng() < p.dodge) { I.roll = true; this.rollT = 0.3; }
      return;
    }
    // dawdling: stops to look at the scenery / read a sign
    if (this.dawdleT > 0) { this.branch = 'dawdle'; this.dawdleT -= 0.1; I.moveX = 0; I.moveY = 0; return; }
    if (this.rng() < p.dawdle * 0.1 && !this.foes().length) { this.dawdleT = 0.5 + this.rng() * 1.5; return; }
    // patch the pack
    if (pk.enabled && pk.holes >= p.patchAt && pk.needles > 0 && (sim.kit.mats.fluff ?? 0) > 0 && !this.danger()) { I.patch = true; this.log.patches++; }
    // dodge or guard a telegraph we've noticed
    const threat = this.threat();
    if (threat) { this.branch = 'threat:' + threat.kind + ':' + threat.mode;
      const s = this.seen.get(threat.id)!; s.handled = true;
      const r = this.rng();
      if (r < p.dodge && pl.roll <= 0) {
        const [ax, ay] = norm(pl.x - threat.x, pl.y - threat.y), side = this.rng() < 0.5 ? 1 : -1;
        I.moveX = ax * 0.4 - ay * side; I.moveY = ay * 0.4 + ax * side; I.roll = true; this.rollT = 0.25; this.log.dodges++;
        return;
      } else if (sim.kit.oar && r < p.dodge + p.guard * (1 - p.dodge)) {
        I.guard = true; I.aimX = threat.x; I.aimY = threat.y; this.guardT = 0.6; I.moveX = 0; I.moveY = 0;
        return;
      }
    }
    // swarmed: honk, and sometimes panic and mash Q
    const near = this.foes().filter(e => Math.hypot(e.x - pl.x, e.y - pl.y) < 130);
    if (near.length >= 2 && g.honkCd <= 0 && this.rng() < p.honk) { I.honk = true; I.aimX = near[0]!.x; I.aimY = near[0]!.y; this.log.honks++; }
    if (near.length >= 2 && (g.state === 'held' || g.state === 'latched') && this.rng() < p.panicCut * 0.1) { I.letGo = true; this.log.panicCuts++; }
    // water first, when it's low (or keep filling once started)
    if (pk.enabled && (sim.room.def.refills?.length ?? 0) > 0) {
      if (pk.water < p.waterLow) this.refilling = true;
      if (this.refilling) { this.branch = 'refill';
        if (pk.water > 0.95) { this.refilling = false; this.log.refills++; }
        else {
          const rf = sim.room.def.refills!;
          if (rf.some(r => pl.x > r.x && pl.x < r.x + r.w && pl.y > r.y && pl.y < r.y + r.h)) { I.moveX = 0; I.moveY = 0; this.fightFromHere(); return; }
          const ok = this.goTo(i => { const c = this.nav.center(i); return rf.some(r => c.x > r.x + 6 && c.x < r.x + r.w - 6 && c.y > r.y + 6 && c.y < r.y + r.h - 6); }, 'refill');
          if (ok) { this.fightOnTheWay(); return; }
          this.refilling = false;
        }
      }
    }
    // a grapple step in progress
    if (this.grapple) { this.branch = 'grapple'; this.doGrapple(); return; }
    // fight what's in front of us
    if (this.fight()) { this.branch = 'fight:' + this.fightNote; return; }
    // pickups: sewing kits, spools, bread, glass, if we can see them
    if (this.pickup()) { this.branch = 'pickup'; return; }
    this.branch = 'nav'; this.navigate();
  }

  /** An enemy whose telegraph we've noticed, aimed our way. */
  private threat(): Enemy | null {
    const pl = this.sim.player;
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.foes()) {
      const s = this.seen.get(e.id);
      if (!s || s.handled || !TELL.has(e.mode) || this.t - s.since < this.p.react) continue;
      const d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (d < (BOSSES.has(e.kind) ? 320 : 190) && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  private danger(): boolean { const pl = this.sim.player; return this.foes().some(e => Math.hypot(e.x - pl.x, e.y - pl.y) < 160); }

  /** Pick a target and cast at it; keep a sensible distance. Returns true if it's busy fighting. */
  private fight(): boolean {
    const sim = this.sim, pl = sim.player, g = sim.goose, I = this.intent;
    const foes = this.foes().filter(e => e.mode !== 'tunnel' && e.air <= 30 && !(e.kind === 'eel' && e.mode === 'lurk'));
    if (!foes.length) return false;
    // bosses first if they're up, else the nearest
    foes.sort((a, b) => (BOSSES.has(b.kind) ? 1 : 0) - (BOSSES.has(a.kind) ? 1 : 0) || Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
    const e = foes[0]!, d = Math.hypot(e.x - pl.x, e.y - pl.y);
    this.fightNote = `${e.kind}:${e.mode}:${Math.round(d)}:${g.state}`;
    const boss = BOSSES.has(e.kind);
    if (d > 420 && !boss) return false;
    this.bossKnowledge(e);
    if (g.state === 'latched') {
      this.latchT += 0.1;
      const t = g.target as (Enemy | Vec | null);
      const onFoe = t && 'kind' in (t as Enemy);
      if (onFoe && ((t as Enemy).kind === 'turtle' || this.latchT > 1.2 + this.rng()) && this.rng() < 0.5) I.yank = true;
      if (!onFoe && this.latchT > 1.5) I.yank = true;                  // hooked a post by accident: may as well go
      I.moveX = 0; I.moveY = 0;
      return true;
    }
    // crabs with claws up: wait. Shield turtles: get round the side first (what the CLANG hint says)
    let guarded = e.kind === 'crab' && e.mode === 'guard';
    if (e.kind === 'turtle' && e.mode !== 'flipped' && this.knows('turtle')) {
      const fx = e.fx_ ?? 1, fy = e.fy_ ?? 0, front = ((pl.x - e.x) * fx + (pl.y - e.y) * fy) / (d || 1);
      this.flankT = this.flankTarget === e.id ? this.flankT + 0.1 : 0; this.flankTarget = e.id;
      if (front > 0.1 && e.stun <= 0 && g.honkCd <= 0 && d < HONK_REACH * 0.9 && this.rng() < this.p.honk) { I.honk = true; I.aimX = e.x; I.aimY = e.y; this.log.honks++; }
      if (front > 0.1 && this.flankT < 5) {
        guarded = true;
        const side = (fx * (pl.y - e.y) - fy * (pl.x - e.x)) > 0 ? 1 : -1;   // circle round the way that's shorter
        const tx = e.x + (-fy * side) * 130 - fx * 60, ty = e.y + (fx * side) * 130 - fy * 60;
        const [mx, my] = norm(tx - pl.x, ty - pl.y); I.moveX = mx; I.moveY = my; I.aimX = e.x; I.aimY = e.y;
        return true;
      }
    }
    const reach = sim.castReach(1) * 0.92;
    if (g.state === 'held' && !guarded && d < reach && !this.castPlan) this.startCast({ x: e.x, y: e.y }, e);
    // movement: close in if too far, back off a little if too close (kiting), else strafe
    const want = 110 + 70 * this.p.kite;
    const [ux, uy] = norm(e.x - pl.x, e.y - pl.y);
    if (d > reach * 0.9) { this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - e.x, c.y - e.y) < reach * 0.7; }, 'foe'); }
    else if (d < want && this.rng() < this.p.kite) { I.moveX = -ux; I.moveY = -uy; }
    else { const s = Math.sin(this.t * 0.7) > 0 ? 1 : -1; I.moveX = -uy * s * 0.5 * this.p.kite; I.moveY = ux * s * 0.5 * this.p.kite; }
    I.aimX = e.x; I.aimY = e.y;
    return true;
  }
  fightNote = '';
  private flankT = 0; private flankTarget = -1;
  /** Hints the player has read (the sim's hint events); skilled players figure some things out without them. */
  readonly hints = new Set<string>();
  knows(id: string): boolean { return this.hints.has(id) || (this.skill === 'skilled' && id !== 'line'); }
  private fightFromHere(): void { const e = this.nearestFoe(); if (e && this.sim.goose.state === 'held' && Math.hypot(e.x - this.sim.player.x, e.y - this.sim.player.y) < this.sim.castReach(1) * 0.9) this.startCast(e, e); }
  private fightOnTheWay(): void { if (this.rng() < 0.3) this.fightFromHere(); }

  /** What a player learns from the hint prompts about each boss. */
  private bossKnowledge(e: Enemy): void {
    const sim = this.sim, I = this.intent, pl = sim.player, d = Math.hypot(e.x - pl.x, e.y - pl.y);
    if (e.kind === 'queen' && e.mode === 'song' && sim.goose.honkCd <= 0) { I.honk = true; I.aimX = e.x; I.aimY = e.y; this.log.honks++; }
    if (e.kind === 'elder' && e.mode === 'tired' && d < 200 && sim.goose.honkCd <= 0 && this.rng() < 0.4) { I.honk = true; I.aimX = e.x; I.aimY = e.y; }
    if (e.kind === 'pelican' && e.mode === 'gulp' && sim.goose.state === 'latched') I.yank = true;
    if (e.kind === 'king' && e.mode === 'wind' && this.rng() < 0.3) {   // bait the charge into a tree: stand in front of one
      const trees = sim.room.def.walls.filter(w => (w as { kind?: string }).kind === 'tree');
      const t = trees.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      if (t) { const [ux, uy] = norm(t.x + t.w / 2 - pl.x, t.y + t.h / 2 - pl.y); I.moveX = ux; I.moveY = uy; }
    }
  }

  // ------------------------------------------------------------------ getting places
  private navigate(): void {
    const sim = this.sim, def = sim.room.def, pl = sim.player, I = this.intent;
    // a bell to ring?
    const bell = def.bell;
    if (bell && sim.room.gateClosed && !bell.parryOnly && !this.reachGoal()) {
      if (Math.hypot(bell.x - pl.x, bell.y - pl.y) < HONK_REACH * 0.75) {
        if (sim.goose.honkCd <= 0) { I.honk = true; I.aimX = bell.x; I.aimY = bell.y; this.log.honks++; }
        I.moveX = 0; I.moveY = 0; return;
      }
      if (this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - bell.x, c.y - bell.y) < HONK_REACH * 0.6; }, 'bell')) return;
    }
    if (bell && sim.room.gateClosed && bell.parryOnly && !this.reachGoal()) {
      this.goal.bell = true;                                         // wait by the chime for an acorn to bat at it
      const sq = sim.enemies.find(e => e.kind === 'squirrel' && !e.dead && !e.woke);
      if (sq && Math.hypot(bell.x - pl.x, bell.y - pl.y) < C.parryRange * 0.8) { I.moveX = 0; I.moveY = 0; I.aimX = bell.x; I.aimY = bell.y; return; }
      if (this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - bell.x, c.y - bell.y) < C.parryRange * 0.6; }, 'chime')) return;
    }
    // bramble in the way: chew through it
    if (!this.reachGoal() && sim.room.bushAlive.some(b => b)) {
      const bushes = def.bushes ?? [];
      const i = bushes.findIndex((b, k) => sim.room.bushAlive[k] && Math.hypot(b.x - pl.x, b.y - pl.y) < sim.castReach(1) * 0.85 && this.visible(b));
      if (i >= 0 && sim.goose.state === 'held') { this.startCast(bushes[i]!); I.moveX = 0; I.moveY = 0; return; }
      if (this.goTo(this.goalTest(), 'bushes', true)) return;
    }
    if (this.goal.fight) {
      // a fight to finish (waves, a boss): go toward the nearest one still up, as a player follows the noise
      const up = sim.enemies.filter(e => !e.dead && !e.woke && !e.falling).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      if (up && !BOSSES.has(up.kind) && this.goal.point && Math.hypot(this.goal.point.x - pl.x, this.goal.point.y - pl.y) < 500) {
        const r2 = this.sim.castReach(1) * 0.7;
        if (this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - up.x, c.y - up.y) < r2; }, `hunt${up.id}`)) return;
      }
      const boss = sim.enemies.find(e => BOSSES.has(e.kind) && !e.dead && !e.woke);
      const reach = this.sim.castReach(1) * 0.8;
      if (boss && this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - boss.x, c.y - boss.y) < reach; }, 'boss')) return;
    }
    if (!this.goTo(this.goalTest(), 'goal')) {
      // no way through yet: wander toward unexplored ground, as a person would
      I.moveX = Math.sin(this.t * 0.3); I.moveY = Math.cos(this.t * 0.23);
    }
  }

  private goalTest(): (i: number) => boolean {
    const pt = this.goal.point;
    if (pt) return i => { const c = this.nav.center(i); return Math.hypot(c.x - pt.x, c.y - pt.y) < 20 + (this.goal.fight ? 120 : 0) && !(this.nav.hazard[i]! > 0); };
    const d = this.sim.room.def.doors?.find(x => x.id === this.goal.door);
    if (!d) return () => false;
    return i => { const c = this.nav.center(i); return c.x > d.x - 20 && c.x < d.x + d.w + 20 && c.y > d.y - 20 && c.y < d.y + d.h + 20; };
  }
  private reachGoal(): boolean {
    this.nav.update(this.blockDoors);
    const from = this.nav.nearestWalk(this.sim.player.x, this.sim.player.y);
    return !!this.nav.path(from, this.goalTest(), this.p.care);
  }

  /** Walk (and grapple) toward the nearest cell passing `goal`. Returns false if there's no way there. */
  private goTo(goal: (i: number) => boolean, tag: string, bushesPass = false): boolean {
    const sim = this.sim, pl = sim.player, I = this.intent;
    this.nav.update(this.blockDoors, bushesPass);
    this.pathT -= 0.1;
    const here = this.nav.nearestWalk(pl.x, pl.y);
    if (!this.path || this.pathT <= 0 || this.pathTag !== tag) {
      this.path = this.nav.path(here, goal, this.p.care); this.pathI = 0; this.pathT = 1; this.pathTag = tag;
    }
    if (!this.path) return false;
    const { cells, posts } = this.path;
    // skip waypoints we've reached
    while (this.pathI < cells.length - 1) {
      const c = this.nav.center(cells[this.pathI]!);
      if (Math.hypot(c.x - pl.x, c.y - pl.y) < CELL * 1.2 && !posts[this.pathI + 1]) this.pathI++;
      else break;
    }
    const nextPost = posts[this.pathI + 1];
    if (nextPost && Math.hypot(this.nav.center(cells[this.pathI]!).x - pl.x, this.nav.center(cells[this.pathI]!).y - pl.y) < CELL * 1.5) {
      this.grapple = { post: nextPost, land: this.nav.center(cells[this.pathI + 1]!), tries: 0, t: 0 };
      this.path = null;
      return true;
    }
    // look a few cells ahead (no grapple in between) and walk at it
    let k = this.pathI;
    for (let j = this.pathI + 1; j < Math.min(cells.length, this.pathI + 4); j++) { if (posts[j] || !this.clearLine(pl, this.nav.center(cells[j]!))) break; k = j; }
    const c = this.nav.center(cells[k]!);
    const [ux, uy] = norm(c.x - pl.x, c.y - pl.y);
    I.moveX = ux; I.moveY = uy; I.aimX = pl.x + ux * 100; I.aimY = pl.y + uy * 100;
    if (this.wiggle > 0) { this.wiggle -= 0.1; I.moveX = -uy; I.moveY = ux; }
    // stuck?
    if (Math.hypot(pl.x - this.progress.x, pl.y - this.progress.y) > 24) this.progress = { x: pl.x, y: pl.y, t: this.t };
    else if (this.t - this.progress.t > 3) {
      this.progress.t = this.t; this.path = null; this.wiggle = 0.6; this.stuckN++;
      if (this.stuckN % 5 === 0) this.log.stuckAt.push({ x: Math.round(pl.x), y: Math.round(pl.y) });
    }
    return true;
  }
  private pathTag = '';
  /** Is the straight walk from a to b on solid ground the whole way (a person looks where they step on a narrow dock)? */
  private clearLine(a: Vec, b: Vec): boolean {
    const room = this.sim.room, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let i = 1; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (room.inPit(x, y, 2)) return false; }
    return true;
  }

  private doGrapple(): void {
    const sim = this.sim, g = sim.goose, pl = sim.player, I = this.intent, gr = this.grapple!;
    gr.t += 0.1; I.moveX = 0; I.moveY = 0;
    if (pl.pull || pl.air) return;                                   // on the way across
    if (Math.hypot(pl.x - gr.land.x, pl.y - gr.land.y) < 40) { this.grapple = null; this.log.grapples++; return; }
    if (g.state === 'latched') {
      const t = g.target as Vec | null;
      if (t && Math.hypot(t.x - gr.post.x, t.y - gr.post.y) < 8) { I.yank = true; return; }
      I.yank = true; return;                                         // latched on something else: shake it off
    }
    if (g.state === 'held' && !this.castPlan && !sim.charging) {
      if (gr.tries >= 4 || gr.t > 15) { this.grapple = null; this.log.grappleFails++; this.path = null; return; }
      gr.tries++;
      this.startCast(gr.post, undefined, gr.post);
    }
  }

  /** Sewing kits, spools, bread, sea glass a person can see: commit to one for a while, give up on ones it can't reach. */
  private pickTarget: { at: Vec; until: number } | null = null;
  private pickBlack = new Set<string>();
  private pickup(): boolean {
    const sim = this.sim, def = sim.room.def, pl = sim.player;
    if (this.danger()) return false;
    const got = (s: Vec) => [...(def.kits ?? []).map((k, i) => [k, sim.kitsGot[i]] as const), ...(def.spools ?? []).map((k, i) => [k, sim.spoolsGot[i]] as const),
      ...(def.breadSpots ?? []).map((k, i) => [k, sim.breadGot[i]] as const), ...(def.glass ?? []).map((k, i) => [k, sim.glassGot[i]] as const)].some(([k, g]) => k === s && g);
    if (this.pickTarget) {
      const t = this.pickTarget;
      if (got(t.at) || this.t > t.until) { if (!got(t.at)) this.pickBlack.add(`${t.at.x},${t.at.y}`); this.pickTarget = null; }
      else if (this.goTo(i => { const c = this.nav.center(i); return Math.hypot(c.x - t.at.x, c.y - t.at.y) < 14; }, `pick${t.at.x},${t.at.y}`)) return true;
      else { this.pickBlack.add(`${t.at.x},${t.at.y}`); this.pickTarget = null; }
      return false;
    }
    if (this.rng() > this.p.greed * 0.2) return false;
    const spots: Vec[] = [];
    (def.kits ?? []).forEach((k, i) => { if (!sim.kitsGot[i]) spots.push(k); });
    (def.spools ?? []).forEach((k, i) => { if (!sim.spoolsGot[i]) spots.push(k); });
    (def.breadSpots ?? []).forEach((k, i) => { if (!sim.breadGot[i]) spots.push(k); });
    (def.glass ?? []).forEach((k, i) => { if (!sim.glassGot[i]) spots.push(k); });
    const vis = spots.filter(s => this.visible(s) && !this.pickBlack.has(`${s.x},${s.y}`) && Math.hypot(s.x - pl.x, s.y - pl.y) < 300);
    if (!vis.length) return false;
    const s = vis.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0]!;
    this.pickTarget = { at: s, until: this.t + 10 };
    return this.pickup();
  }

  // ------------------------------------------------------------------ fishing
  /** Fishing at a spot: cast near a shadow, wait out nibbles, strike, reel, let go on a thrash, grab at the shore. */
  fishFrame(spotPos: Vec): InputFrame {
    const sim = this.sim, F = sim.fishing, pl = sim.player, h = F.hooked;
    const f: InputFrame = { moveX: 0, moveY: 0, aimX: pl.x + 100, aimY: pl.y };
    this.t += STEP;
    if (Math.hypot(spotPos.x - pl.x, spotPos.y - pl.y) > 18 && (F.phase === 'off' || F.phase === 'ready')) {
      const [ux, uy] = norm(spotPos.x - pl.x, spotPos.y - pl.y); f.moveX = ux; f.moveY = uy; return f;
    }
    const st = this.fish;
    switch (F.phase) {
      case 'ready': {
        if (!st.aim) {
          let sh = F.shadows.filter(s => s.mode !== 'flee').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
          // the goal fish lives in the trench (the hint says so): aim for the big shadows out there, most of the time
          const tr = sim.room.def.fishing?.trench;
          const want = this.skill === 'novice' ? 0.4 : this.skill === 'average' ? 0.7 : 0.9;
          if (tr && this.rng() < want) { const deep = sh.filter(s => s.x > tr.x && s.x < tr.x + tr.w && s.y > tr.y && s.y < tr.y + tr.h && sim.castReach(1) > Math.hypot(s.x - pl.x, s.y - pl.y)); if (deep.length) sh = deep.sort((a, b) => b.def.size - a.def.size); }
          const pick = sh[Math.floor(this.rng() * Math.min(3, sh.length))];
          if (!pick) return f;
          const d = Math.hypot(pick.x - pl.x, pick.y - pl.y);
          let pw = 0.12; while (pw < 1 && sim.castReach(pw) < d) pw += 0.01;
          st.aim = { x: pick.x + this.gauss() * this.p.aimErr, y: pick.y + this.gauss() * this.p.aimErr };
          st.want = Math.max(0.12, Math.min(1, pw + this.gauss() * this.p.castErr)); st.prev = 0; st.wait = 0.3 + this.rng() * 0.5;
        }
        st.wait -= STEP; if (st.wait > 0) return f;
        f.aimX = st.aim.x; f.aimY = st.aim.y;
        const m = F.charging ? F.charge() : 0;
        if (F.charging && ((m >= st.want && m >= st.prev) || (m < st.prev - 0.02))) { st.prev = 0; st.aim = null; return f; }
        st.prev = m; f.castHold = true; return f;
      }
      case 'bite':
        st.biteT = (st.biteT ?? 0) + STEP;
        if (st.biteT > this.p.react + Math.abs(this.gauss()) * 0.08) { f.castHold = true; st.biteT = 0; }
        return f;
      case 'reel': {
        if (!h) return f;
        // a thrash warning or a run: let go after a reaction time; watch the tension bar too
        const alarm = h.warn > 0 || h.runT > 0 || h.tension > 0.82;
        if (alarm) st.alarmT = (st.alarmT ?? 0) + STEP; else st.alarmT = 0;
        const letGo = alarm && st.alarmT! > this.p.react * 0.8;
        f.castHold = !letGo && h.tension < 0.9;
        if (!f.castHold && h.tension < 0.15 && !(h.runT > 0)) f.castHold = true;       // don't let it go slack
        return f;
      }
      case 'land': st.landT = (st.landT ?? 0) + STEP; if (st.landT > this.p.react) { f.yank = true; st.landT = 0; } return f;
      default: st.biteT = 0; return f;
    }
  }
  private fish: { aim: Vec | null; want: number; prev: number; wait: number; biteT?: number; alarmT?: number; landT?: number } = { aim: null, want: 0.5, prev: 0, wait: 0 };
}

function norm(x: number, y: number): [number, number] { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
