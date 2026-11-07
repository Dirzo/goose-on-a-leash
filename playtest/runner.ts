/**
 * Runs the bot through one area of the game the way a player arriving there would: with the kit the room
 * jump gives for that point in the story, a goal (a door, a boss, a seal, a fish), and a time limit.
 * Records what happened.
 */
import { STEP, type Difficulty } from '../src/core/config';
import { Sim, type SimEvent } from '../src/core/sim';
import { ROOMS, type RoomDef } from '../src/data/rooms';
import { INGREDIENTS } from '../src/data/elixir';
import type { TraitId } from '../src/data/traits';
import { Bot, type Skill, type BotLog } from './bot';

export function rank(id: string): number {
  return id === 'willowmere' ? 0 : id.startsWith('reedmarsh-') ? +id.slice(10) : id.startsWith('hollowbark-') ? 10 + +id.slice(11)
    : id.startsWith('driftwood-') ? 20 + +id.slice(10) : id.startsWith('tide-') ? 30 + +id.slice(5) : id.startsWith('castle-') ? 40 + +id.slice(7) : 99;
}
export const AREAS = Object.values(ROOMS).filter(r => rank(r.id) < 99).sort((a, b) => rank(a.id) - rank(b.id)).map(r => r.id);

export interface RunResult {
  area: string; name: string; diff: Difficulty; skill: Skill; seed: number;
  outcome: 'clear' | 'timeout'; time: number; limit: number;
  faints: number; snaps: number; tears: number; splashes: number; minWater: number; endWater: number;
  bossTime?: number; bossHpLeftPct?: number; feral: number; fishCaught: number; fishLost: number;
  log: BotLog; assisted: string[]; activeSec: number; idleSec: number;
  /** Seconds of play wiped out by faints (each faint restarts the area from its door). */
  lost: number;
}

/** The kit a player has on arriving here (mirrors the bench's room jump, plus traits for the feathers found by then). */
function kitFor(sim: Sim, id: string): void {
  const r = rank(id), k = sim.kit;
  if (r >= 3) k.findLeash('braided');
  if (r >= 11) k.oar = true;
  if (r >= 14) k.findLeash('vine');
  if (r >= 22) k.reel = true;
  const traits: TraitId[] = [...(r >= 10 ? ['b1', 'h1'] : []), ...(r >= 20 ? ['b2', 'f1'] : []), ...(r >= 30 ? ['h2', 'z1'] : []), ...(r >= 40 ? ['b3', 'f2'] : [])] as TraitId[];
  for (const t of traits) k.traits.add(t);
  k.bread.stale = 3 + Math.floor(r / 10);
  k.mats.fluff = 2 + Math.floor(r / 15);
  if (r === 41 || r >= 45) for (const s of ['foyer', 'kitchens', 'keep']) k.seals.add(s);
  if (r >= 45) for (const i of INGREDIENTS) if (i.id !== 'tear') k.ingredients.add(i.id);
  if (r >= 46) { k.ingredients.add('tear'); k.elixir = true; }
}

interface Goal { door?: string; seal?: string; boss?: boolean; fish?: 'pearl' | 'shark'; limit: number }
function goalFor(def: RoomDef): Goal {
  const id = def.id;
  if (id === 'tide-2') return { fish: 'pearl', door: 'n', limit: 1500 };
  if (id === 'castle-6') return { fish: 'shark', limit: 900 };
  if (id === 'castle-2') return { seal: 'foyer', limit: 600 };
  if (id === 'castle-3') return { seal: 'kitchens', limit: 600 };
  if (id === 'castle-4') return { seal: 'keep', limit: 720 };
  if (id === 'castle-5') return { boss: true, limit: 600 };
  const fwd = (def.doors ?? []).filter(d => d.to !== 'END' && rank(d.to) > rank(id)).sort((a, b) => (b.gated ? 1 : 0) - (a.gated ? 1 : 0) || rank(b.to) - rank(a.to))[0];
  return { door: fwd?.id, boss: !!def.boss, limit: def.boss ? 600 : 420 };
}

