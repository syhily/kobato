import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DUCKDB_TEST_FILES } from '#/duckdb-files'

const PROJECT_ROOT = process.cwd()
const TESTS_DIR = join(PROJECT_ROOT, 'tests')

// Markers that load or drive the real DuckDB native engine. A full
// `vi.mock` of the duckdb module (no importOriginal) means the native
// binding never loads, so mocked files stay in their home project.
const ENGINE_MARKERS = [
  'createTestAnalyticsDb',
  'openAnalyticsDatabase',
  'closeTestAnalyticsDb',
  'closeAnalyticsDatabase',
  'DuckDBInstance',
  '__adoptAnalyticsHandleForTests',
  'initAnalyticsDatabase(',
]

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
  return source.includes(`vi.mock('@/server/infra/analytics/duckdb'`) && !source.includes('importOriginal')
}

describe('duckdb project membership', () => {
  it('lists every test file that touches the real DuckDB engine — and only those', () => {
    const actual: string[] = []
    for (const tree of ['it', 'unit']) {
      for (const filePath of walk(join(TESTS_DIR, tree))) {
        // This scanner file itself carries the marker strings.
        if (filePath.endsWith('arch/duckdb-project-files.test.ts')) {
          continue
        }
        const source = readFileSync(filePath, 'utf-8')
        if (fullyMocksDuckdbModule(source)) {
          continue
        }
        if (ENGINE_MARKERS.some((marker) => source.includes(marker))) {
          actual.push(relative(TESTS_DIR, filePath).replace(/\\/g, '/'))
        }
      }
    }
    // Mismatch? Update tests/duckdb-files.ts — new engine users join the
    // list, retired ones leave it.
    expect(actual.sort()).toEqual([...DUCKDB_TEST_FILES].sort())
  })
})
