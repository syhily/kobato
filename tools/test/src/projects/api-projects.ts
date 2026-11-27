import { isoProject, isoTestGlob } from '@kobato/test/projects/iso-project'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_TREE = 'packages/api/tests/unit'
const UNIT_SETUP = '@kobato/test/setup/node'

export const apiProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'api-unit',
      include: [`${UNIT_TREE}/**/*.test.{ts,tsx}`],
      exclude: [...configDefaults.exclude, isoTestGlob(UNIT_TREE)],
      setupFiles: [UNIT_SETUP],
    },
  }),
  isoProject({ name: 'api-iso-unit', tree: UNIT_TREE, setupFiles: [UNIT_SETUP] }),
]
