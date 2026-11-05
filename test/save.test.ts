import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { ROOMS, WILLOWMERE } from '../src/data/rooms';
import { applySave, decodeSave, encodeSave, snapshotSave, validateSave } from '../src/core/save';

function progressed(): Sim {
  const sim = new Sim({ room: WILLOWMERE, seed: 4 });
  sim.room.gateClosed = false;
  sim.enterRoom(ROOMS['reedmarsh-1']!, 's');
  sim.enterRoom(ROOMS['reedmarsh-2']!, 'w');
  sim.player.hp = 3; sim.pack.holes = 2; sim.pack.water = 0.4;
  sim.kit.mats.fluff = 9; sim.kit.findLeash('braided'); sim.kit.bread.sour = 2;
  return sim;
}

describe('saves', () => {
  it('round-trips through an export code into a fresh game', () => {
    const a = progressed();
    const code = encodeSave(snapshotSave(a));
    expect(code.startsWith('GOOSE1.')).toBe(true);
    const b = new Sim({ room: WILLOWMERE, seed: 9 });
    applySave(b, decodeSave(code)!);
    expect(b.room.def.id).toBe('reedmarsh-2');
    expect(b.entryDoor).toBe('w');
    expect(b.player.x).toBe(ROOMS['reedmarsh-2']!.doors!.find(d => d.id === 'w')!.spawn.x);
    expect(b.player.hp).toBe(3);
    expect(b.pack.holes).toBe(2);
    expect(b.pack.water).toBeCloseTo(0.4, 5);
    expect(b.kit.mats.fluff).toBe(9);
    expect(b.kit.leash).toBe('braided');
    expect(b.kit.bread.sour).toBe(2);
    expect(b.world.willowmere?.gateOpen).toBe(true);   // the hub gate stays open
  });

  it('rejects garbage and unknown rooms, and cleans out-of-range values', () => {
    expect(decodeSave('not a code')).toBeNull();
    expect(validateSave({ v: 1, room: 'atlantis' })).toBeNull();
    const s = validateSave({ v: 1, room: 'reedmarsh-3', door: 'nope', hp: 99, pack: { water: -4, holes: 50 },
      kit: { owned: ['golden', 'fake'], leash: 'fake', mats: { fluff: -3, chain: 1e9 } } })!;
    expect(s.door).toBeNull();
    expect(s.hp).toBe(5);
    expect(s.pack.water).toBeGreaterThan(0);
    expect(s.pack.holes).toBe(3);
    expect(s.kit.owned).toEqual(['mop', 'golden']);
    expect(s.kit.leash).toBe('mop');
    expect(s.kit.mats.fluff).toBe(0);
    expect(s.kit.mats.chain).toBe(9999);
  });
});
