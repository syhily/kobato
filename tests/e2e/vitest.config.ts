import { defineConfig } from 'vitest/config'

// True HTTP e2e — runs against a live kobato instance (the SEA binary
// booted by scripts/sea/e2e.ts), never in-process. NOT part of the
// default `pnpm test` run (root vitest.config.ts lists projects
// explicitly); drive it via `pnpm run sea:e2e`, which boots the instance
// and injects the KOBATO_E2E_* env contract.
export default defineConfig({
  // The orchestrator invokes this file via --config from the repo root;
  // without an explicit root the include below would match every test in
  // the repo.
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
