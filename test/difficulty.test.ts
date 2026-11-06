/** Difficulty: tougher bosses, quicker critters, harder hits, fiercer fish. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim } from '../src/core/sim';
import { LAYOUT } from './helpers';

const at = (d: 'classic' | 'story' | 'normal' | 'brutal') => { const s = new Sim({ seed: 2 }); s.difficulty = d; s.enterRoom(LAYOUT['hollowbark-4']!, 'w'); s.enemies = []; s.spawnT = 1e9; return s; };

describe('difficulty', () => {
  it('bosses have more health on Normal and Brutal, less on Story', () => {
    const hp = (d: 'classic' | 'story' | 'normal' | 'brutal') => at(d).mkEnemy('king', 0, 0).max;
    expect(hp('story')).toBeLessThan(hp('classic'));
    expect(hp('normal')).toBeGreaterThan(hp('classic'));
    expect(hp('brutal')).toBeGreaterThan(hp('normal'));
  });

  it('critters wind up faster on Brutal', () => {
    const firstThrow = (d: 'classic' | 'brutal') => {
      const s = at(d); s.player.x = 300; s.player.y = 320;
      const q = s.mkEnemy('squirrel', 140, 330); q.cd = 0.8; s.enemies.push(q);
      for (let i = 0; i < 600; i++) { s.step(STEP, { moveX: 0, moveY: 0, aimX: 500, aimY: 320 }); if (s.darts.length) return i; }
      return 999;
    };
    expect(firstThrow('brutal')).toBeLessThan(firstThrow('classic'));
  });

  it('hits spill more water on Normal than Story', () => {
    const spill = (d: 'story' | 'normal') => { const s = at(d); s.rng = () => 0.99; s.player.inv = 0; const w = s.pack.water; s.hurtPlayer(1, true); return w - s.pack.water; };
    expect(spill('normal')).toBeGreaterThan(spill('story') * 1.5);
  });
});
