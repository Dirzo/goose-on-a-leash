/** The Ferryman's Oar: guard, parry, brace. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { encodeSave, decodeSave, snapshotSave, applySave } from '../src/core/save';
import { Sim, type InputFrame } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function field(oar = true, room = 'reedmarsh-3'): Sim {
  const sim = new Sim({ seed: 5 });
  sim.enterRoom(LAYOUT[room]!, null);
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.x = 400; sim.player.y = 300; sim.player.inv = 0;
  sim.goose.x = 370; sim.goose.y = 300; sim.goose.state = 'held';
  sim.kit.oar = oar;
  sim.drainEvents();
  return sim;
}
/** Facing right (aim to the right), oar up or not. */
const face = (guard: boolean, ax = 700, ay = 300): InputFrame => ({ moveX: 0, moveY: 0, aimX: ax, aimY: ay, guard });
const steps = (sim: Sim, n: number, f: InputFrame) => { for (let i = 0; i < n; i++) sim.step(STEP, f); };
const hurtState = (sim: Sim) => [sim.pack.water, sim.pack.holes] as const;

describe("the Ferryman's Oar", () => {
  it('does nothing until the Ferryman hands it over', () => {
    const sim = field(false);
    steps(sim, 5, face(true));
    expect(sim.player.guard).toBe(0);
  });

  it('the Heron, woken, gives Rocco his oar', () => {
    const sim = new Sim({ seed: 1 });
    sim.enterRoom(ROOMS['reedmarsh-5']!, 'w');
    const h = sim.enemies.find(e => e.kind === 'heron')!;
    expect(sim.kit.oar).toBe(false);
    sim.damage(h, 999);
    expect(sim.kit.oar).toBe(true);
    expect(sim.drainEvents().some(e => e.type === 'say' && /oar/i.test(e.text))).toBe(true);
  });

  it('blocks a blow from the front: no spill, no tear, and the frog bounces off', () => {
    const sim = field();
    steps(sim, 20, face(true));                          // held long enough: a plain block, not a parry
    const f = sim.mkEnemy('frog', 440, 300); sim.enemies.push(f);
    const before = hurtState(sim);
    sim.hurtPlayer(1, false, f, 'leap');
    expect(hurtState(sim)).toEqual(before);
    expect(f.stun).toBeGreaterThan(0);
    expect(f.vx).toBeGreaterThan(0);                     // knocked away from Rocco
    expect(sim.drainEvents().some(e => e.type === 'fx' && e.kind === 'block')).toBe(true);
  });

  it('does not cover his back: Bimbo is still exposed behind', () => {
    const sim = field();
    steps(sim, 20, face(true));
    const f = sim.mkEnemy('frog', 360, 300); sim.enemies.push(f);
    const before = hurtState(sim);
    sim.hurtPlayer(1, false, f, 'leap');
    expect(hurtState(sim)).not.toEqual(before);
  });

  it('cannot stop the ground bursting open underneath', () => {
    const sim = field();
    steps(sim, 20, face(true));
    const b = sim.mkEnemy('badger', 405, 300); sim.enemies.push(b);
    const before = hurtState(sim);
    sim.hurtPlayer(1, true, b, 'erupt');
    expect(hurtState(sim)).not.toEqual(before);
  });

  it('slows Rocco while it is up', () => {
    const walk = (guard: boolean) => { const sim = field(); steps(sim, 30, { ...face(guard), moveX: 1 }); return sim.player.x - 400; };
    expect(walk(true)).toBeLessThan(walk(false) * 0.65);
  });

  it('a roll drops the guard, and you cannot guard mid-roll', () => {
    const sim = field();
    steps(sim, 5, face(true));
    sim.step(STEP, { ...face(true), roll: true });
    expect(sim.player.guard).toBe(0);
    steps(sim, 5, face(true));
    expect(sim.player.guard).toBe(0);
  });

  it('a plain block stops an acorn but does not bat it back', () => {
    const sim = field();
    steps(sim, 20, face(true));
    const b = sim.packPoint(10);
    sim.darts.push({ x0: 600, y0: 286, tx: b.x, ty: b.y, t: 0.5, T: 0.55, kind: 'acorn' });
    const w = sim.pack.water;
    steps(sim, 6, face(true));
    expect(w - sim.pack.water).toBeLessThan(0.002);       // only the slow seep, no spill
    expect(sim.pack.holes).toBe(0);
    expect(sim.darts.length).toBe(0);
  });

  it('PARRY: raised just as an acorn lands, it is batted back into the squirrel', () => {
    const sim = field();
    const sq = sim.mkEnemy('squirrel', 620, 300); sq.cd = 99; sim.enemies.push(sq);
    const hp = sq.hp;
    steps(sim, 3, face(false));
    const b = sim.packPoint(10);
    sim.darts.push({ x0: sq.x, y0: sq.y - 14, tx: b.x, ty: b.y, t: 0.5, T: 0.55, kind: 'acorn' });
    const w = sim.pack.water;
    steps(sim, 6, face(true, sq.x, sq.y));               // raise it now, aiming at the thrower
    expect(w - sim.pack.water).toBeLessThan(0.002);
    expect(sim.pack.holes).toBe(0);
    expect(sim.darts.some(d => d.back)).toBe(true);
    steps(sim, 30, face(false, sq.x, sq.y));
    expect(sq.hp < hp || sq.woke > 0).toBe(true);
    expect(sq.stun).toBeGreaterThan(0);
  });

  it("a batted acorn rings Woodline's chime and opens the way on; a honk doesn't", () => {
    const sim = new Sim({ seed: 3 });
    sim.enterRoom(ROOMS['hollowbark-1']!, 'w');
    sim.enemies = []; sim.spawnT = 1e9;
    const bell = sim.room.def.bell!;
    expect(bell.parryOnly).toBe(true);
    expect(sim.room.gateClosed).toBe(true);
    sim.player.x = bell.x - 200; sim.player.y = bell.y - 120; sim.kit.oar = true;
    sim.goose.x = sim.player.x - 30; sim.goose.y = sim.player.y; sim.goose.state = 'held';
    sim.honk({ x: bell.x, y: bell.y });
    expect(sim.room.gateClosed).toBe(true);
    steps(sim, 2, face(false, bell.x, bell.y));
    const b = sim.packPoint(10);
    sim.darts.push({ x0: bell.x + 40, y0: bell.y - 160, tx: b.x, ty: b.y, t: 0.5, T: 0.55, kind: 'acorn' });
    steps(sim, 6, face(true, bell.x, bell.y));
    steps(sim, 30, face(false, bell.x, bell.y));
    expect(sim.room.gateClosed).toBe(false);
  });

  it("a parried charge stops the Burrow King dead; his own rock batted back dazes him", () => {
    const sim = field(true, 'hollowbark-8');
    sim.player.x = 500; sim.player.y = 280;               // clear of the thorns
    const k = sim.mkEnemy('king', 560, 280); sim.enemies.push(k);
    steps(sim, 2, face(false, 700, 280));
    k.mode = 'charge'; k.modeT = 0; k.hx = -1; k.hy = 0; k.hit = false;
    sim.step(STEP, face(true, 700, 280));
    sim.player.inv = 0;
    sim.hurtPlayer(1, true, k, 'charge');
    expect(k.mode).toBe('dazed');

    const sim2 = field(true, 'hollowbark-8');
    sim2.player.x = 500; sim2.player.y = 280;
    const k2 = sim2.mkEnemy('king', 720, 280); k2.mode = 'stalk'; k2.cd = 99; sim2.enemies.push(k2);
    steps(sim2, 2, face(false, k2.x, k2.y));
    const b = sim2.packPoint(10);
    sim2.darts.push({ x0: k2.x, y0: k2.y - 30, tx: b.x, ty: b.y, t: 0.7, T: 0.75, kind: 'rock' });
    steps(sim2, 6, face(true, k2.x, k2.y));
    steps(sim2, 30, face(false, k2.x, k2.y));
    expect(k2.mode).toBe('dazed');
  });

  it('braces against a furious goose: he drags Rocco far less while the oar is planted', () => {
    const dragged = (guard: boolean) => {
      const sim = field();
      sim.goose.furious = 5; sim.goose.fury = 100; sim.goose.tug = 0;
      sim.goose.x = 250; sim.goose.y = 300;
      const x0 = sim.player.x;
      steps(sim, 40, face(guard, 700, 300));
      return Math.hypot(sim.player.x - x0, sim.player.y - 300);
    };
    expect(dragged(true)).toBeLessThan(dragged(false) * 0.6);
  });

  it('is kept in the save', () => {
    const sim = field();
    const back = decodeSave(encodeSave(snapshotSave(sim)))!;
    const fresh = new Sim({ seed: 1 });
    applySave(fresh, back);
    expect(fresh.kit.oar).toBe(true);
    expect(C.parryWindow).toBeGreaterThan(0);
  });
});
