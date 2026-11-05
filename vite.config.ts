/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// `--mode cdn` builds a variant that expects Phaser as a global from a CDN script tag
// (used for the claude.ai playable page). The default build bundles Phaser.
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: mode === 'cdn' ? { alias: { phaser: decodeURIComponent(new URL('./src/vendor/phaser-global.ts', import.meta.url).pathname) } } : {},
  build: {
    target: 'es2022',
    outDir: mode === 'cdn' ? 'dist-cdn' : 'dist',
    assetsInlineLimit: mode === 'cdn' ? 100_000_000 : 0,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}));
