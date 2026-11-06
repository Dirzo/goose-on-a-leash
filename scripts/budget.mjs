// Size budgets, checked in CI after `npm run build:cdn`.
// The single-file build has to stay under the 16 MB artifact limit; the JS and any one room image get budgets too,
// so a stray unquantized PNG or a bundling mistake fails the build instead of shipping.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MB = 1024 * 1024;
const BUDGET = { single: 15 * MB, js: 2.2 * MB, image: 1.2 * MB, dist: 16 * MB };
const dist = process.argv[2] ?? 'dist-cdn', assets = join(dist, 'assets');
const fails = [];
// The CDN build inlines every image into the bundle, so there the JS budget is the single-file budget.
if (dist.includes('cdn')) BUDGET.js = BUDGET.single;
const check = (what, size, max) => {
  const ok = size <= max;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${what}: ${(size / MB).toFixed(2)} MB (budget ${(max / MB).toFixed(2)} MB)`);
  if (!ok) fails.push(what);
};
const single = join(dist, 'goose-on-a-leash.html');
if (dist.includes('cdn')) try { check('single-file build', statSync(single).size, BUDGET.single); } catch { fails.push('single-file build missing (run npm run build:cdn)'); }
let total = 0;
for (const f of readdirSync(assets)) {
  const s = statSync(join(assets, f)).size; total += s;
  if (f.endsWith('.js')) check(`js ${f}`, s, BUDGET.js);
  else if (/\.(png|jpe?g|webp)$/.test(f) && s > BUDGET.image) check(`image ${f}`, s, BUDGET.image);
}
check('dist/assets total', total, BUDGET.dist);
if (fails.length) { console.error(`\nOver budget: ${fails.join(', ')}`); process.exit(1); }
