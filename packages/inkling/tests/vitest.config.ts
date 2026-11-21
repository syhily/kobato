import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import svgr from 'vite-plugin-svgr'
import { configDefaults } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const TESTS_ROOT = 'packages/inkling/tests'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(import.meta.dirname, './setup.ts')

const INCLUDE = [
  `${TESTS_ROOT}/unit/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/utils/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/clean-basic-html/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/html-api/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/html-to-lexical/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/html-renderer/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/markdown/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/transforms/**/*.test.{js,jsx,ts,tsx}`,
  `${TESTS_ROOT}/nodes-base/**/*.test.{js,jsx,ts,tsx}`,
]

export const inklingUnitProjects = [
  {
    plugins: [svgr(), react({ compiler: true })],
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
      include: INCLUDE,
      exclude: [...configDefaults.exclude, ...MOCK_FILES],
    },
  },
  {
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
  },
]
