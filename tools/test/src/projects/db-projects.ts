import { isoProject, isoTestGlob } from '@kobato/test/projects/iso-project'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_TREE = 'packages/db/tests/unit'
const IT_TREE = 'packages/db/tests/it'
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
      include: [`${UNIT_TREE}/**/*.test.{ts,tsx}`],
      exclude: [...configDefaults.exclude, `${UNIT_TREE}/**/*.duckdb.test.{ts,tsx}`, isoTestGlob(UNIT_TREE)],
      setupFiles: [UNIT_SETUP],
    },
  }),
  isoProject({ name: 'db-iso-unit', tree: UNIT_TREE, setupFiles: [UNIT_SETUP] }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'db-it',
      include: [`${IT_TREE}/**/*.test.{ts,tsx}`],
      exclude: [...configDefaults.exclude, `${IT_TREE}/**/*.duckdb.test.{ts,tsx}`],
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
      include: [`${IT_TREE}/**/*.duckdb.test.{ts,tsx}`],
      exclude: [...configDefaults.exclude],
      setupFiles: [IT_SETUP],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  }),
]
