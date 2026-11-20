import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'api-unit',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    setupFiles: ['@kobato/test/setup/unit.ts'],
  },
})
