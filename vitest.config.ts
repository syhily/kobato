import sharedSnapsProject from '@kobato/test/projects/shared-snaps'
import sharedUnitProject from '@kobato/test/projects/shared-unit'
import webSnapsProject from '@kobato/test/projects/web-snaps'
import { webUnitProjects } from '@kobato/test/projects/web-unit'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    silent: 'passed-only',
    projects: [
      sharedUnitProject,
      sharedSnapsProject,
      webSnapsProject,
      ...webUnitProjects,
      'apps/*/tests/**/vitest*.config.ts',
      '!apps/kobato/tests/e2e/**',
      'packages/*/tests/**/vitest*.config.ts',
      'tools/*/tests/**/vitest*.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'packages/shared/*/src/**/*.{ts,tsx}',
        'packages/web/admin/src/**/*.{ts,tsx}',
        'packages/web/client/src/**/*.{ts,tsx}',
        'packages/web/public/src/**/*.{ts,tsx}',
        'apps/kobato/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'packages/*/src/**/*.d.ts',
        'apps/kobato/src/**/*.d.ts',
        'packages/db/src/schema/**',
        'packages/db/src/types/**',
        'packages/ui/src/**',
        'packages/web/admin/src/ui/**',
        'packages/web/public/src/ui/**',
        'packages/inkling/**',
        'apps/kobato/src/env.d.ts',
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
