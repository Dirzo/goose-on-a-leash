/** Rerun a few areas across every difficulty and skill (after a fix); writes playtest/results/rerun.jsonl. */
import { it } from 'vitest';
import { runArea } from './runner';
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
it('rerun', async () => {
  const fs = await import('node:fs' as string) as { appendFileSync(p: string, s: string): void; writeFileSync(p: string, s: string): void };
  const out = 'playtest/results/rerun.jsonl';
  fs.writeFileSync(out, '');
  for (const id of (env.AREAS ?? '').split(',').filter(Boolean)) for (const diff of ['story', 'normal', 'brutal'] as const) for (const skill of ['novice', 'average', 'skilled'] as const) for (let seed = 1; seed <= 3; seed++) {
    const r = runArea(id, diff, skill, seed);
    fs.appendFileSync(out, JSON.stringify({ ...r, log: { ...r.log, stuckAt: r.log.stuckAt.slice(0, 6) } }) + '\n');
  }
});
