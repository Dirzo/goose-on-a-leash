/**
 * Fishing (Moonlit Cove). Engine-free, stepped by the Sim while Rocco stands on a fishing spot.
 *
 *   ready   hold to wind up (the same swinging meter as Biscuit's cast), release to cast the bobber
 *   fly     the bobber arcs out; it has to land in the fishing water
 *   wait    a shadow near the bobber comes to look. It nibbles (don't strike!), then takes it
 *   bite    strike now: click, or the bait is gone
 *   reel    hold to reel in. Every few seconds the fish makes a run (it thrashes first): let go, or the
 *           line goes tight and SNAPS. Leave it slack too long and it spits the hook. Tired fish stop running
 *   land    at the shore it leaps: Biscuit, grab it! [E / right click] or it slips back out
 *   caught  the catch card. Each new kind of fish shows a bigger shadow further out.
 *
 * The ladder: Sprat, Mackerel, Sea Bass, Grouper, then the Moray Twins in the trench off the Far Rock
 * (catch one and the other takes the line). Bigger fish swim further out, pull harder and run longer.
 */
import { C } from './config';
import type { Rect, Vec } from './math';

export type FishId = string;
export type FishPhase = 'off' | 'ready' | 'fly' | 'wait' | 'bite' | 'reel' | 'land' | 'caught';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'junk';

export interface FishDef {
  id: FishId; name: string; tier: number; rarity: Rarity; color: string;
  /** Length range in cm. */
  len: [number, number];
  /** Shadow size in px; swim speed. */
  size: number; speed: number;
  /** How hard it pulls (0..1), seconds of fight in it, how often it runs and for how long. */
  pull: number; stamina: number; runEvery: number; runFor: number;
  /** Seconds to strike once it takes the bait. */
  bite: number;
  glass: number;
  /** Shown on the catch card the first time. */
  fact: string;
  /** Swims only in the trench off the Far Rock; or only once the Moray Pearl is found. */
  trench?: boolean; afterPearl?: boolean;
}

/** How far out each tier swims (from the nearest fishing spot). Tier 5 lives in the trench. */
export const TIER_DEPTH = [0, 40, 130, 210, 290, 0];
const W: Record<Rarity, number> = { common: 10, uncommon: 4.5, rare: 1.4, legendary: 0.35, junk: 1.1 };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#c8d0d8', uncommon: '#7cc48a', rare: '#6aa8ff', legendary: '#f2c230', junk: '#a89080' };

