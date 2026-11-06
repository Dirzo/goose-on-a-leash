/** The playtest matrix for one difficulty: every area, three skill levels, several seeds. Writes playtest/results/brutal.jsonl. */
import { it } from 'vitest';
import { runArea, AREAS } from './runner';
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
it('brutal', async () => {
  const fs = await import('node:fs' as string) as { appendFileSync(p: string, s: string): void; writeFileSync(p: string, s: string): void };
  const out = 'playtest/results/brutal.jsonl';
  fs.writeFileSync(out, '');
  const seeds = +(env.SEEDS ?? 3);
  for (const id of AREAS) for (const skill of ['novice', 'average', 'skilled'] as const) for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const r = runArea(id, 'brutal', skill, seed);
    fs.appendFileSync(out, JSON.stringify({ ...r, log: { ...r.log, stuckAt: r.log.stuckAt.slice(0, 6) }, wall: +((performance.now() - t0) / 1000).toFixed(1) }) + '\n');
  }
});
