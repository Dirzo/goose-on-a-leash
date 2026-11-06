/** Moonlit Cove: casting, nibbles and bites, the reel fight, Biscuit's grab, the fish ladder, the Moray Twins; eels. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { FISH, fishById, type Shadow } from '../src/core/fishing';
import { Sim, type InputFrame } from '../src/core/sim';
import { applySave, snapshotSave, validateSave } from '../src/core/save';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function cove(seed = 4): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT['tide-3']!, 'w');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.castMode = true; sim.player.inv = 99;
  sim.drainEvents();
  return sim;
}
const spot = (sim: Sim, i = 0) => sim.room.def.fishing!.spots[i]!;
const frame = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 300, aimY: sim.player.y, ...o });
const stepN = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

/** Stand on a spot with a fish of this kind sitting 200 out, where a cast of the right power toward `aim` lands. */
const OUT = 200;
function setUp(sim: Sim, id: string, i = 0): { aim: { x: number; y: number } } {
  const s = spot(sim, i);
  sim.player.x = s.x; sim.player.y = s.y; sim.goose.x = s.x - 30; sim.goose.y = s.y;
  stepN(sim, 0.1, () => frame(sim));
  const target = { x: s.x + OUT, y: s.y - 20 };
  const f = sim.fishing;
  f.shadows = [{ id: 999, def: fishById(id), x: target.x, y: target.y, tx: target.x, ty: target.y, mode: 'swim', t: 0 } as Shadow];
  (f as unknown as { pick: () => null }).pick = () => null;
  return { aim: { x: s.x + 1000, y: s.y - 20 } };
}

/** Wind up just enough to land the bobber OUT along the aim, and release. */
function castOut(sim: Sim, aim: { x: number; y: number }) {
  let pw = 0.1; while (sim.castReach(pw) < OUT) pw += 0.01;
  while (sim.fishing.charge() < pw) sim.step(STEP, frame(sim, { aimX: aim.x, aimY: aim.y, castHold: true }));
  sim.step(STEP, frame(sim, { aimX: aim.x, aimY: aim.y }));
}

/** A sensible angler: strike on the bite, reel unless it's running or the line is tight, grab at the shore. */
function fight(sim: Sim, aim: { x: number; y: number }, secs = 40): string[] {
  const f = sim.fishing, seen: string[] = [];
  let struck = false;
  for (let i = 0; i < Math.round(secs / STEP); i++) {
    if (seen[seen.length - 1] !== f.phase) seen.push(f.phase);
    let hold = false, yank = false;
    if (f.phase === 'bite' && !struck) { hold = true; struck = true; }
    else if (f.phase === 'reel') { struck = false; const h = f.hooked!; hold = h.runT <= 0 && h.warn <= 0 && h.tension < 0.75; }
    else if (f.phase === 'land') yank = f.t > 0.2;
    sim.step(STEP, frame(sim, { aimX: aim.x, aimY: aim.y, castHold: hold, yank }));
    if (f.phase === 'caught' && !f.hooked) { seen.push('caught'); break; }
  }
  return seen;
}

