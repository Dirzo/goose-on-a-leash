/** The finale: three seals, the Swan Queen, the Moon Elixir, the Blood Shark. */
import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { INGREDIENTS } from '../src/data/elixir';
import { ROOMS } from '../src/data/rooms';

const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };
function at(id: string, door: string | null, seed = 3): Sim { const s = new Sim({ seed }); s.castMode = true; s.enterRoom(ROOMS[id]!, door); s.player.inv = 1e9; s.drainEvents(); return s; }

describe('the finale', () => {
  it('the throne room doors open for three Royal Seals, not fewer', () => {
    const sim = at('castle-1', 's');
    sim.kit.seals = new Set(['foyer', 'kitchens']);
    run(sim, 0.2, () => stand(sim));
    expect(sim.room.gateClosed).toBe(true);
    sim.kit.seals.add('keep');
    run(sim, 0.2, () => stand(sim));
    expect(sim.room.gateClosed).toBe(false);
  });

  it('her song turns Biscuit on Rocco; bread first keeps him sane; a honk cuts it off', () => {
    const sim = at('castle-5', 's');
    const q = sim.enemies.find(e => e.kind === 'queen')!;
    q.mode = 'song'; q.modeT = 0;
    run(sim, 2, () => stand(sim));
    expect(sim.goose.feral).toBe(true);
    const b = at('castle-5', 's'); const q2 = b.enemies.find(e => e.kind === 'queen')!;
    b.kit.bread.stale = 2; q2.mode = 'song'; q2.modeT = 0;
    b.feedBread(); run(b, 2, () => stand(b));
    expect(b.goose.feral).toBe(false);
    const c = at('castle-5', 's'); const q3 = c.enemies.find(e => e.kind === 'queen')!;
    q3.mode = 'song'; q3.modeT = 0; c.goose.x = q3.x - 100; c.goose.y = q3.y; c.goose.honkCd = 0;
    c.honk({ x: q3.x, y: q3.y });
    expect(q3.mode).toBe('glide');
  });

  it('surfacing at the pool edge she can be hauled out with a yank, and then bites do double', () => {
    const sim = at('castle-5', 's');
    const q = sim.enemies.find(e => e.kind === 'queen')!;
    q.mode = 'surface'; q.modeT = 0; q.hit = true;
    sim.goose.state = 'latched'; sim.goose.target = q; sim.rng = () => 0.99;
    sim.yank();
    expect(q.mode).toBe('beached');
    expect(sim.room.inPit(q.x, q.y, 0)).toBe(false);
    const hp = q.hp; sim.damage(q, 2); expect(hp - q.hp).toBe(4);
  });

  it('beaten, she weeps the Tear; with all six ingredients the elixir is brewed and the way to the moat opens', () => {
    const sim = at('castle-5', 's');
    for (const i of INGREDIENTS) if (i.id !== 'tear') sim.kit.ingredients.add(i.id);
    const q = sim.enemies.find(e => e.kind === 'queen')!; q.mode = 'beached';
    sim.damage(q, 999);
    expect(sim.kit.ingredients.has('tear')).toBe(true);
    expect(sim.kit.elixir).toBe(true);
    expect(sim.room.gateClosed).toBe(false);
  });

  it('without every ingredient the door to the moat stays shut', () => {
    const sim = at('castle-5', 's');
    const q = sim.enemies.find(e => e.kind === 'queen')!; q.mode = 'beached';
    sim.damage(q, 999);
    expect(sim.kit.elixir).toBe(false);
    expect(sim.room.gateClosed).toBe(true);
  });

  it('the Blood Moat: the leash is cut, Biscuit fights loose; land the shark three times for the end', () => {
    const sim = at('castle-6', 'w');
    run(sim, 0.2, () => stand(sim));
    expect(sim.goose.state).toBe('loose');
    const host = (sim.fishing as unknown as { host: { bossLanded: () => number; caught: (d: unknown, l: number, f: boolean, g: boolean) => void } }).host;
    expect(host.bossLanded()).toBe(2); expect(host.bossLanded()).toBe(1); expect(host.bossLanded()).toBe(0);
    host.caught({ id: 'bloodshark' }, 900, true, false);
    expect(sim.drainEvents().some(e => e.type === 'finale')).toBe(true);
    run(sim, 0.5, () => stand(sim));
    expect(sim.goose.state === 'returning' || sim.goose.state === 'held').toBe(true);
  });
});
