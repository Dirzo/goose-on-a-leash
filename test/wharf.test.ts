/** Driftwood Wharf: crabs that guard, gulls that steal, Pickett's shop and the Spinning Reel, Captain Gullbeard. */
import { describe, expect, it } from 'vitest';
import { C, STEP } from '../src/core/config';
import { Sim, type InputFrame } from '../src/core/sim';
import { applySave, snapshotSave, validateSave } from '../src/core/save';
import { ROOMS } from '../src/data/rooms';
import { LAYOUT } from './helpers';

function wharf(id: string, seed = 3): Sim {
  const sim = new Sim({ seed });
  sim.enterRoom(LAYOUT[id]!, 'w');
  sim.enemies = []; sim.spawnT = 1e9; sim.knightT = -1e9;
  sim.player.inv = 0;
  sim.castMode = true;
  sim.drainEvents();
  return sim;
}
const stand = (sim: Sim, o: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aimX: sim.player.x + 200, aimY: sim.player.y, ...o });
const run = (sim: Sim, s: number, f: () => InputFrame) => { for (let i = 0; i < Math.round(s / STEP); i++) sim.step(STEP, f()); };

describe('Driftwood Wharf critters', () => {
  it('a crab snaps at the pack, then raises its claws: a cast that lands then clacks off', () => {
    const sim = wharf('driftwood-1');
    sim.player.x = 300; sim.player.y = 330;
    const c = sim.mkEnemy('crab', 330, 330); c.cd = 0; sim.enemies.push(c);
    const seen = new Set<string>();
    run(sim, 1.2, () => { seen.add(c.mode); return stand(sim); });
    expect(seen.has('snap')).toBe(true);
    c.mode = 'guard'; c.modeT = 0; c.x = 420; c.y = 330;
    const hp = c.hp;
    sim.goose.state = 'flying'; sim.goose.x = 400; sim.goose.y = 330; sim.goose.vx = 600; sim.goose.vy = 0;
    sim.step(STEP, stand(sim));
    expect(sim.goose.state).not.toBe('latched');
    expect(c.hp).toBe(hp);
  });

  it('a gull dives on the pack, steals bread, and drops it when bitten', () => {
    const sim = wharf('driftwood-2');
    sim.player.x = 300; sim.player.y = 330;
    sim.kit.bread.stale = 1; for (const k of Object.keys(sim.kit.mats) as (keyof typeof sim.kit.mats)[]) sim.kit.mats[k] = 0;
    const g = sim.mkEnemy('gull', 420, 300); g.cd = 0; sim.enemies.push(g);
    let stole = false;
    for (let i = 0; i < 400 && !stole; i++) { sim.step(STEP, stand(sim)); stole = !!g.loot; }
    expect(stole).toBe(true);
    expect(sim.kit.bread.stale).toBe(0);
    expect(g.mode).toBe('escape');
    run(sim, 0.4, () => stand(sim));
    expect(g.air).toBeLessThanOrEqual(30);          // low enough to bite
    sim.damage(g, 0.5);
    expect(g.loot).toBeUndefined();
    expect(sim.kit.bread.stale).toBe(1);
  });

  it('a thief that is left alone gets away with it', () => {
    const sim = wharf('driftwood-2');
    sim.player.x = 300; sim.player.y = 330;
    const g = sim.mkEnemy('gull', 300, 330); g.mode = 'escape'; g.loot = { mat: 'glass', n: 2 }; sim.enemies.push(g);
    run(sim, 5, () => stand(sim));
    expect(g.dead).toBe(true);
  });

  it('a honk makes a low thief drop what it took', () => {
    const sim = wharf('driftwood-2');
    sim.player.x = 300; sim.player.y = 330; sim.goose.x = 280; sim.goose.y = 330;
    const g = sim.mkEnemy('gull', 380, 330); g.mode = 'escape'; g.air = 16; g.loot = { mat: 'glass', n: 2 }; sim.enemies.push(g);
    sim.honk({ x: 500, y: 330 });
    expect(g.loot).toBeUndefined();
    expect(sim.items.filter(i => i.mat === 'glass').length).toBe(2);
  });
});

