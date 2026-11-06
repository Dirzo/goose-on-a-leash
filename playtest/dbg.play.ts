/** Trace one run: AREA=castle-4 SKILL=novice DIFF=normal SEED=2 LIMIT=300 EVERY=60 (frames) → scratch trace file. */
import { it } from 'vitest';
import { runArea } from './runner';
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined>; memoryUsage(): { heapUsed: number } } }).process;
it('dbg', async () => {
  const fs = await import('node:fs' as string) as { appendFileSync(p: string, s: string): void; writeFileSync(p: string, s: string): void };
  const out = env.env.TRACE ?? 'playtest/results/trace.txt';
  fs.writeFileSync(out, '');
  const t0 = performance.now();
  const r = runArea(env.env.AREA ?? 'reedmarsh-1', (env.env.DIFF ?? 'normal') as never, (env.env.SKILL ?? 'average') as never, +(env.env.SEED ?? 1), { limit: +(env.env.LIMIT ?? 60), trace: (sim, t) => fs.appendFileSync(out, [t.toFixed(0), (env.memoryUsage().heapUsed / 1e6).toFixed(0) + 'MB', ((performance.now() - t0) / 1000).toFixed(1) + 's', Math.round(sim.player.x), Math.round(sim.player.y), 'water', sim.pack.water.toFixed(2), 'holes', sim.pack.holes, sim.goose.state, 'foes', sim.enemies.filter(e => !e.dead && !e.woke).length, sim.room.def.id, sim.room.gateClosed, (globalThis as any).__bot?.branch, sim.enemies.filter(e => !e.dead && !e.woke).map(e => e.kind + ':' + e.mode + ':' + Math.round(e.x) + ',' + Math.round(e.y) + ':' + Math.round(e.hp)).join(' ')].join(' ') + '\n') });
  fs.appendFileSync(out, JSON.stringify({ ...r, log: { ...r.log, stuckAt: r.log.stuckAt.slice(0, 8) } }) + '\n');
});
