import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_SETUP = path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/unit.ts')
const IT_SETUP = path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/it.ts')
const SNAPS_SETUP = path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/snaps.ts')
const TZ_TEST = 'apps/kobato/tests/unit/ui/analytics/time-labels.test.ts'

export const kobatoAppProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-arch',
      include: ['apps/kobato/tests/arch/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-unit',
      pool: 'vmThreads',
      include: ['apps/kobato/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'apps/kobato/tests/unit/**/*.duckdb.test.{ts,tsx}', TZ_TEST],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    plugins: [routeWarmupScriptStubPlugin()],
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-it',
      isolate: true,
      include: ['apps/kobato/tests/it/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'apps/kobato/tests/it/**/*.duckdb.test.{ts,tsx}'],
      setupFiles: [IT_SETUP],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    plugins: [routeWarmupScriptStubPlugin()],
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-duckdb',
      isolate: true,
      include: ['apps/kobato/tests/it/**/*.duckdb.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [IT_SETUP],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-tz-unit',
      pool: 'forks',
      environment: 'happy-dom',
      setupFiles: [UNIT_SETUP],
      include: [TZ_TEST],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    plugins: [routeWarmupScriptStubPlugin()],
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-snaps',
      pool: 'vmThreads',
      include: ['apps/kobato/tests/snaps/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [SNAPS_SETUP],
    },
  }),
]