export function runArea(id: string, diff: Difficulty, skill: Skill, seed: number, opts: { limit?: number; trace?: (sim: Sim, t: number) => void; sim?: Sim } = {}): RunResult {
  const def = ROOMS[id]!;
  // chained runs (opts.sim) carry the pack, water and kit over from the area before, as in a real playthrough
  const sim = opts.sim ?? new Sim({ seed: seed * 7919 + rank(id), difficulty: diff });
  sim.castMode = true;
  if (!opts.sim) kitFor(sim, id);
  const goal = goalFor(def);
  if (opts.limit) goal.limit = opts.limit;
  const entry = def.doors?.find(d => d.to !== 'END' && rank(d.to) < rank(id))?.id ?? null;
  if (sim.room.def.id !== id) sim.enterRoom(def, entry, !opts.sim);
  sim.drainEvents();
  const bot = new Bot(sim, skill, seed);
  (globalThis as unknown as { __bot?: Bot }).__bot = bot;
  bot.goal = { door: goal.door, fight: goal.boss || !!goal.seal };
  bot.blockDoors = (def.doors ?? []).filter(d => d.id !== goal.door).map(d => d.id);
  const res: RunResult = { area: id, name: def.name, diff, skill, seed, outcome: 'timeout', time: 0, limit: goal.limit, faints: 0, snaps: 0, tears: 0, splashes: 0,
    minWater: 1, endWater: 1, feral: 0, fishCaught: 0, fishLost: 0, log: bot.log, assisted: [], activeSec: 0, idleSec: 0, lost: 0 };
  let bossStart = -1, done = false, chimeT = 0, attemptStart = 0;
  const steps = Math.round(goal.limit / STEP);
  for (let i = 0; i < steps && !done; i++) {
    const t = i * STEP;
    // fishing goals: walk to the spot (the bot's navigation gets it there), then fish
    let input;
    const spots = def.fishing?.spots ?? [];
    const fishSpot = goal.fish && (goal.fish === 'shark' || sim.room.gateClosed) ? (spots.find(s => s.deep) ?? spots[spots.length - 1]) : undefined;
    if (fishSpot && Math.hypot(fishSpot.x - sim.player.x, fishSpot.y - sim.player.y) < 52 && !bot.grapple && !sim.enemies.some(e => !e.dead && !e.woke && Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < 110)) input = bot.fishFrame(fishSpot);
    else {
      const wz = def.waves?.zone ? def.zones?.find(z => z.name === def.waves!.zone) : undefined;
      bot.goal = fishSpot ? { point: fishSpot } : wz && !sim.waveDone ? { point: { x: wz.x + wz.w / 2, y: wz.y + wz.h / 2 }, fight: true } : { door: goal.door, fight: goal.boss || !!goal.seal };
      input = bot.frame();
    }
    const before = sim.room.def.id;
    sim.step(STEP, input);
    if (Math.hypot(input.moveX, input.moveY) > 0.1 || input.castHold || input.honk || input.yank) res.activeSec += STEP; else res.idleSec += STEP;
    for (const e of sim.drainEvents() as SimEvent[]) {
      if (e.type === 'fx') {
        if (e.kind === 'faint') { res.faints++; res.lost += t - attemptStart; attemptStart = t + 1.2; }
        if (e.kind === 'snap') res.snaps++;
        if (e.kind === 'tear') res.tears++;
        if (e.kind === 'splash' && Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < 60) res.splashes++;
      }
      if (e.type === 'say' && /fish|caught|landed/i.test(e.text) && /SNAP|spat the hook|stole the bait|Too (early|slow)/.test(e.text)) res.fishLost++;
      if (e.type === 'finale') done = true;
      if (e.type === 'hint' && e.id) bot.hints.add(e.id);
      if (e.type === 'say') (globalThis as unknown as { __sayLog?: (t: string, x: number, y: number, tt: number) => void }).__sayLog?.(e.text, sim.player.x, sim.player.y, t);
    }
    if (sim.goose.feral && !res['_f' as keyof RunResult]) { res.feral++; (res as unknown as Record<string, boolean>)._f = true; }
    if (!sim.goose.feral) (res as unknown as Record<string, boolean>)._f = false;
    if (sim.pack.enabled) res.minWater = Math.min(res.minWater, sim.pack.water);
    const boss = sim.enemies.find(e => ['elder', 'heron', 'king', 'gullbeard', 'pelican', 'blackswan', 'queen'].includes(e.kind) && !e.dead && !e.woke);
    if (boss && bossStart < 0 && boss.mode !== 'stalk') bossStart = t;
    // goals
    if (sim.room.def.id !== before && sim.room.def.id !== id) {
      if (goal.door && (def.doors?.find(d => d.id === goal.door)?.to === sim.room.def.id)) { done = true; res.outcome = 'clear'; }
      else { sim.enterRoom(def, entry, true); }      // wandered out the wrong way: walk back in
    }
    if (goal.seal && sim.kit.seals.has(goal.seal)) { done = true; res.outcome = 'clear'; }
    if (goal.boss && !goal.door && sim.world[id]?.boss) { done = true; res.outcome = 'clear'; }
    if (goal.fish === 'shark' && sim.world[id]?.boss) { done = true; res.outcome = 'clear'; }
    if (done && res.outcome !== 'clear') res.outcome = 'clear';
    if (goal.boss && sim.world[id]?.boss && bossStart >= 0 && res.bossTime === undefined) res.bossTime = t - bossStart;
    // the parry chime: give it 3 minutes, then note that the bot couldn't do it and open it (so the rest still gets tested)
    if (def.bell?.parryOnly && sim.room.gateClosed) { chimeT += STEP; if (chimeT > 180) { sim.room.gateClosed = false; res.assisted.push('chime'); } }
    res.time = t;
    if (opts.trace && i % (+((globalThis as unknown as { process: { env: Record<string, string> } }).process.env.EVERY ?? 60)) === 0) opts.trace(sim, t);
  }
  const boss = sim.enemies.find(e => ['elder', 'heron', 'king', 'gullbeard', 'pelican', 'blackswan', 'queen'].includes(e.kind) && !e.dead);
  if (boss && res.outcome !== 'clear') res.bossHpLeftPct = Math.round(boss.hp / boss.max * 100);
  res.endWater = sim.pack.water;
  res.fishCaught = Object.values(sim.kit.fish).reduce((a, f) => a + f.n, 0);
  delete (res as unknown as Record<string, unknown>)._f;
  return res;
}

/** A whole region in one go, water and kit carried from area to area: what a real playthrough feels like. */
export function runChain(ids: string[], diff: Difficulty, skill: Skill, seed: number): RunResult[] {
  const sim = new Sim({ seed: seed * 104729 + rank(ids[0]!), difficulty: diff });
  sim.castMode = true; kitFor(sim, ids[0]!);
  const out: RunResult[] = [];
  for (const id of ids) {
    const r = runArea(id, diff, skill, seed, { sim });
    out.push(r);
    if (r.outcome !== 'clear') break;
  }
  return out;
}
