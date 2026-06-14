import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
  },
})
