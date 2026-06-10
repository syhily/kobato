import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
})
