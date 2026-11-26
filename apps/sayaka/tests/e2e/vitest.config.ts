import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
