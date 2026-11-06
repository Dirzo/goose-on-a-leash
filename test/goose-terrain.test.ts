/** Biscuit flies and trots over low props (rocks, logs, stumps, reeds); walls, hedges and trees stop him. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

const still = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

function flingPast(roomId: string, kind: string): { passed: boolean; prop: { x: number; y: number; w: number; h: number } } {
  const sim = new Sim({ seed: 1 });
  const def = LAYOUT[roomId]!.walls.some(w => (w as { kind?: string }).kind === kind) ? LAYOUT[roomId]!
    : Object.values(LAYOUT).find(r => r.walls.some(w => { const k = w as { kind?: string; x: number; y: number }; return k.kind === kind && k.x > 150 && k.x < r.width - 360; }))!;
  sim.enterRoom(def, null);
  sim.enemies = []; sim.spawnT = 1e9;
  const prop = sim.room.def.walls.find(w => (w as { kind?: string }).kind === kind && w.x > 150 && w.x < sim.room.def.width - 360)!;
  const cy = prop.y + prop.h / 2;
  sim.player.x = prop.x - 90; sim.player.y = cy; sim.goose.x = sim.player.x - 20; sim.goose.y = cy; sim.goose.state = 'held';
  sim.fling({ x: prop.x + prop.w + 200, y: cy });
  let maxX = -1e9;
  for (let i = 0; i < 40; i++) { sim.step(STEP, { ...still, aimX: prop.x + 400, aimY: cy }); maxX = Math.max(maxX, sim.goose.x); }
  return { passed: maxX > prop.x + prop.w + 10, prop };
}

describe('Biscuit and the terrain', () => {
  for (const kind of ['rock', 'log', 'stump']) {
    it(`a fling carries him over a ${kind}`, () => {
      const r = flingPast('reedmarsh-3', kind);
      expect(r.passed, JSON.stringify(r.prop)).toBe(true);
    });
  }

  it('a tree stops him', () => {
    expect(flingPast('hollowbark-1', 'tree').passed).toBe(false);
  });

  it('in Old Snapper\'s wallow a fling goes the full way in every direction from the middle', () => {
    const def = ROOMS['reedmarsh-1']!, z = def.zones!.find(q => q.name === 'Burrow Field')!;
    for (let a = 0; a < 16; a++) {
      const sim = new Sim({ seed: 1 }); sim.enterRoom(def, 's'); sim.enemies = []; sim.spawnT = 1e9;
      const cx = z.x + 300, cy = z.y + 300;
      sim.player.x = cx; sim.player.y = cy; sim.goose.x = cx; sim.goose.y = cy; sim.goose.state = 'held';
      const dx = Math.cos(a * Math.PI / 8), dy = Math.sin(a * Math.PI / 8);
      sim.fling({ x: cx + dx * 300, y: cy + dy * 300 });
      let far = 0;
      for (let i = 0; i < 50; i++) { sim.step(STEP, { ...still, aimX: cx + dx * 300, aimY: cy + dy * 300 }); far = Math.max(far, Math.hypot(sim.goose.x - cx, sim.goose.y - cy)); }
      expect(far, `direction ${a}`).toBeGreaterThan(150);
    }
  });
});
