import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Pure-logic tests (lib/*.test.ts) run in the fast `node` environment;
    // only component tests (*.test.tsx) pay for jsdom. The DOM is the single
    // biggest cost in this suite, so this roughly halves the run.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: [path.resolve(__dirname, './vitest-setup.ts')],
    globals: true,
    include: ['**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