type Row = [FishId, string, number, Rarity, [number, number], number, number, number, number, number, number, number, string];
//  id, name, tier, rarity, length cm, shadow, pull, stamina, runEvery, runFor, bite window, sea glass, fact
const ROWS: Row[] = [
  ['sprat', 'Sprat', 1, 'common', [8, 14], 7, 0.25, 2.5, 3, 0.6, 0.75, 1, 'Sprats swim in shoals of thousands. This one went its own way.'],
  ['goby', 'Rock Goby', 1, 'common', [5, 11], 6, 0.2, 2, 3.2, 0.5, 0.8, 1, 'Gobies cling to rocks with a little suction-cup fin.'],
  ['blenny', 'Blenny', 1, 'uncommon', [8, 15], 7, 0.3, 3, 2.4, 0.6, 0.6, 2, 'A blenny has a face like a disappointed uncle.'],
  ['sandeel', 'Sand Eel', 1, 'uncommon', [15, 25], 7, 0.35, 2.5, 1.8, 0.5, 0.55, 2, "Sand eels dive into the sand when they're scared. Not actually eels."],
  ['hermit', 'Hermit Crab', 1, 'rare', [4, 9], 6, 0.3, 3, 2.5, 0.8, 0.9, 3, 'A hermit crab in a borrowed shell. It wants its shell back, and your bait.'],
  ['boot', 'Old Boot', 1, 'junk', [26, 32], 8, 0.12, 1, 99, 0, 1, 1, "An old boot. There's a pebble of sea glass in the toe."],
  ['goldsprat', 'Golden Sprat', 1, 'legendary', [10, 16], 7, 0.4, 3, 1.6, 0.5, 0.4, 12, 'A Golden Sprat! Fishermen say it brings luck. It definitely brings sea glass.'],
  ['mackerel', 'Mackerel', 2, 'common', [24, 38], 10, 0.4, 4, 2.6, 0.9, 0.6, 2, 'Mackerel never stop swimming. Not even to bite. Especially not to bite.'],
  ['wrasse', 'Ballan Wrasse', 2, 'common', [18, 30], 9, 0.38, 3.5, 2.8, 0.8, 0.65, 2, "Wrasse change colour as they grow up. This one's going through a phase."],
  ['pollock', 'Pollock', 2, 'common', [30, 50], 11, 0.42, 4.5, 2.8, 1.0, 0.6, 2, 'A pollock: it dives for the kelp the moment it feels the hook.'],
  ['bream', 'Gilthead Bream', 2, 'uncommon', [25, 40], 11, 0.45, 4.5, 2.4, 1.0, 0.55, 3, 'A gold bar between its eyes, like a monocle. Very distinguished.'],
  ['pipefish', 'Pipefish', 2, 'uncommon', [20, 35], 6, 0.3, 3, 1.8, 0.6, 0.5, 3, 'A pipefish: a seahorse that stood up straight.'],
  ['bottle', 'Message in a Bottle', 2, 'junk', [20, 24], 7, 0.12, 1, 99, 0, 1, 2, ''],
  ['bass', 'Sea Bass', 3, 'common', [40, 70], 14, 0.55, 6, 2.3, 1.2, 0.5, 3, 'Sea bass hunt in the surf at night. So does Biscuit.'],
  ['mullet', 'Red Mullet', 3, 'common', [20, 35], 11, 0.5, 5, 2.2, 1.0, 0.5, 3, 'Red mullet taste the seabed with their chin whiskers.'],
  ['dory', 'John Dory', 3, 'uncommon', [30, 55], 14, 0.55, 6, 2.6, 1.2, 0.45, 4, "The dark spot on its side is a thumbprint, the old story goes. Whose thumb? Nobody says."],
  ['garfish', 'Garfish', 3, 'uncommon', [50, 80], 9, 0.6, 5, 1.6, 0.8, 0.4, 4, 'Garfish have green bones. Nobody knows why. They leap when hooked.'],
  ['cuttle', 'Cuttlefish', 3, 'rare', [20, 40], 12, 0.5, 6, 2.0, 1.4, 0.5, 6, 'A cuttlefish. It squirted ink on Biscuit. Biscuit will remember this.'],
  ['lobster', 'Lobster', 3, 'rare', [30, 50], 12, 0.65, 7, 2.6, 1.6, 0.6, 6, 'A lobster. It is not happy about any of this.'],
  ['grouper', 'Grouper', 4, 'common', [80, 130], 20, 0.7, 8, 2.6, 1.6, 0.45, 5, 'A grouper: a fish the size of a doormat with the attitude of a landlord.'],
  ['conger', 'Conger Eel', 4, 'common', [100, 180], 14, 0.72, 8, 2.0, 1.6, 0.45, 5, "A conger eel, thick as Rocco's arm. Mind your fingers."],
  ['monkfish', 'Monkfish', 4, 'uncommon', [60, 100], 18, 0.68, 7, 3, 1.8, 0.5, 6, 'A monkfish is mostly mouth. It has its own little fishing rod on its head. Respect.'],
  ['turbot', 'Turbot', 4, 'uncommon', [50, 80], 18, 0.66, 7, 2.6, 1.4, 0.45, 6, 'Flat as a plate, with both eyes on the same side.'],
  ['octopus', 'Octopus', 4, 'rare', [60, 120], 16, 0.75, 9, 1.8, 1.8, 0.5, 8, 'An octopus. It tried to unscrew the reel.'],
  ['chest', 'Sunken Tackle Chest', 4, 'junk', [40, 50], 12, 0.35, 2, 99, 0, 1, 10, 'A sunken tackle chest! Sea glass and twine inside.'],
  ['moray', 'Moray Twin', 5, 'rare', [150, 190], 24, 0.82, 8, 1.8, 1.3, 0.42, 4, 'One of the Moray Twins. Its sibling is watching.'],
  ['lantern', 'Lanternfish', 5, 'common', [6, 12], 6, 0.3, 3, 2, 0.6, 0.6, 4, 'A lanternfish. It glows. Bimbo is jealous.'],
  ['blobfish', 'Blobfish', 5, 'uncommon', [20, 30], 12, 0.2, 2, 4, 1, 0.8, 6, 'A blobfish. It looks the way Rocco feels.'],
  ['oarfish', 'Oarfish', 5, 'legendary', [300, 500], 26, 0.85, 12, 1.6, 1.6, 0.35, 20, 'An OARFISH. The longest bony fish in the sea, and you landed it with a goose.'],
  ['moonfish', 'Moonfish', 5, 'legendary', [100, 160], 22, 0.8, 10, 1.8, 1.5, 0.35, 20, "The Moonfish, silver as the old moon. Bimbo says it's a cousin. Bimbo says a lot of things."],
];
const SPEED = [0, 48, 56, 52, 42, 46];
export const FISH: readonly FishDef[] = ROWS.map(([id, name, tier, rarity, len, size, pull, stamina, runEvery, runFor, bite, glass, fact]) => ({
  id, name, tier, rarity, len, size, pull, stamina, runEvery, runFor, bite, glass, fact,
  color: RARITY_COLOR[rarity], speed: SPEED[tier]! * (rarity === 'junk' ? 0.4 : 1),
  trench: tier === 5 || undefined, afterPearl: id === 'moonfish' || undefined,
}));
export const fishById = (id: string) => FISH.find(f => f.id === id)!;
/** What the bottles say. */
export const BOTTLE_NOTES = [
  "'If found, return to the Blood Shark.' ...It's signed with a tooth.",
  "'Day 40 on the rock. The gulls have unionised.'",
  "'Dear whoever: the Moray Twins can't tell each other apart either.'",
  "'Grandpa's secret: let the line go when the fish runs. -R.' Rocco's own handwriting?!",
  "'The castle swans are not swans.' That's it. That's the whole note.",
  "A recipe for sea-glass salt. Captain Gullbeard's handwriting. It says 'ARR' a lot.",
];

