/** Backpack upgrades: weave a line (Rocco), bake a bread (Biscuit), sew a patch (Bimbo). */
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { snapshotSave, validateSave } from '../src/core/save';
import { ROOMS } from '../src/data/rooms';
import { TRACKS } from '../src/data/upgrades';
import { LAYOUT } from './helpers';

function sim(): Sim { const s = new Sim({ seed: 1 }); s.castMode = true; s.enterRoom(LAYOUT['reedmarsh-2']!, 'w'); return s; }

describe('backpack upgrades', () => {
  it('needs the supplies, spends them, and raises the tier', () => {
    const s = sim();
    s.kit.mats.mop = 0;
    expect(s.canUpgrade('line')).toBe(false);
    expect(s.upgrade('line')).toBe(false);
    s.kit.mats.mop = 3; s.kit.mats.fluff = 2;
    expect(s.upgrade('line')).toBe(true);
    expect(s.kit.up.line).toBe(1);
    expect(s.kit.mats.mop).toBe(0);
    expect(s.kit.mats.fluff).toBe(0);
  });
  it('each track does what it says', () => {
    const s = sim(), reach = s.castMax(), bite = s.pw(), leak = s.leakRate();
    s.kit.up = { line: 2, bread: 2, patch: 2 };
    expect(s.castMax()).toBeCloseTo(reach * 1.2, 5);
    expect(s.pw()).toBeCloseTo(bite * 1.3, 5);
    expect(s.leakRate()).toBeCloseTo(leak * 0.7, 5);
  });
  it('patches use sewing-kit needles', () => {
    const s = sim();
    s.kit.mats.fluff = 9; s.pack.needles = 1;
    expect(s.canUpgrade('patch')).toBe(false);
    s.pack.needles = 2;
    expect(s.upgrade('patch')).toBe(true);
    expect(s.pack.needles).toBe(0);
  });
  it('three tiers a track, then no more', () => {
    const s = sim();
    for (const t of Object.values(TRACKS)) for (const tier of t.tiers) for (const [id, n] of Object.entries(tier.cost)) s.kit.mats[id as never] = (s.kit.mats[id as never] ?? 0) + n! as never;
    s.pack.needles = 99;
    for (let i = 0; i < 3; i++) { expect(s.upgrade('bread')).toBe(true); }
    expect(s.upgrade('bread')).toBe(false);
    expect(s.nextUpgrade('bread')).toBeNull();
  });
  it('upgrades are saved', () => {
    const s = sim(); s.kit.up = { line: 1, bread: 2, patch: 3 };
    const raw = JSON.parse(JSON.stringify(snapshotSave(s))); raw.room = Object.keys(ROOMS)[0]; raw.door = null;
    expect(validateSave(raw)!.kit.up).toEqual({ line: 1, bread: 2, patch: 3 });
  });
});
