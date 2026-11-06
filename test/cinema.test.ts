/** The cinematic player and scripts. */
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { applySave, decodeSave, encodeSave, snapshotSave } from '../src/core/save';
import { CINEMATICS, SPEAKERS } from '../src/data/cinematics';
import sprites from '../src/assets/sprites/sprites.json';
import { Cinema } from '../src/view/cinema';

const sim = new Sim({ seed: 1 });
const at = { x: 100, y: 100 };
const runFor = (c: Cinema, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) c.update(1 / 60, sim, at); };

describe('cinematics', () => {
  it('there is a card for each chapter and an entrance and wake-up for each boss', () => {
    for (const id of ['ch1', 'ch2', 'ch3', 'elder-in', 'elder-out', 'heron-in', 'heron-out', 'king-in', 'king-out']) expect(CINEMATICS[id], id).toBeTruthy();
  });

  it('every speaker has a portrait sprite', () => {
    for (const sp of Object.values(SPEAKERS)) expect((sprites as Record<string, unknown>)[sp.strip], sp.strip).toBeTruthy();
  });

  it('plays through: typing finishes on a press, the next press moves on, and it ends by itself if left alone', () => {
    const c = new Cinema(); let ended = '';
    c.onEnd = id => { ended = id; };
    expect(c.play('ch2')).toBe(true);
    runFor(c, 0.9);                                         // fade in
    runFor(c, 2.7);                                         // title card
    const ln = c.state.line!;
    expect(ln.who).toBe('bimbo');
    c.update(1 / 60, sim, at);
    expect(c.state.line!.done).toBe(false);
    c.advance(); expect(c.state.line!.done).toBe(true);
    c.advance(); expect(c.state.line!.who).toBe('rocco');
    runFor(c, 12);
    expect(c.active).toBe(false);
    expect(ended).toBe('ch2');
    runFor(c, 1);
    expect(c.state.bars).toBe(0);
  });

  it('Esc skips the whole thing', () => {
    const c = new Cinema();
    c.play('ch1'); runFor(c, 0.3);
    c.skip();
    expect(c.active).toBe(false);
    expect(c.state.line).toBeNull();
  });

  it('cues sounds and shakes', () => {
    const c = new Cinema(); const cues: unknown[] = [];
    c.onCue = q => cues.push(q);
    c.play('king-in'); runFor(c, 1.3);
    expect(cues.some(q => (q as { sound?: string }).sound === 'growl')).toBe(true);
    expect(cues.some(q => (q as { shake?: number }).shake)).toBe(true);
  });

  it('the save remembers which ones were shown', () => {
    const s = new Sim({ seed: 1 }); s.seen.add('ch1'); s.seen.add('elder-in');
    const f = new Sim({ seed: 2 }); applySave(f, decodeSave(encodeSave(snapshotSave(s)))!);
    expect([...f.seen].sort()).toEqual(['ch1', 'elder-in']);
  });
});
