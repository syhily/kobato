import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_SETUP = path.resolve(REPO_ROOT, 'packages/db/tests/utils/setup/unit.ts')
const IT_SETUP = path.resolve(REPO_ROOT, 'packages/db/tests/utils/setup/it.ts')

export const dbProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'db-unit',
      include: ['packages/db/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'packages/db/tests/unit/**/*.duckdb.test.{ts,tsx}'],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'db-it',
      include: ['packages/db/tests/it/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'packages/db/tests/it/**/*.duckdb.test.{ts,tsx}'],
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
      name: 'db-duckdb',
      include: ['packages/db/tests/it/**/*.duckdb.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [IT_SETUP],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  }),
]
