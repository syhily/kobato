import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import svgr from 'vite-plugin-svgr'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(import.meta.dirname, './setup.ts')

export default defineConfig({
  root: REPO_ROOT,
  plugins: [svgr(), react({ compiler: true })],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'inkling-iso-unit',
    isolate: true,
    pool: 'vmThreads',
    environment: 'jsdom',
    setupFiles: [SETUP_FILE],
    server: {
      deps: {
        inline: ['@testing-library/jest-dom'],
      },
    },
    include: [...MOCK_FILES],
    exclude: [...configDefaults.exclude],
  },
})
