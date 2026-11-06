/** The Infinite Basement: floors of critters, getting bigger and nastier; a faint ends the run. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';

function basement(seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(ROOMS.basement!, 'up', true);
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y });
const run = (sim: Sim, s: number) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, stand(sim)); };

describe('the Infinite Basement', () => {
  it('floor 1 crawls out of the drains after a short breather', () => {
    const sim = basement();
    expect(sim.floor).toBe(0);
    run(sim, 3.2);
    expect(sim.floor).toBe(1);
    expect(sim.basementLeft()).toBe(Sim.floorSize(1));
    expect(sim.enemies.every(e => e.kind === 'frog')).toBe(true);
  });

  it('clearing a floor splashes the pack and the next floor is bigger', () => {
    const sim = basement();
    run(sim, 3.2);
    sim.pack.water = 0.5;
    for (const e of sim.enemies) e.dead = true;
    run(sim, 0.1);
    expect(sim.drainEvents().some(e => e.type === 'floor')).toBe(true);
    expect(sim.pack.water).toBeGreaterThan(0.75);
    run(sim, 4.2);
    expect(sim.floor).toBe(2);
    expect(Sim.floorSize(2)).toBeGreaterThan(Sim.floorSize(1));
  });

  it('deep floors bring a nastier mix', () => {
    const kinds = new Set(Sim.BASEMENT_POOL.filter(k => 10 >= k.from).map(k => k.kind));
    expect(kinds.has('fox') && kinds.has('turtle') && kinds.has('bellhop')).toBe(true);
    expect(Sim.floorSize(12)).toBeGreaterThan(10);
  });

  it('a faint ends the run with the floors cleared, and starts over', () => {
    const sim = basement();
    run(sim, 3.2);
    for (const e of sim.enemies) e.dead = true;
    run(sim, 4.5);                                    // floor 2 is up: one floor cleared
    sim.pack.water = 0.001; sim.pack.holes = 3;
    let over: { floor: number } | undefined;
    for (let i = 0; i < 600 && !over; i++) { sim.step(STEP, stand(sim)); over = sim.drainEvents().find(e => e.type === 'basementOver') as { floor: number } | undefined; }
    expect(over?.floor).toBe(1);
    expect(sim.floor).toBe(0);
  });

  it('the stairs lead back up', () => {
    const sim = basement();
    const d = ROOMS.basement!.doors![0]!;
    expect(d.to).toBe('UP');
  });
});
