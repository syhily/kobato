import { defineConfig } from 'vitest/config'

// True HTTP e2e — runs against a live kobato instance (SEA binary via
// scripts/sea/e2e.ts), never in-process. Not part of `pnpm test`; drive
// via `pnpm run sea:e2e`, which injects the KOBATO_E2E_* env contract.
export default defineConfig({
  // Without an explicit root, `include` would match every test in the repo.
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    // One shared instance with one shared database — never parallel.
    fileParallelism: false,
  },
})
