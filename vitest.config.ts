import { allTestProjects } from '@kobato/test/projects/registry'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    silent: 'passed-only',
    projects: allTestProjects,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'apps/kobato/src/**/*.{ts,tsx}',
        'packages/api/src/**/*.{ts,tsx}',
        'packages/db/src/**/*.{ts,tsx}',
        'packages/server/src/**/*.{ts,tsx}',
        'packages/shared/*/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        'packages/db/src/sqlite/schema/**',
        'packages/db/src/sqlite/types/**',
        'apps/kobato/src/routes.ts',
        'apps/kobato/src/entry.client.tsx',
        'apps/kobato/src/entry.server.tsx',
        'apps/kobato/src/root.tsx',
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
