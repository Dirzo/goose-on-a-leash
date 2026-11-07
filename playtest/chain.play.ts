/** Whole regions in one go (water and kit carried over), every difficulty and skill → results/chain.jsonl. */
import { it } from 'vitest';
import { runChain } from './runner';
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const REGIONS: Record<string, string[]> = {
  reedmarsh: ['reedmarsh-1', 'reedmarsh-2', 'reedmarsh-3', 'reedmarsh-4', 'reedmarsh-5'],
  hollowbark: ['hollowbark-1', 'hollowbark-2', 'hollowbark-3', 'hollowbark-4'],
  driftwood: ['driftwood-1', 'driftwood-2', 'driftwood-3', 'driftwood-4'],
};
it('chain', async () => {
  const fs = await import('node:fs' as string) as { appendFileSync(p: string, s: string): void; writeFileSync(p: string, s: string): void };
  const out = 'playtest/results/chain.jsonl';
  fs.writeFileSync(out, '');
  const diffs = (env.DIFFS ?? 'story,normal,brutal').split(',') as ('story' | 'normal' | 'brutal')[];
  for (const [region, ids] of Object.entries(REGIONS)) for (const diff of diffs) for (const skill of ['novice', 'average', 'skilled'] as const) for (let seed = 1; seed <= +(env.SEEDS ?? 2); seed++) {
    const rs = runChain(ids, diff, skill, seed);
    fs.appendFileSync(out, JSON.stringify({ region, diff, skill, seed, areas: rs.map(r => ({ area: r.area, outcome: r.outcome, time: Math.round(r.time), faints: r.faints, minWater: +r.minWater.toFixed(2), endWater: +r.endWater.toFixed(2) })) }) + '\n');
  }
});
