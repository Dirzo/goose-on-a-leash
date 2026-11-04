// Inline the Vite build into one self-contained HTML file (itch.io uploads, quick sharing).
// Usage: npm run build && node scripts/single-file.mjs [out.html]
//        vite build --mode cdn && node scripts/single-file.mjs --cdn [out.html]   (Phaser loaded from jsDelivr)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const cdn = args.includes('--cdn');
const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js';
const dist = cdn ? 'dist-cdn' : 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/g, (_, p) => `<style>${readFileSync(join(dist, p), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, p) => {
  const js = readFileSync(join(dist, p), 'utf8').replace(/<\/script/gi, '<\\/script');
  const lib = cdn ? `<script src="${PHASER_CDN}"></script>\n` : '';
  return `${lib}<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="icon" href="\.?\/?favicon\.svg"[^>]*>/, () => {
  const svg = readFileSync(join(dist, 'favicon.svg'), 'utf8');
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}">`;
});
const out = args.find(a => !a.startsWith('--')) ?? join(dist, 'goose-on-a-leash.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