describe("Pickett's Tackle", () => {
  it('sea glass on the beach is picked up once and remembered', () => {
    const sim = wharf('driftwood-1');
    const gl = LAYOUT['driftwood-1']!.glass![0]!;
    const before = sim.kit.mats.glass;
    sim.player.x = gl.x; sim.player.y = gl.y - 10;
    run(sim, 0.2, () => stand(sim));
    expect(sim.kit.mats.glass).toBe(before + 1);
    run(sim, 0.2, () => stand(sim));
    expect(sim.kit.mats.glass).toBe(before + 1);
  });

  it('honk at the counter opens the shop; the Spinning Reel costs glass and casts further', () => {
    const sim = wharf('driftwood-3');
    const shop = LAYOUT['driftwood-3']!.shop!;
    sim.player.x = shop.x; sim.player.y = shop.y + 40; sim.goose.x = shop.x - 30; sim.goose.y = shop.y + 40;
    sim.honk({ x: shop.x, y: shop.y });
    expect(sim.drainEvents().some(e => e.type === 'shop')).toBe(true);
    sim.kit.mats.glass = 2; sim.kit.mats.chain = 2;
    expect(sim.buy('reel')).toBe(false);
    sim.kit.mats.glass = 6;
    const reach = sim.castMax(), sweet = sim.sweet();
    expect(sim.buy('reel')).toBe(true);
    expect(sim.kit.mats.glass).toBe(0);
    expect(sim.castMax()).toBeGreaterThan(reach * 1.2);
    expect(sim.sweet()).toBeLessThan(sweet);
    expect(sim.buy('reel')).toBe(false);             // only one
  });

  it('the reel and the ingredients survive a save', () => {
    const sim = wharf('driftwood-3');
    sim.kit.reel = true; sim.kit.ingredients.add('salt');
    const s = validateSave(JSON.parse(JSON.stringify(snapshotSave(sim))))!;
    const b = new Sim({ seed: 1 }); applySave(b, s);
    expect(b.kit.reel).toBe(true);
    expect([...b.kit.ingredients]).toEqual(['salt']);
  });
});

describe('Captain Gullbeard', () => {
  function deck(): { sim: Sim; cap: ReturnType<Sim['mkEnemy']> } {
    const sim = new Sim({ seed: 5 });
    sim.enterRoom(ROOMS['driftwood-4']!, 'w');
    sim.castMode = true;
    const cap = sim.enemies.find(e => e.kind === 'gullbeard')!;
    sim.player.inv = 0;
    return { sim, cap };
  }

  it('flies up to a masthead when he sees Rocco, out of reach up there', () => {
    const { sim, cap } = deck();
    sim.player.x = 500; sim.player.y = 400;
    run(sim, 2, () => stand(sim));
    expect(['perch', 'return', 'wind', 'aim', 'swoop', 'call']).toContain(cap.mode);
    if (cap.mode === 'perch') expect(cap.air).toBeGreaterThan(30);
  });

  it('swooping into a fishing line stretched across his path tangles him (and bites hurt double)', () => {
    const { sim, cap } = deck();
    const m = sim.room.def.posts[0]!;
    // Rocco below the mast, Biscuit latched to it: the line runs straight down; the Captain swoops across it
    sim.player.x = m.x; sim.player.y = m.y + 150; sim.castLen = 300;
    sim.goose.state = 'latched'; sim.goose.target = { x: m.x, y: m.y, r: m.r, post: true }; sim.goose.x = m.x; sim.goose.y = m.y + m.r + 9; sim.goose.ox = 0; sim.goose.oy = 1;
    cap.mode = 'swoop'; cap.modeT = 0; cap.x = m.x - 150; cap.y = m.y + 70; cap.tx = m.x + 200; cap.ty = m.y + 70; cap.air = 6; cap.hit = true;
    run(sim, 0.6, () => stand(sim));
    expect(cap.mode).toBe('tangled');
    const hp = cap.hp; sim.damage(cap, 1);
    expect(hp - cap.hp).toBe(2);
  });

  it('without the line he skids to a stop on the deck, grounded and biteable', () => {
    const { sim, cap } = deck();
    sim.player.x = 300; sim.player.y = 560;
    cap.mode = 'swoop'; cap.modeT = 0; cap.x = 500; cap.y = 300; cap.tx = 800; cap.ty = 300; cap.air = 6; cap.hit = true;
    run(sim, 1, () => stand(sim));
    expect(cap.mode).toBe('grounded');
    expect(cap.air).toBe(0);
  });

  it('a bottle batted back at the masthead knocks him down', () => {
    const { sim, cap } = deck();
    cap.mode = 'perch'; cap.air = 140; cap.cd = 99; cap.hx = cap.x; cap.hy = cap.y;
    sim.darts.push({ x0: sim.player.x, y0: sim.player.y, tx: cap.x, ty: cap.y, t: 0, T: 0.3, kind: 'bottle', back: true, at: cap.id });
    run(sim, 0.4, () => stand(sim));
    expect(['fall', 'dazed']).toContain(cap.mode as string);
    run(sim, 0.6, () => stand(sim));
    expect(cap.air).toBe(0);
  });

  it('woken, he gives Rocco the Sea-Glass Salt and opens the way on', () => {
    const { sim, cap } = deck();
    sim.damage(cap, 999);
    expect(cap.woke).toBeGreaterThan(0);
    expect(sim.kit.ingredients.has('salt')).toBe(true);
    expect(sim.room.gateClosed).toBe(false);
    expect(sim.pack.water).toBe(1);
    void C;
  });
});