export interface FishingSpot extends Vec { name: string; deep?: boolean }
export interface FishingGrounds { spots: FishingSpot[]; water: Rect; trench?: Rect }

export interface Shadow { id: number; def: FishDef; x: number; y: number; tx: number; ty: number; mode: 'swim' | 'come' | 'flee'; t: number }
export interface Hooked { def: FishDef; len: number; giant: boolean; stamina: number; tension: number; runIn: number; runT: number; warn: number; slack: number; twin: boolean }

/** What the fishing needs from the sim. */
export interface FishingHost {
  rng(): number;
  inWater(x: number, y: number): boolean;
  /** Best catches so far, by fish. */
  record(): Record<string, { n: number; best: number }>;
  /** The Spinning Reel: reels faster, a run pulls a little less. */
  reel(): boolean;
  /** Difficulty: how hard fish fight. */
  pull(): number;
  /** How far a cast at this power reaches. */
  castReach(pw: number): number;
  say(t: string): void;
  fx(kind: 'splash' | 'chest' | 'perfect' | 'snap' | 'chomp', x: number, y: number): void;
  sound(kind: string): void;
  caught(def: FishDef, len: number, first: boolean, giant: boolean): void;
  /** The Moray Pearl has been found (the Moonfish rises after). */
  pearl(): boolean;
}

const RANGE = 170;           // how far past its depth a shadow may roam
const LAND = 30;             // the fish is at the shore

