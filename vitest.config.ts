import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    silent: 'passed-only',
    // Explicit list — apps/kobato/tests/e2e needs a live SEA-booted instance
    // (it is driven by `pnpm run sea:e2e`) and must never join the default
    // run; packages/inkling brings its own project config. File-based
    // projects do not inherit this config's test options — each spreads
    // @kobato/test/vitest.base.ts instead (only inline projects extend it).
    projects: [
      'packages/shared/tests/unit/vitest.config.ts',
      'packages/shared/tests/snaps/vitest.config.ts',
      'packages/api/tests/unit/vitest.config.ts',
      'packages/db/tests/unit/vitest.config.ts',
      'packages/db/tests/it/vitest.config.ts',
      'packages/server/tests/unit/vitest.config.ts',
      'packages/server/tests/iso-unit/vitest.config.ts',
      'packages/server/tests/it/vitest.config.ts',
      'packages/server/tests/iso-it/vitest.config.ts',
      'packages/ui/tests/unit/vitest.config.ts',
      'packages/ui/tests/snaps/vitest.config.ts',
      'packages/web/tests/unit/vitest.config.ts',
      'packages/web/tests/snaps/vitest.config.ts',
      'packages/inkling/tests/vitest.config.ts',
      'tools/trace/tests/unit/vitest.config.ts',
      'apps/kobato/tests/unit/vitest.config.ts',
      'apps/kobato/tests/iso-unit/vitest.config.ts',
      'apps/kobato/tests/it/vitest.config.ts',
      'apps/kobato/tests/iso-it/vitest.config.ts',
      'apps/kobato/tests/snaps/vitest.config.ts',
      'apps/kobato/tests/vitest.duckdb.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/*/src/**',
        'packages/shared/*/src/**',
        'packages/web/admin/src/**',
        'packages/web/client/src/**',
        'packages/web/public/src/**',
        'apps/kobato/src/**',
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
