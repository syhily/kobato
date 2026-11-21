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
    // Directory discovery: each package test tree owns its config files and
    // joins the run by its location (`vitest.config.ts` plus the
    // `vitest.<name>.config.ts` convention for sibling halves like the iso
    // projects and duckdb). apps/kobato/tests/e2e needs a live SEA-booted
    // instance (driven by `pnpm run sea:e2e`) and must never join the default
    // run. File-based projects do not inherit this config's test options —
    // each spreads @kobato/test/vitest.base.ts itself; the four cross-family
    // aggregates (shared-*, web-*) have no single owner tree, so they stay
    // inline imports from @kobato/test/projects (the shared and web
    // umbrellas are deliberately not packages with test trees).
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
        // The inkling editor tree is covered by its own vitest project
        // (packages/inkling/tests, jsdom) whose historical thresholds
        // (~56/54/49) sit below the root 60 — excluding it here keeps the
        // root gate measuring only the layers it was calibrated for.
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
