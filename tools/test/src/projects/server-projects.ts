import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_SETUP = path.resolve(REPO_ROOT, 'packages/server/tests/utils/setup/unit.ts')
const IT_SETUP = path.resolve(REPO_ROOT, 'packages/server/tests/utils/setup/it.ts')

export const serverProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'server-unit',
      include: ['packages/server/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'packages/server/tests/unit/**/*.duckdb.test.{ts,tsx}'],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'server-it',
      include: ['packages/server/tests/it/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'packages/server/tests/it/**/*.duckdb.test.{ts,tsx}'],
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
      name: 'server-duckdb',
      include: ['packages/server/tests/it/**/*.duckdb.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [IT_SETUP],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  }),
]