export class Fishing {
  phase: FishPhase = 'off';
  spot: FishingSpot | null = null;
  t = 0;
  /** Wind-up (seconds held) and whether a fresh press may start one. */
  chargeT = 0; charging = false; private armed = true; private prevHold = false;
  bob: Vec = { x: 0, y: 0 };
  from: Vec = { x: 0, y: 0 };
  shadows: Shadow[] = [];
  /** The shadow that's coming for the bait, and its nibble schedule. */
  taker: Shadow | null = null;
  private nibbles: number[] = [];
  /** A nibble just now (the view dips the bobber). */
  nibble = 0;
  hooked: Hooked | null = null;
  card: { def: FishDef; len: number; first: boolean; giant: boolean; t: number; note?: string } | null = null;
  private nextId = 1;
  private grounds: FishingGrounds | null = null;

  constructor(private host: FishingHost) {}

  /** The swinging meter, 0..1 (as Biscuit's cast). */
  charge(): number { const u = this.chargeT / C.castChargeTime, ph = u % 2; return Math.max(C.castMinPower, ph <= 1 ? ph : 2 - ph); }

  /** Rocco is planted (can't walk off) while the line is out. */
  get busy(): boolean { return this.phase !== 'off' && this.phase !== 'ready'; }

  /** The highest tier caught so far. */
  topTier(): number { return Math.max(0, ...FISH.filter(f => this.host.record()[f.id]?.n).map(f => f.tier)); }

  /** New room: its fishing grounds (or none). */
  setGrounds(g: FishingGrounds | null): void {
    this.grounds = g; this.shadows = []; this.phase = 'off'; this.spot = null; this.hooked = null; this.taker = null; this.card = null;
  }

  /** Pick what a new shadow in open water (or the trench) is: the ladder so far plus the next rung, weighted by rarity. */
  private pick(trench: boolean): FishDef | null {
    const top = this.topTier(), rec = this.host.record();
    const pool = FISH.filter(f => (trench ? f.tier === 5 : f.tier < 5 && f.tier <= top + 1) && f.id !== 'moray' && (!f.afterPearl || this.host.pearl()));
    if (trench) {
      if (top < 4) return null;
      const morays = this.shadows.filter(s => s.def.id === 'moray').length;
      if ((rec.moray?.n ?? 0) < 2 && !this.host.pearl() && morays < 2) return fishById('moray');
    }
    // the newest rung shows up more, so there is always something new to chase
    const wt = (f: FishDef) => W[f.rarity] * (f.tier === top + 1 ? 1.6 : 1);
    const total = pool.reduce((a, f) => a + wt(f), 0);
    let r = this.host.rng() * total;
    for (const f of pool) { r -= wt(f); if (r <= 0) return f; }
    return pool[0] ?? null;
  }

  /** A point in the water at this fish's depth (distance from the nearest spot), or in the trench. */
  private place(def: FishDef): Vec | null {
    const g = this.grounds!;
    for (let k = 0; k < 60; k++) {
      const r = def.trench && g.trench ? g.trench : g.water;
      const x = r.x + this.host.rng() * r.w, y = r.y + this.host.rng() * r.h;
      if (!this.host.inWater(x, y)) continue;
      if (def.trench) return { x, y };
      if (g.trench && x >= g.trench.x && x <= g.trench.x + g.trench.w && y >= g.trench.y && y <= g.trench.y + g.trench.h) continue;
      const d = Math.min(...g.spots.map(s => Math.hypot(s.x - x, s.y - y))), depth = TIER_DEPTH[def.tier]!;
      if (d >= depth && d <= depth + RANGE) return { x, y };
    }
    return null;
  }

