/** Entranced critters go for Bimbo: flank, telegraph, leap / lash / charge. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { fixRng, LAYOUT } from './helpers';

function field(seed = 5): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT['reedmarsh-3']!, null);            // dry land, no posts
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.x = 300; sim.player.y = 300; sim.player.inv = 0;
  sim.drainEvents();
  return sim;
}
/** Rocco stands still aiming right, so Bimbo (his back) faces left. */
const stand: InputFrame = { moveX: 0, moveY: 0, aimX: 600, aimY: 300 };

describe('critters go for Bimbo', () => {
  it('Rocco faces his aim in world rooms, so Bimbo is on the other side', () => {
    const sim = field();
    sim.step(STEP, stand);
    expect(sim.player.fx).toBeCloseTo(1, 3);
    expect(sim.packPoint(10).x).toBeLessThan(sim.player.x);
  });

  it('a frog circles round toward the pack side before it attacks', () => {
    const sim = field();
    const f = sim.mkEnemy('frog', 420, 300); f.cd = 99; sim.enemies.push(f);   // starts in front of Rocco
    for (let i = 0; i < 150; i++) sim.step(STEP, stand);
    expect(f.x).toBeLessThan(330);                         // worked its way round to his back
  });

  it('winds up with a telegraph aimed at Bimbo, then strikes', () => {
    const sim = field();
    const f = sim.mkEnemy('frog', 240, 300); f.cd = 0; sim.enemies.push(f);
    let wound = false, struck = false;
    for (let i = 0; i < 120 && !struck; i++) {
      sim.step(STEP, stand);
      if (f.mode === 'wind') { wound = true; expect(Math.hypot(f.tx - sim.packPoint(10).x, f.ty - sim.packPoint(10).y)).toBeLessThan(30); }
      if (f.mode === 'leap' || f.mode === 'lash') struck = true;
    }
    expect(wound).toBe(true);
    expect(struck).toBe(true);
  });

  it('frogs do not hurt by just bumping into Rocco', () => {
    const sim = field();
    const f = sim.mkEnemy('frog', 300, 300); f.cd = 99; sim.enemies.push(f);
    for (let i = 0; i < 60; i++) sim.step(STEP, stand);
    expect(sim.pack.water).toBeGreaterThan(0.99);
    expect(sim.pack.holes).toBe(0);
  });

  it('a frog attack eventually lands on an idle Rocco and costs water or tears the pack', () => {
    const sim = field(11);
    for (const [x, y] of [[220, 300], [240, 360], [230, 240]]) { const f = sim.mkEnemy('frog', x!, y!); f.cd = 0.2; sim.enemies.push(f); }
    for (let i = 0; i < 60 * 8; i++) sim.step(STEP, stand);
    expect(sim.pack.water < 0.99 || sim.pack.holes > 0).toBe(true);
  });

  it('hits on the pack side tear more; face-on hits mostly splash, and splash less', () => {
    const back = field(); fixRng(back, 0.3); back.step(STEP, stand);
    back.player.inv = 0; back.hurtPlayer(1, false, { x: back.player.x - 30, y: back.player.y }, 'leap');
    expect(back.pack.holes).toBe(1);                       // 0.3 < 0.25 × 1.7

    const front = field(); fixRng(front, 0.3); front.step(STEP, stand);
    front.player.inv = 0; front.hurtPlayer(1, false, { x: front.player.x + 30, y: front.player.y }, 'leap');
    expect(front.pack.holes).toBe(0);
    expect(1 - front.pack.water).toBeLessThan(C.hitSpill);
  });

  it('a tongue lash slurps a little water and never tears', () => {
    const sim = field(); fixRng(sim, 0);
    sim.step(STEP, stand);
    sim.player.inv = 0; sim.hurtPlayer(1, false, { x: sim.player.x - 40, y: sim.player.y }, 'lash');
    expect(sim.pack.holes).toBe(0);
    expect(sim.pack.water).toBeCloseTo(1 - C.slurpSpill, 2);
  });

  it('Old Snapper rears up, then charges and rams hard', () => {
    const sim = field(7); fixRng(sim, 0.99);
    const s = sim.mkEnemy('snapper', 180, 300); s.cd = 0; sim.enemies.push(s);
    let charged = false;
    for (let i = 0; i < 60 * 4; i++) { sim.step(STEP, stand); if (s.mode === 'charge') charged = true; }
    expect(charged).toBe(true);
    expect(sim.pack.water).toBeLessThan(1 - C.heavySpill + 0.02);
  });

  it('Room 01 pests still just chase and bite on contact', () => {
    const sim = new Sim({ seed: 3 });
    const b = sim.enemies.find(e => e.kind === 'bunny')!;
    sim.enemies = [b]; sim.spawnT = 1e9; sim.knightT = -1e9;
    b.x = sim.player.x + 10; b.y = sim.player.y;
    sim.step(STEP);
    expect(sim.player.hp).toBe(C.maxHp - 1);
  });
});
