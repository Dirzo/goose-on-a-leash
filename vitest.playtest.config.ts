/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
// The playtest bot: `npx vitest run -c vitest.playtest.config.ts` (not part of `npm test`; it takes minutes).
export default defineConfig({ test: { include: ['playtest/**/*.play.ts'], environment: 'node', testTimeout: 3_600_000, fileParallelism: true } });