  private stepShadows(dt: number): void {
    if (!this.grounds) return;
    // keep the water stocked: open water and the trench each hold a few shadows, forever
    const inTrench = (sh: Shadow) => !!sh.def.trench;
    for (const trench of [false, true]) {
      if (trench && !this.grounds.trench) continue;
      const want = trench ? 3 : 9, have = this.shadows.filter(sh => inTrench(sh) === trench).length;
      if (have >= want || this.host.rng() > 0.2) continue;
      const def = this.pick(trench), p = def && this.place(def);
      if (def && p) this.shadows.push({ id: this.nextId++, def, x: p.x, y: p.y, tx: p.x, ty: p.y, mode: 'swim', t: 0 });
    }
    // the morays leave once the pearl's been found
    if (this.host.pearl()) this.shadows = this.shadows.filter(sh => sh.def.id !== 'moray' || sh === this.taker);
    for (const s of this.shadows) {
      s.t += dt;
      if (s.mode === 'come' && s === this.taker) {
        const dx = this.bob.x - s.x, dy = this.bob.y - s.y, l = Math.hypot(dx, dy);
        if (l > 2) { const v = Math.min(l, s.def.speed * 1.2 * dt); s.x += (dx / l) * v; s.y += (dy / l) * v; }
        continue;
      }
      if (s.mode === 'flee' && s.t > 1.2) { s.mode = 'swim'; s.t = 0; }
      const dx = s.tx - s.x, dy = s.ty - s.y, l = Math.hypot(dx, dy);
      if (l < 4 || s.t > 7) { const p = this.place(s.def); if (p) { s.tx = p.x; s.ty = p.y; } s.t = 0; continue; }
      const v = s.def.speed * (s.mode === 'flee' ? 3 : 1) * dt;
      s.x += (dx / l) * Math.min(v, l); s.y += (dy / l) * Math.min(v, l);
    }
  }

