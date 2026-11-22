import type { Plugin } from 'vite'

import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import { defineConfig } from 'vitest/config'

export const DEMO_UNIT_INCLUDE = ['apps/inkling-demo/tests/unit/**/*.test.{ts,tsx}'] as const

export function demoUnitProject(plugins: Array<Plugin | Plugin[]>) {
  return defineConfig({
    root: REPO_ROOT,
    plugins: plugins.flat(),
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'demo-unit',
      pool: 'vmThreads',
      environment: 'jsdom',
      setupFiles: ['@kobato/test/setup/dom'],
      include: [...DEMO_UNIT_INCLUDE],
    },
  })
}
