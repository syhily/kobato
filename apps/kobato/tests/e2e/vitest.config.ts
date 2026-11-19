import { defineConfig } from 'vitest/config'

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
