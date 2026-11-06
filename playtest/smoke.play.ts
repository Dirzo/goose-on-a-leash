import { it } from 'vitest';
import { runArea, AREAS } from './runner';
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
it('smoke', async () => {
  const fs = await import('node:fs' as string) as { appendFileSync(p: string, s: string): void; writeFileSync(p: string, s: string): void };
  const out = env.OUT ?? 'playtest/results/smoke.jsonl';
  fs.writeFileSync(out, '');
  for (const id of (env.AREAS ? env.AREAS.split(',') : AREAS)) {
    const t0 = performance.now();
    const r = runArea(id, (env.DIFF ?? 'normal') as never, (env.SKILL ?? 'average') as never, +(env.SEED ?? 1));
    fs.appendFileSync(out, JSON.stringify({ ...r, log: { ...r.log, stuckAt: r.log.stuckAt.slice(0, 6) }, wall: +((performance.now() - t0) / 1000).toFixed(1) }) + '\n');
  }
});
