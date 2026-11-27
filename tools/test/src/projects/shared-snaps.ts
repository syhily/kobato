import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'shared-snaps',
    include: ['packages/shared/*/tests/snaps/**/*.test.{ts,tsx}', 'packages/shared/*/tests/*/snaps/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(REPO_ROOT, 'packages/shared/settings/tests/utils/setup/snaps.ts')],
  },
})
