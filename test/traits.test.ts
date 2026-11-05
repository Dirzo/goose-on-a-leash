import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { ROOMS, WILLOWMERE } from '../src/data/rooms';
import { LAYOUT } from './helpers';
import { applySave, decodeSave, encodeSave, snapshotSave } from '../src/core/save';

function hub(): Sim {
  const sim = new Sim({ room: WILLOWMERE, seed: 2 });
  sim.enemies = []; sim.spawnT = 1e9;
  return sim;
}
function toShrine(sim: Sim): void {
  const sh = WILLOWMERE.shrine!;
  sim.player.x = sh.x; sim.player.y = sh.y + 10; sim.step(STEP);
}

describe("Biscuit's traits", () => {
  it('Golden Feathers are picked up once and remembered', () => {
    const sim = hub(), f = WILLOWMERE.feathers![0]!;
    sim.player.x = f.x; sim.player.y = f.y; sim.step(STEP);
    expect(sim.kit.mats.feather).toBe(1);
    sim.restartRoom(); sim.player.x = f.x; sim.player.y = f.y; sim.step(STEP);
    expect(sim.kit.mats.feather).toBe(1);
  });

  it('traits are learned only at the shrine, cost a feather, and go in order', () => {
    const sim = hub(); sim.kit.mats.feather = 3;
    expect(sim.learnTrait('b1')).toBe(false);                 // not at the shrine
    toShrine(sim);
    expect(sim.atShrine).toBe(true);
    expect(sim.learnTrait('b2')).toBe(false);                 // needs Thick Neck first
    expect(sim.learnTrait('b1')).toBe(true);
    expect(sim.learnTrait('b2')).toBe(true);
    expect(sim.kit.mats.feather).toBe(1);
    expect(sim.learnTrait('b1')).toBe(false);                 // already known
  });

  it('every two traits raise Goose Power, so the leash has to keep up', () => {
    const sim = hub(); sim.kit.mats.feather = 4; toShrine(sim);
    const base = sim.power(), gap = sim.gap();
    sim.learnTrait('h1'); expect(sim.power()).toBe(base);
    sim.learnTrait('f1'); expect(sim.power()).toBe(base + 1);
    expect(sim.gap()).toBe(gap + 1);
  });

  it('trait effects apply: Thick Neck bites harder, Big Lungs honks further', () => {
    const sim = hub(); sim.kit.mats.feather = 2;
    const pw = sim.pw();
    toShrine(sim); sim.learnTrait('b1');
    expect(sim.pw()).toBeCloseTo(pw * 1.35, 5);
  });

  it('the shrine announces itself once per visit', () => {
    const sim = hub(); sim.drainEvents();
    toShrine(sim); sim.step(STEP);
    expect(sim.drainEvents().filter(e => e.type === 'shrine').length).toBe(1);
  });

  it('the Heron gives two Golden Feathers', () => {
    const sim = hub(); sim.kit.findLeash('braided'); sim.enterRoom(LAYOUT['reedmarsh-12']!, 'w');
    sim.damage(sim.enemies.find(e => e.kind === 'heron')!, 999);
    expect(sim.kit.mats.feather).toBe(2);
  });

  it('traits survive a save code', () => {
    const sim = hub(); sim.kit.mats.feather = 1; toShrine(sim); sim.learnTrait('z1');
    const b = new Sim({ room: WILLOWMERE, seed: 5 });
    applySave(b, decodeSave(encodeSave(snapshotSave(sim)))!);
    expect(b.kit.has('z1')).toBe(true);
  });
});