  /**
   * One frame. `at`: the spot Rocco is standing on (null when he's off every spot); `hold`: the button;
   * `grab`: Biscuit's grab (yank) this frame; `aim`: where to cast.
   */
  step(dt: number, at: FishingSpot | null, hold: boolean, grab: boolean, aim: Vec, from: Vec): void {
    this.stepShadows(dt);
    const press = hold && !this.prevHold, release = !hold && this.prevHold;
    this.prevHold = hold;
    if (this.card) { this.card.t += dt; if (this.card.t > 2.6 && this.phase === 'caught') { this.card = null; this.phase = at ? 'ready' : 'off'; } }
    this.nibble = Math.max(0, this.nibble - dt);
    if (this.phase === 'off' || this.phase === 'ready') {
      if (!at) { this.phase = 'off'; this.spot = null; this.charging = false; this.chargeT = 0; return; }
      if (this.phase === 'off') { this.phase = 'ready'; this.spot = at; this.armed = !hold; this.host.say(`${at.name}. Hold to cast your line, let go to throw.`); }
      this.spot = at;
    }
    this.t += dt;
    switch (this.phase) {
      case 'ready':
        if (hold && this.armed) { this.charging = true; this.chargeT += dt; }
        if (!hold) this.armed = true;
        if (release && this.charging) {
          const pw = this.charge(), dx = aim.x - from.x, dy = aim.y - from.y, l = Math.hypot(dx, dy) || 1, r = this.host.castReach(pw);
          this.from = { ...from }; this.bob = { x: from.x + (dx / l) * r, y: from.y + (dy / l) * r };
          this.charging = false; this.chargeT = 0; this.phase = 'fly'; this.t = 0; this.host.sound('whoosh');
        }
        return;
      case 'fly':
        if (this.t < 0.55) return;
        if (!this.host.inWater(this.bob.x, this.bob.y)) { this.host.say('Plop. Not in the water. Reel in and cast again.'); this.host.sound('thud'); this.reset(); return; }
        this.host.fx('splash', this.bob.x, this.bob.y); this.host.sound('splash');
        this.phase = 'wait'; this.t = 0; this.taker = null;
        return;
      case 'wait': {
        if (press) { this.scare('Too early! It was only a nibble. Reel in and try again.'); return; }
        if (!this.taker) {
          // the nearest interested shadow comes over (a cast right on top of one: it bites quickly)
          let best: Shadow | null = null, bd = Infinity;
          for (const s of this.shadows) {
            if (s.mode === 'flee') continue;
            const d = Math.hypot(s.x - this.bob.x, s.y - this.bob.y);
            if (d < 70 + s.def.size * 3 && d < bd) { bd = d; best = s; }
          }
          if (best) {
            this.taker = best; best.mode = 'come';
            const k = this.host.rng() < 0.75 ? Math.floor(this.host.rng() * 3) : 0;
            const arrive = Math.max(0.3, bd / (best.def.speed * 1.2));
            this.nibbles = Array.from({ length: k }, (_, i) => arrive + 0.5 + i * (0.5 + this.host.rng() * 0.4));
            this.t = 0;
            this.biteAt = arrive + 0.6 + k * 0.7 + this.host.rng() * 0.6;
          } else if (this.t > 6) { this.host.say("Nothing's biting here. Cast closer to a shadow."); this.reset(); }
          return;
        }
        if (this.nibbles.length && this.t >= this.nibbles[0]!) { this.nibbles.shift(); this.nibble = 0.25; this.host.fx('splash', this.bob.x, this.bob.y); this.host.sound('blip'); }
        if (this.t >= this.biteAt) { this.phase = 'bite'; this.t = 0; this.nibble = 0.5; this.host.fx('splash', this.bob.x, this.bob.y); this.host.sound('boing'); }
        return;
      }
      case 'bite':
        if (press) {
          const def = this.taker!.def;
          this.hook(def, false);
          this.host.say(def.id === 'moray' ? 'A Moray Twin! It coils round the line. Hold to reel, let go when it thrashes!'
            : def.rarity === 'junk' ? "Hooked... something. It's not fighting. Reel it in." : this.hooked!.giant ? 'Hooked! It feels ENORMOUS. Hold to reel; let go when it thrashes.' : 'Hooked! Hold to reel. When it thrashes, LET GO.');
          return;
        }
        if (this.t > this.taker!.def.bite) { this.scare('Too slow. It stole the bait.'); }
        return;
      case 'reel': this.fight(dt, hold); return;
      case 'land':
        if (grab) {
          const h = this.hooked!, first = !(this.host.record()[h.def.id]?.n);
          this.host.fx('chomp', this.bob.x, this.bob.y); this.host.fx('chest', from.x, from.y - 20);
          const note = h.def.id === 'bottle' ? BOTTLE_NOTES[Math.floor(this.host.rng() * BOTTLE_NOTES.length)] : undefined;
          this.card = { def: h.def, len: h.len, first, giant: h.giant, t: 0, note };
          this.host.caught(h.def, h.len, first, h.giant);
          this.shadows = this.shadows.filter(s => s !== this.taker);
          const twin = h.def.id === 'moray' && !h.twin;
          this.hooked = null; this.taker = null;
          if (twin) {                                  // the other twin takes the line before you've even let go
            this.hook(h.def, true);
            this.card.t = 0;
            this.host.say('The OTHER twin grabs the line! Here it comes!');
            return;
          }
          this.phase = 'caught'; this.t = 0;
          return;
        }
        if (this.t > 0.9) {
          const h = this.hooked!;
          h.stamina = Math.max(h.stamina, 1.5); h.tension = 0.3; this.phase = 'reel'; this.t = 0;
          const dx = this.bob.x - from.x, dy = this.bob.y - from.y, l = Math.hypot(dx, dy) || 1;
          this.bob.x = from.x + (dx / l) * 110; this.bob.y = from.y + (dy / l) * 110;
          this.host.say('It flops off the rocks and back into the sea! Reel it in again.');
          this.host.fx('splash', this.bob.x, this.bob.y);
        }
        return;
      default: return;
    }
  }
  private biteAt = 0;

  private hook(def: FishDef, twin: boolean): void {
    const giant = def.rarity !== 'junk' && def.id !== 'moray' && this.host.rng() < 0.08;
    const len = Math.round((def.len[0] + this.host.rng() * (def.len[1] - def.len[0])) * (giant ? 1.4 : 1));
    this.hooked = { def, len, giant, stamina: def.stamina * (twin ? 1.2 : giant ? 1.4 : 1), tension: 0.3, runIn: def.runEvery * (0.6 + this.host.rng() * 0.5), runT: 0, warn: 0, slack: 0, twin };
    if (twin) {                                         // the second twin hits out where the first was hooked
      const s = this.spot!, dx = this.bob.x - s.x, dy = this.bob.y - s.y, l = Math.hypot(dx, dy) || 1;
      this.bob = { x: s.x + (dx / l) * 260, y: s.y + (dy / l) * 260 };
      if (!this.host.inWater(this.bob.x, this.bob.y)) this.bob = { x: this.from.x + (this.bob.x - this.from.x) * 0.6, y: this.from.y + (this.bob.y - this.from.y) * 0.6 };
    }
    this.phase = 'reel'; this.t = 0;
    this.host.sound('chomp');
  }

