/** Ferry travel with the woken Ferryman, and nests knocked down by a batted acorn. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { applySave, decodeSave, encodeSave, snapshotSave } from '../src/core/save';
import { Sim } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';

const visit = (sim: Sim, id: string) => {
  sim.enterRoom(ROOMS[id]!, null);
  const f = sim.room.def.ferry!;
  sim.player.x = f.x; sim.player.y = f.y;
  sim.step(STEP, { moveX: 0, moveY: 0, aimX: f.x + 100, aimY: f.y });
};

describe('the ferry', () => {
  it('has a stop in the hub, at the Ferryman\'s Pool and in Hollowbark, each on dry ground', () => {
    const stops = Object.values(ROOMS).filter(r => r.ferry).map(r => r.id).sort();
    expect(stops).toEqual(['hollowbark-3', 'reedmarsh-5', 'willowmere']);
  });

  it('a visited stop is remembered; honking there with the Ferryman asleep does nothing', () => {
    const sim = new Sim({ seed: 1 });
    visit(sim, 'willowmere');
    expect(sim.kit.ferries.has('willowmere')).toBe(true);
    sim.drainEvents();
    sim.honk({ x: sim.player.x + 100, y: sim.player.y });
    expect(sim.drainEvents().some(e => e.type === 'ferry')).toBe(false);
    expect(sim.ferryTo('willowmere')).toBe(false);
  });

  it('once he is awake, honk at a stop to call him, and sail to any stop you have visited', () => {
    const sim = new Sim({ seed: 1 });
    sim.kit.oar = true;
    visit(sim, 'hollowbark-3');
    visit(sim, 'willowmere');
    sim.drainEvents();
    sim.honk({ x: sim.player.x + 100, y: sim.player.y });
    expect(sim.drainEvents().some(e => e.type === 'ferry')).toBe(true);
    expect(sim.ferryTo('reedmarsh-5')).toBe(false);      // never been to that stop
    expect(sim.ferryTo('hollowbark-3')).toBe(true);
    expect(sim.room.def.id).toBe('hollowbark-3');
    const p = sim.player;
    expect(sim.room.inPit(p.x, p.y, 6)).toBe(false);
    expect(sim.room.collide({ x: p.x, y: p.y, r: p.r })).toBe(false);
    for (let i = 0; i < 30; i++) sim.step(STEP, { moveX: 0, moveY: 0, aimX: p.x + 100, aimY: p.y });
    expect(sim.room.def.id).toBe('hollowbark-3');        // didn't fall in or bounce out
  });

  it('stops and the oar survive a save', () => {
    const sim = new Sim({ seed: 1 });
    sim.kit.oar = true; visit(sim, 'willowmere'); visit(sim, 'reedmarsh-5');
    const fresh = new Sim({ seed: 2 });
    applySave(fresh, decodeSave(encodeSave(snapshotSave(sim)))!);
    expect([...fresh.kit.ferries].sort()).toEqual(['reedmarsh-5', 'willowmere']);
  });
});

describe('nests', () => {
  it('a batted acorn knocks a nest down for what is inside, once', () => {
    const sim = new Sim({ seed: 3 });
    sim.enterRoom(ROOMS['hollowbark-2']!, 'w');
    sim.enemies = []; sim.spawnT = 1e9; sim.kit.oar = true;
    const i = sim.room.def.nests!.findIndex(n => n.drop === 'feather');
    const n = sim.room.def.nests![i]!;
    const f0 = sim.kit.mats.feather;
    sim.darts.push({ x0: n.x - 200, y0: n.y + 100, tx: n.x, ty: n.y, t: 0, T: 0.1, kind: 'acorn', back: true });
    for (let k = 0; k < 12; k++) sim.step(STEP, { moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.nestsDown[i]).toBe(true);
    expect(sim.kit.mats.feather).toBe(f0 + 1);
    sim.darts.push({ x0: n.x - 200, y0: n.y + 100, tx: n.x, ty: n.y, t: 0, T: 0.1, kind: 'acorn', back: true });
    for (let k = 0; k < 12; k++) sim.step(STEP, { moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
    expect(sim.kit.mats.feather).toBe(f0 + 1);
  });

  it('every nest hangs within a parry of somewhere Rocco can stand', () => {
    for (const r of Object.values(ROOMS)) for (const n of r.nests ?? []) {
      const sim = new Sim({ seed: 1 }); sim.enterRoom(r, null);
      let ok = false;
      for (let a = 0; a < 32 && !ok; a++) for (let d = 60; d <= 300 && !ok; d += 20) {
        const x = n.x + Math.cos(a / 5.1) * d, y = n.y + Math.sin(a / 5.1) * d;
        if (x > 30 && y > 30 && x < r.width - 30 && y < r.height - 30 && !sim.room.inPit(x, y, 6) && !sim.room.collide({ x, y, r: 14 })) ok = true;
      }
      expect(ok, `${r.id} nest at ${n.x},${n.y}`).toBe(true);
    }
  });
});
