/** The dodge roll, and the leash still behaving like a rope while Rocco rolls. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { LAYOUT } from './helpers';

function field(seed = 4): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT['reedmarsh-3']!, null);          // Burrow Field: open dry ground
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.x = 300; sim.player.y = 300; sim.player.inv = 0;
  sim.goose.x = 270; sim.goose.y = 300; sim.goose.state = 'held';
  sim.drainEvents();
  return sim;
}
const right: InputFrame = { moveX: 1, moveY: 0, aimX: 900, aimY: 300 };
const still: InputFrame = { moveX: 0, moveY: 0, aimX: 900, aimY: 300 };
const steps = (sim: Sim, n: number, f: InputFrame) => { for (let i = 0; i < n; i++) sim.step(STEP, f); };

describe('dodge roll', () => {
  it('covers ground fast, then has a short cooldown', () => {
    const sim = field();
    sim.step(STEP, { ...still, moveX: 1, roll: true });
    steps(sim, Math.round(C.rollTime / STEP), still);
    const d = sim.player.x - 300;
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(170);
    expect(sim.player.roll).toBe(0);
    const x = sim.player.x;
    sim.step(STEP, { ...still, moveX: 1, roll: true });   // still cooling down
    expect(sim.player.roll).toBe(0);
    steps(sim, 2, still);
    expect(sim.player.x - x).toBeLessThan(20);
  });

  it('rolls the way Rocco faces when there is no move input', () => {
    const sim = field();
    sim.step(STEP, { ...still, roll: true });
    steps(sim, 10, still);
    expect(sim.player.x).toBeGreaterThan(330);          // facing his aim, to the right
  });

  it('hits in the opening of the roll miss', () => {
    const sim = field();
    sim.step(STEP, { ...right, roll: true });
    const w = sim.pack.water, holes = sim.pack.holes;
    sim.hurtPlayer(1, true, { x: 200, y: 300 }, 'bite');
    expect(sim.pack.water).toBe(w);
    expect(sim.pack.holes).toBe(holes);
    steps(sim, Math.round(C.rollIframes / STEP) + 2, still);
    sim.hurtPlayer(1, true, { x: 200, y: 300 }, 'bite');
    expect(sim.pack.water < w || sim.pack.holes > holes).toBe(true);
  });

  it('sloshes a little water out of the pack, more through tears', () => {
    const a = field(); a.pack.water = 0.8;
    a.step(STEP, { ...right, roll: true });
    const b = field(); b.pack.water = 0.8; b.pack.holes = 2;
    b.step(STEP, { ...right, roll: true });
    expect(a.pack.water).toBeLessThan(0.8);
    expect(0.8 - a.pack.water).toBeLessThan(0.01);
    expect(0.8 - b.pack.water).toBeGreaterThan(0.8 - a.pack.water);
  });

  it('cannot roll while being yanked through the air', () => {
    const sim = field();
    sim.player.air = true; sim.player.pull = { x: 600, y: 300, r: 9, post: true };
    sim.roll(right);
    expect(sim.player.roll).toBe(0);
  });
});

describe('the leash during a roll', () => {
  it('Biscuit at heel gets hauled along, flapping, and is never further than the leash', () => {
    const sim = field();
    sim.step(STEP, { ...right, roll: true });
    expect(sim.goose.drag).toBeGreaterThan(0);
    let maxD = 0;
    for (let i = 0; i < 40; i++) { sim.step(STEP, right); maxD = Math.max(maxD, Math.hypot(sim.goose.x - sim.player.x, sim.goose.y - sim.player.y)); }
    expect(maxD).toBeLessThanOrEqual(sim.leashLen() + 0.5);
  });

  it('latched to a post, rolling away: the rope catches Rocco at full length and ends the roll', () => {
    const sim = field();
    const L = sim.leashLen();
    const post = { x: 300, y: 300, r: 9, post: true as const };
    sim.goose.state = 'latched'; sim.goose.target = post; sim.goose.ox = 1; sim.goose.oy = 0;
    sim.player.x = 300 + L - 40; sim.player.y = 300;
    sim.step(STEP, { ...right, roll: true });
    let caught = false;
    for (let i = 0; i < 30; i++) {
      sim.step(STEP, right);
      expect(Math.hypot(sim.player.x - post.x, sim.player.y - post.y)).toBeLessThanOrEqual(L + 1);
      if (sim.player.roll === 0) { caught = true; break; }
    }
    expect(caught).toBe(true);
    expect(sim.drainEvents().some(e => e.type === 'fx' && e.kind === 'boing')).toBe(true);
  });

  it('latched to a post, rolling across the rope swings Rocco round it instead of stopping him', () => {
    const sim = field();
    const L = sim.leashLen();
    const post = { x: 300, y: 300, r: 9, post: true as const };
    sim.goose.state = 'latched'; sim.goose.target = post; sim.goose.ox = 1; sim.goose.oy = 0;
    sim.player.x = 300 + L - 2; sim.player.y = 300;
    sim.step(STEP, { moveX: 0, moveY: 1, aimX: 900, aimY: 300, roll: true });
    steps(sim, 12, { moveX: 0, moveY: 1, aimX: 900, aimY: 300 });
    expect(sim.player.y).toBeGreaterThan(360);           // went round, along the arc
    expect(Math.hypot(sim.player.x - post.x, sim.player.y - post.y)).toBeLessThanOrEqual(L + 1);
  });

  it('Biscuit biting a frog: rolling away drags the frog along and knocks it off its feet', () => {
    const sim = field();
    const L = sim.leashLen();
    const f = sim.mkEnemy('frog', 300, 300); f.cd = 99; f.hp = f.max = 99; sim.enemies.push(f);
    sim.goose.state = 'latched'; sim.goose.target = f; sim.goose.ox = 1; sim.goose.oy = 0;
    sim.player.x = 300 + L - 20; sim.player.y = 300;
    sim.step(STEP, { ...right, roll: true });
    steps(sim, 15, right);
    expect(f.x).toBeGreaterThan(330);
    expect(f.stun).toBeGreaterThan(0);
  });

  it('a fling reaching the end of the rope tugs Rocco toward Biscuit, harder for a heavier pull', () => {
    const tugOf = (w: number) => {
      const sim = field();
      (sim as unknown as { gooseWeight: () => number }).gooseWeight = () => w;
      sim.fling({ x: 900, y: 300 });
      const x0 = sim.player.x;
      for (let i = 0; i < 60 && sim.goose.state === 'flying'; i++) sim.step(STEP, still);
      return sim.player.x - x0;
    };
    const weak = tugOf(0.15), strong = tugOf(0.6);
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(weak);
  });

  it('a goose stronger than his leash, or furious, wins more of the pull', () => {
    const sim = field();
    const calm = sim.gooseWeight();
    sim.goose.furious = 3;
    expect(sim.gooseWeight()).toBeGreaterThan(calm);
  });

  it('the goose never pulls Rocco off the bank into the water', () => {
    const sim = new Sim({ seed: 2 });
    sim.enterRoom(LAYOUT['reedmarsh-2']!, 'w');           // Mooring Run: shore, then open water
    sim.enemies = []; sim.spawnT = 1e9;
    const room = sim.room;
    // find a dry spot with water just to its right
    let spot: { x: number; y: number } | null = null;
    for (let x = 80; x < 900 && !spot; x += 4) for (let y = 120; y < 500 && !spot; y += 8)
      if (!room.inPit(x, y, -16) && room.inPit(x + 40, y, 0) && !room.collide({ x, y, r: 14 })) spot = { x, y };
    expect(spot).toBeTruthy();
    sim.player.x = spot!.x; sim.player.y = spot!.y;
    sim.goose.x = spot!.x; sim.goose.y = spot!.y; sim.goose.state = 'held';
    sim.goose.furious = 5; sim.goose.fury = 100;
    sim.fling({ x: spot!.x + 600, y: spot!.y });
    steps(sim, 90, { moveX: 0, moveY: 0, aimX: spot!.x + 600, aimY: spot!.y });
    expect(room.inPit(sim.player.x, sim.player.y, 6)).toBe(false);
    expect(sim.drainEvents().some(e => e.type === 'fx' && e.kind === 'splash')).toBe(false);
  });
});
