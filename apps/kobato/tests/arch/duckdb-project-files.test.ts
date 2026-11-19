import { DUCKDB_TEST_FILES } from '@kobato/test/duckdb-files.ts'
import duckdbConfig from '@tests/vitest.duckdb.config.ts'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const ENGINE_MARKERS = [
  'createTestAnalyticsDb',
  'openAnalyticsDatabase',
  'closeTestAnalyticsDb',
  'closeAnalyticsDatabase',
  'DuckDBInstance',
  '__adoptAnalyticsHandleForTests',
  'initAnalyticsDatabase(',
]

const TEST_TREES = [
  'apps/kobato/tests/it',
  'apps/kobato/tests/unit',
  'packages/db/tests/it',
  'packages/db/tests/unit',
  'packages/server/tests/it',
  'packages/server/tests/unit',
] as const

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...walk(fullPath))
    } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

function fullyMocksDuckdbModule(source: string): boolean {
  return source.includes(`vi.mock('@kobato/db/duckdb/database.ts'`) && !source.includes('importOriginal')
}

describe('duckdb project membership', () => {
  it('lists every test file that touches the real DuckDB engine — and only those', () => {
    const actual: string[] = []
    for (const tree of TEST_TREES) {
      for (const filePath of walk(join(REPO_ROOT, tree))) {
        if (filePath.endsWith('arch/duckdb-project-files.test.ts')) {
          continue
        }
        const source = readFileSync(filePath, 'utf-8')
        if (fullyMocksDuckdbModule(source)) {
          continue
        }
        if (ENGINE_MARKERS.some((marker) => source.includes(marker))) {
          actual.push(relative(REPO_ROOT, filePath).replace(/\\/g, '/'))
        }
      }
    }

    expect(actual.sort()).toEqual([...DUCKDB_TEST_FILES].sort())
  })

  it('collects the same files from the repository-root Vitest project', () => {
    expect(duckdbConfig.test?.root).toBe(REPO_ROOT)
    expect(duckdbConfig.test?.include).toEqual(DUCKDB_TEST_FILES)
    for (const setupFile of duckdbConfig.test?.setupFiles ?? []) {
      expect(existsSync(setupFile), setupFile).toBe(true)
    }
  })
})
