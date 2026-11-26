import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_SETUP = path.resolve(REPO_ROOT, 'apps/sayaka/tests/utils/setup/unit.ts')
const IT_SETUP = path.resolve(REPO_ROOT, 'apps/sayaka/tests/utils/setup/it.ts')
const SNAPS_SETUP = path.resolve(REPO_ROOT, 'apps/sayaka/tests/utils/setup/snaps.ts')

export const sayakaAppProjects = [
  defineConfig({
    root: REPO_ROOT,
    plugins: [routeWarmupScriptStubPlugin()],
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'sayaka-unit',
      pool: 'vmThreads',
      environment: 'happy-dom',
      include: ['apps/sayaka/tests/unit/**/*.test.{ts,tsx}', 'apps/sayaka/tests/arch/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
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
      name: 'sayaka-it',
      include: ['apps/sayaka/tests/it/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
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
      name: 'sayaka-snaps',
      pool: 'vmThreads',
      environment: 'happy-dom',
      include: ['apps/sayaka/tests/snaps/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [SNAPS_SETUP],
    },
  }),
]
