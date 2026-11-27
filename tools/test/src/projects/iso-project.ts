import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import { configDefaults, defineConfig } from 'vitest/config'

type IsoProjectOptions = {
  name: string
  tree: string
  setupFiles: string[]
  testTimeout?: number
  hookTimeout?: number
}

export function isoTestGlob(tree: string): string {
  return `${tree}/**/*.iso.test.{ts,tsx}`
}

export function isoProject(options: IsoProjectOptions) {
  return defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: options.name,
      isolate: true,
      include: [isoTestGlob(options.tree)],
      exclude: [...configDefaults.exclude],
      setupFiles: options.setupFiles,
      ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
      ...(options.hookTimeout === undefined ? {} : { hookTimeout: options.hookTimeout }),
    },
  })
}
