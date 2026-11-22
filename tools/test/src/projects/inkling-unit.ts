import type { Plugin } from 'vite'

import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export const INKLING_UNIT_INCLUDE = ['packages/inkling/tests/unit/**/*.test.{js,jsx,ts,tsx}'] as const

const SETUP_FILE = path.resolve(REPO_ROOT, 'packages/inkling/tests/setup.ts')

export function inklingUnitProject(plugins: Array<Plugin | Plugin[]>) {
  return defineConfig({
    root: REPO_ROOT,
    plugins: plugins.flat(),
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'inkling-unit',
      pool: 'vmThreads',
      environment: 'jsdom',
      setupFiles: [SETUP_FILE],
      server: {
        deps: {
          inline: ['@testing-library/jest-dom'],
        },
      },
      include: [...INKLING_UNIT_INCLUDE],
    },
  })
}
