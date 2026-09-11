import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    silent: 'passed-only',
    // Explicit list — tests/e2e needs a live SEA-booted instance (it is
    // driven by `pnpm run sea:e2e`) and must never join the default run.
    projects: [
      'tests/unit/vitest.config.ts',
      'tests/it/vitest.config.ts',
      'tests/snaps/vitest.config.ts',
      'tests/inkling/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/server/infra/db/schema/**',
        'src/server/infra/db/types/**',
        'src/ui/**',
        // The inkling editor tree is covered by its own vitest project
        // (tests/inkling, jsdom) whose historical thresholds (~56/54/49)
        // sit below the root 60 — excluding it here keeps the root gate
        // measuring only the layers it was calibrated for.
        'src/inkling/**',
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
