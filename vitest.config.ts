import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: ['tests/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/server/infra/db/schema/**',
        'src/server/infra/db/types/**',
        'src/env.d.ts',
        'src/routes.ts',
        'src/entry.client.tsx',
        'src/entry.server.tsx',
        'src/root.tsx',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
})