describe('fishing', () => {
  it('standing on a spot readies the rod; Biscuit stays at heel and casting throws the bobber, not him', () => {
    const sim = cove();
    const { aim } = setUp(sim, 'sprat');
    expect(sim.fishing.phase).toBe('ready');
    castOut(sim, aim);
    expect(sim.fishing.phase).toBe('fly');
    expect(sim.goose.state).toBe('held');
    stepN(sim, 0.7, () => frame(sim));
    expect(sim.fishing.phase).toBe('wait');
  });

  it('a whole catch: bite, strike, reel through its runs, Biscuit grabs it at the shore', () => {
    const sim = cove();
    const { aim } = setUp(sim, 'sprat');
    const glass = sim.kit.mats.glass;
    castOut(sim, aim);
    const seen = fight(sim, aim);
    expect(seen.join(',')).toContain('reel,land');
    expect(seen).toContain('caught');
    expect(sim.kit.fish.sprat?.n).toBe(1);
    expect(sim.kit.mats.glass - glass).toBe(fishById('sprat').glass * (sim.fishing.card?.giant ? 2 : 1));
  });

  it('striking at a nibble scares it off', () => {
    const sim = cove();
    const { aim } = setUp(sim, 'sprat');
    castOut(sim, aim);
    stepN(sim, 0.7, () => frame(sim));
    sim.step(STEP, frame(sim, { castHold: true }));
    expect(sim.fishing.phase).toBe('ready');
    expect(sim.fishing.shadows[0]!.mode).toBe('flee');
  });

  it('holding on through every run snaps the line', () => {
    const sim = cove();
    const { aim } = setUp(sim, 'bass');
    castOut(sim, aim);
    let snapped = false;
    for (let i = 0; i < 60 * 30 && !snapped; i++) {
      const f = sim.fishing, hold = f.phase === 'bite' || f.phase === 'reel';
      sim.step(STEP, frame(sim, { aimX: aim.x, aimY: aim.y, castHold: hold && !(f.phase === 'bite' && f.t < 0.05) }));
      snapped = sim.drainEvents().some(e => e.type === 'say' && e.text.startsWith('SNAP!'));
    }
    expect(snapped).toBe(true);
    expect(sim.kit.fish.bass).toBeUndefined();
  });

  it('the ladder: shallow fish first; each tier caught brings the next one in; morays only after a grouper, in the trench', () => {
    const sim = cove();
    const tiers = () => new Set(sim.fishing.shadows.map(s => s.def.tier));
    stepN(sim, 6, () => frame(sim));
    expect(Math.max(...tiers())).toBeLessThanOrEqual(2);
    expect(sim.fishing.shadows.length).toBeGreaterThan(5);
    sim.kit.fish = { sprat: { n: 1, best: 10 }, mackerel: { n: 1, best: 30 }, bass: { n: 1, best: 50 }, grouper: { n: 1, best: 90 } };
    sim.fishing.shadows = [];
    stepN(sim, 8, () => frame(sim));
    const morays = sim.fishing.shadows.filter(s => s.def.id === 'moray');
    const t = sim.room.def.fishing!.trench!;
    expect(morays.length).toBe(2);
    for (const m of morays) expect(m.x >= t.x && m.x <= t.x + t.w && m.y >= t.y && m.y <= t.y + t.h).toBe(true);
    expect(sim.fishing.shadows.some(s => s.def.id === 'moonfish')).toBe(false);   // not before the pearl
  });

  it('there are lots of fish: commons, rares, legendaries and junk across five tiers, each with a fact', () => {
    expect(FISH.length).toBeGreaterThanOrEqual(25);
    for (const r of ['common', 'uncommon', 'rare', 'legendary', 'junk']) expect(FISH.some(f => f.rarity === r)).toBe(true);
    expect(new Set(FISH.map(f => f.tier))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(new Set(FISH.map(f => f.id)).size).toBe(FISH.length);
  });

  it('every five new species in the journal gives a Golden Feather', () => {
    const sim = cove();
    const ids = FISH.filter(f => f.id !== 'moray').slice(0, 5).map(f => f.id);
    const feathers = sim.kit.mats.feather;
    for (const id of ids) (sim as unknown as { caughtFish: (d: unknown, l: number, f: boolean, g: boolean) => void }).caughtFish(fishById(id), 10, true, false);
    expect(sim.kit.mats.feather).toBe(feathers + 1 + (ids.includes('chest') ? 1 : 0));
  });

  it('the Moray Twins: land one and the other takes the line; both give the Moray Pearl and open the way', () => {
    const sim = cove(9);
    sim.kit.fish = { sprat: { n: 1, best: 10 }, mackerel: { n: 1, best: 30 }, bass: { n: 1, best: 50 }, grouper: { n: 1, best: 90 } };
    sim.kit.reel = true;
    const { aim } = setUp(sim, 'moray', 2);
    castOut(sim, aim);
    let pearl = false;
    for (let tries = 0; tries < 6 && !pearl; tries++) {
      fight(sim, aim, 60);
      pearl = sim.kit.ingredients.has('pearl');
      if (!pearl && sim.fishing.phase === 'ready') { setUp(sim, 'moray', 2); castOut(sim, aim); }
    }
    expect(sim.kit.fish.moray?.n).toBeGreaterThanOrEqual(2);
    expect(pearl).toBe(true);
    expect(sim.room.gateClosed).toBe(false);
  });

  it('the journal survives a save', () => {
    const sim = new Sim({ seed: 1 }); sim.enterRoom(ROOMS['tide-2']!, 'w');
    sim.kit.fish = { sprat: { n: 3, best: 13 } };
    const b = new Sim({ seed: 1 }); applySave(b, validateSave(JSON.parse(JSON.stringify(snapshotSave(sim))))!);
    expect(b.kit.fish).toEqual({ sprat: { n: 3, best: 13 } });
  });

});

describe('eels', () => {
  it('hides out of reach, lunges at the pack, and a yank while Biscuit holds on beaches it', () => {
    const sim = new Sim({ seed: 3 });
    sim.enterRoom(LAYOUT['tide-1']!, 'w');
    sim.castMode = true; sim.spawnT = 1e9;
    const e = sim.enemies.find(o => o.kind === 'eel')!;
    sim.enemies = [e];
    stepN(sim, 0.2, () => frame(sim));
    expect(e.air).toBeGreaterThan(30);                 // under the water
    sim.player.x = e.x - 80; sim.player.y = e.y; sim.player.inv = 0;
    const w = sim.pack.water, holes = sim.pack.holes;
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { sim.step(STEP, frame(sim)); up = e.mode === 'up'; }
    expect(up).toBe(true);
    expect(sim.pack.water < w || sim.pack.holes > holes || sim.player.inv > 0).toBe(true);
    sim.goose.state = 'latched'; sim.goose.target = e; sim.goose.ox = -1; sim.goose.oy = 0;
    sim.rng = () => 0.99;
    sim.yank();
    stepN(sim, 0.6, () => frame(sim));
    expect(e.mode).toBe('beached');
  });
});

describe('the Tide Caves', () => {
  it('the cove is reached from the Rusty Gull, and its way out is shut until the twins are landed', () => {
    expect(ROOMS['driftwood-4']!.doors!.find(d => d.id === 'e')!.to).toBe('tide-1');
    expect(ROOMS['tide-2']!.gate).toBeTruthy();
  });
});