  /** The reel fight. Tension: holding winds it up, a run spikes it, slack lets the fish go. */
  private fight(dt: number, hold: boolean): void {
    const h = this.hooked!, d = h.def, s = this.spot!, tired = h.stamina <= 0;
    const reelK = this.host.reel() ? 1.35 : 1, ease = this.host.reel() ? 0.85 : 1;
    // runs: it thrashes first (warn), then pulls away
    if (!tired) {
      if (h.runT > 0) { h.runT -= dt; if (h.runT <= 0) h.runIn = d.runEvery * (0.7 + this.host.rng() * 0.6); }
      else if (h.warn > 0) { h.warn -= dt; if (h.warn <= 0) { h.runT = d.runFor * (0.8 + this.host.rng() * 0.4); this.host.fx('splash', this.bob.x, this.bob.y); } }
      else { h.runIn -= dt; if (h.runIn <= 0) { h.warn = 0.45; this.host.sound('blip'); } }
    }
    const running = h.runT > 0;
    const pull = (tired ? d.pull * 0.4 : d.pull) * this.host.pull();
    if (hold) h.tension += ((0.32 + pull * 0.35) * ease + (running ? pull * 1.6 * ease : 0)) * dt;
    else h.tension += ((running ? pull * 0.35 : 0) - 0.85) * dt;
    h.tension = Math.max(0, h.tension);
    // line in, or line out
    const dx = this.bob.x - s.x, dy = this.bob.y - s.y, dist = Math.hypot(dx, dy) || 1;
    let nd = dist;
    if (running) nd += (hold ? 12 : 38) * dt;
    else if (hold) nd -= 62 * reelK * (0.75 + 0.25 * (1 - d.pull)) * dt;
    if (hold || running) h.stamina -= dt * (running ? 0.6 : 1);
    const wob = running ? 1.6 : h.warn > 0 ? 1 : 0.3;
    this.bob.x = s.x + (dx / dist) * nd + Math.sin(this.t * 9) * wob;
    this.bob.y = s.y + (dy / dist) * nd + Math.cos(this.t * 7) * wob * 0.6;
    if (!this.host.inWater(this.bob.x, this.bob.y) && nd > LAND) {    // keep it in the water: slide along toward the spot
      this.bob.x = s.x + (dx / dist) * Math.max(LAND, nd - 4); this.bob.y = s.y + (dy / dist) * Math.max(LAND, nd - 4);
    }
    if (this.taker) { this.taker.x = this.bob.x; this.taker.y = this.bob.y; }
    if (h.tension >= 1) { this.host.fx('snap', this.bob.x, this.bob.y); this.host.sound('snap'); this.lose(`SNAP! The ${d.name} was too strong for a tight line. Let go when it runs!`); return; }
    if (!hold && h.tension < 0.05) { h.slack += dt; if (h.slack > 1.4) { this.lose(`The line went slack and the ${d.name} spat the hook.`); return; } }
    else h.slack = 0;
    if (nd <= LAND) { this.phase = 'land'; this.t = 0; this.host.say(`It leaps at the rocks! Biscuit, GRAB IT! [E]`); this.host.fx('splash', this.bob.x, this.bob.y); this.host.sound('splash'); }
  }

  private lose(msg: string): void {
    this.host.say(msg);
    if (this.taker) { this.taker.mode = 'flee'; this.taker.t = 0; }
    this.hooked = null; this.taker = null; this.reset();
  }

  private scare(msg: string): void {
    this.host.say(msg);
    if (this.taker) { this.taker.mode = 'flee'; this.taker.t = 0; }
    this.taker = null; this.reset();
  }

  private reset(): void { this.phase = this.spot ? 'ready' : 'off'; this.t = 0; this.charging = false; this.chargeT = 0; this.armed = false; }
}
