/** The prologue's fishing: cast, wait, strike, reel. */
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { ROOMS } from '../src/data/rooms';
import { PrologueLogic } from '../src/view/prologue';

const DT = 1 / 60;
function onDock(): { sim: Sim; L: PrologueLogic; pond: { x: number; y: number }; rod: { x: number; y: number } } {
  const sim = new Sim({ seed: 1 });
  sim.enterRoom(ROOMS['willowmere']!, null);
  const dock = sim.room.def.bridges![0]!;
  sim.player.x = dock.x + dock.w - 22; sim.player.y = dock.y + dock.h / 2;
  const L = new PrologueLogic(sim, 3);
  L.phase = 'cast';
  return { sim, L, pond: { x: sim.player.x + 400, y: sim.player.y - 60 }, rod: { x: sim.player.x + 20, y: sim.player.y - 50 } };
}
const frame = (L: PrologueLogic, hold: boolean, press: boolean, release: boolean, aim: { x: number; y: number }, rod: { x: number; y: number }) => L.update(DT, hold, press, release, aim, rod);
function cast(L: PrologueLogic, aim: { x: number; y: number }, rod: { x: number; y: number }, holdFrames = 20) {
  frame(L, true, true, false, aim, rod);
  for (let i = 0; i < holdFrames; i++) frame(L, true, false, false, aim, rod);
  frame(L, false, false, true, aim, rod);
  for (let i = 0; i < 40; i++) frame(L, false, false, false, aim, rod);
}

describe('the prologue', () => {
  it('a cast out over the pond lands in the water and waits for a bite', () => {
    const { L, pond, rod, sim } = onDock();
    cast(L, pond, rod);
    expect(L.phase).toBe('wait');
    expect(sim.room.inPit(L.bob.x, L.bob.y, 0)).toBe(true);
  });

  it('a cast onto the grass has to be redone', () => {
    const { L, rod, sim } = onDock();
    cast(L, { x: sim.player.x - 400, y: sim.player.y + 200 }, rod, 50);
    expect(L.phase).toBe('cast');
  });

  it('striking too early scares it off; waiting for the dip and striking hooks it', () => {
    const a = onDock();
    cast(a.L, a.pond, a.rod);
    frame(a.L, true, true, false, a.pond, a.rod);
    expect(a.L.phase).toBe('cast');
    const b = onDock();
    cast(b.L, b.pond, b.rod);
    for (let i = 0; i < 400 && b.L.phase === 'wait'; i++) frame(b.L, false, false, false, b.pond, b.rod);
    expect(b.L.phase).toBe('bite');
    frame(b.L, true, true, false, b.pond, b.rod);
    expect(b.L.phase).toBe('reel');
  });

  it('missing the bite loses the bait', () => {
    const { L, pond, rod } = onDock();
    cast(L, pond, rod);
    for (let i = 0; i < 600 && L.phase !== 'cast'; i++) frame(L, false, false, false, pond, rod);
    expect(L.phase).toBe('cast');
  });

  it('reeling: holding non-stop snaps the line; keeping the tension in the band lands the fish', () => {
    const hook = () => { const o = onDock(); cast(o.L, o.pond, o.rod); for (let i = 0; i < 400 && o.L.phase === 'wait'; i++) frame(o.L, false, false, false, o.pond, o.rod); frame(o.L, true, true, false, o.pond, o.rod); return o; };
    const a = hook();
    for (let i = 0; i < 60 * 10 && a.L.phase === 'reel'; i++) frame(a.L, true, false, false, a.pond, a.rod);
    expect(a.L.phase).toBe('cast');                    // SNAP
    const b = hook();
    let hold = true;
    for (let i = 0; i < 60 * 30 && b.L.phase === 'reel'; i++) {
      hold = b.L.tension < 0.55 ? true : b.L.tension > 0.65 ? false : hold;   // a careful angler
      frame(b.L, hold, false, false, b.pond, b.rod);
    }
    expect(b.L.phase).toBe('catch');
  });

  it('catching Biscuit: he runs from you, flaps free if grabbed hungry, and is caught while eating bread', () => {
    const { sim, L } = onDock();
    L.startChase();
    const G = L.goose, aimAt = (x: number, y: number) => ({ x, y });
    for (let i = 0; i < 120; i++) L.chase(DT, false, false, aimAt(0, 0));
    // he stays on dry land
    expect(sim.room.inPit(G.x, G.y, 4)).toBe(false);
    // walk up close: he bolts
    sim.player.x = G.x + 30; sim.player.y = G.y;
    const d0 = Math.hypot(G.x - sim.player.x, G.y - sim.player.y);
    for (let i = 0; i < 30; i++) L.chase(DT, false, false, aimAt(0, 0));
    expect(Math.hypot(G.x - sim.player.x, G.y - sim.player.y)).toBeGreaterThan(d0);
    // a grab without bread fails
    sim.player.x = G.x + 20; sim.player.y = G.y;
    L.chase(DT, false, true, aimAt(0, 0));
    expect(L.phase).toBe('chase');
    // toss bread near him, wait for him to settle, walk up and grab
    sim.player.x = G.x + 140; sim.player.y = G.y;
    L.chase(DT, true, false, aimAt(G.x + 40, G.y));
    expect(L.bread).not.toBeNull();
    for (let i = 0; i < 200 && L.goose.eat <= 0; i++) L.chase(DT, false, false, aimAt(0, 0));
    expect(L.goose.eat).toBeGreaterThan(0);
    sim.player.x = G.x + 20; sim.player.y = G.y;
    L.chase(DT, false, true, aimAt(0, 0));
    expect(L.phase).toBe('tied');
  });
});
