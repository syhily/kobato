import { defineConfig } from 'vitest/config'

// Monorepo test aggregation. Tests moved with their packages
// (`packages/*/tests/{unit,it,snaps}`) and apps (`apps/*/tests/...`);
// shared facilities live in `packages/test-utils/tests/`. The projects
// below are file-based configs under `vitest/`:
//
//   unit.config.ts        name `unit|it|snaps`        — repository-level
//                         guards (under the owning module) + package tests
//   unit.core.config.ts   name `unit-core|it-core|snaps-core` — core-app
//                         tests (`@/` → apps/core/src)
//   unit.public.config.ts name `unit-public|it-public|snaps-public` —
//                         public-app tests (`@/` → apps/public/src)
//
// Per-app configs are needed because `@/` resolves per app and Vite's
// native tsconfig paths resolution only applies to files under a config
// file's directory (explicit `resolve.alias` entries in each project).
// Inline project objects cannot be used: `define` (the `__APP_*__`
// compile-time globals) is dropped from the test module graph for inline
// projects in vitest 4.1.10, while file-based projects apply it.
export default defineConfig({
  test: {
    silent: 'passed-only',
    // Explicit list — tests/e2e needs a live SEA-booted instance (it is
    // driven by `pnpm run sea:e2e`) and must never join the default run.
    projects: [
      'vitest/vitest.config.unit.ts',
      'vitest/vitest.config.unit.core.ts',
      'vitest/vitest.config.unit.public.ts',
      'vitest/vitest.config.it.ts',
      'vitest/vitest.config.it.core.ts',
      'vitest/vitest.config.it.public.ts',
      'vitest/vitest.config.snaps.ts',
      'vitest/vitest.config.snaps.core.ts',
      'vitest/vitest.config.snaps.public.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        'packages/server/src/infra/db/schema/**',
        'packages/server/src/infra/db/types/**',
        'packages/ui/**',
        'apps/**/src/env.d.ts',
        'apps/**/src/virtual-modules.d.ts',
        'apps/**/src/routes.ts',
        'apps/**/src/entry.client.tsx',
        'apps/**/src/entry.server.tsx',
        'apps/**/src/root.tsx',
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
