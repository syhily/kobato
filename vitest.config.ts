import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/server/db/schema.ts',
        'src/server/db/types/**',
        'src/env.d.ts',
        'src/blog.config.ts',
        'src/routes.ts',
        'src/entry.client.tsx',
        'src/entry.server.tsx',
        'src/root.tsx',
        'src/routes/**/*.tsx',
        'src/assets/**',
        'src/ui/**',
      ],
      thresholds: {
        lines: 70,
        branches: 75,
        functions: 70,
        statements: 70,
      },
    },
  },
})
