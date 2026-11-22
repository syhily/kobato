import { dbProjects } from '@kobato/test/projects/db-projects'
import { kobatoAppProjects } from '@kobato/test/projects/kobato-app-projects'
import { serverProjects } from '@kobato/test/projects/server-projects'
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
  'runDuckDbSelfCheck',
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
  if (!existsSync(dir)) {
    return files
  }
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

function repoRelative(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/')
}

function isDuckdbNamed(file: string): boolean {
  return /\.duckdb\.test\.tsx?$/.test(file)
}

function isUnderIntegrationTree(file: string): boolean {
  return file.includes('/tests/it/')
}

function fullyMocksDuckdbModule(source: string): boolean {
  return source.includes(`vi.mock('@kobato/db/duckdb/database'`) && !source.includes('importOriginal')
}

function touchesRealEngine(source: string): boolean {
  return ENGINE_MARKERS.some((marker) => source.includes(marker))
}

function projectByName(projects: unknown[], name: string) {
  const project = projects.find((entry) => (entry as { test?: { name?: string } }).test?.name === name) as {
    test?: { include?: string[]; setupFiles?: string[]; isolate?: boolean }
  }
  expect(project, `project ${name} must exist`).toBeDefined()
  return project
}

describe('duckdb test naming', () => {
  it('every test touching the real DuckDB engine is a tests/it *.duckdb.test.ts file', () => {
    const offenders: string[] = []
    for (const tree of TEST_TREES) {
      for (const filePath of walk(join(REPO_ROOT, tree))) {
        if (filePath.endsWith('arch/duckdb-project-files.test.ts')) {
          continue
        }
        const source = readFileSync(filePath, 'utf8')
        if (fullyMocksDuckdbModule(source) || !touchesRealEngine(source)) {
          continue
        }
        const file = repoRelative(filePath)
        if (!isDuckdbNamed(file) || !isUnderIntegrationTree(file)) {
          offenders.push(file)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every *.duckdb.test.ts file really spins up the engine', () => {
    const offenders: string[] = []
    for (const testsRoot of walkTestRoots()) {
      for (const filePath of walk(testsRoot)) {
        if (!isDuckdbNamed(filePath)) {
          continue
        }
        const source = readFileSync(filePath, 'utf8')
        if (fullyMocksDuckdbModule(source) || !touchesRealEngine(source)) {
          offenders.push(repoRelative(filePath))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the db/server/app duckdb projects discover them by glob, isolated, on their own setup', () => {
    const expectations = [
      { projects: dbProjects, name: 'db-duckdb', include: 'packages/db/tests/it/**/*.duckdb.test.{ts,tsx}' },
      {
        projects: serverProjects,
        name: 'server-duckdb',
        include: 'packages/server/tests/it/**/*.duckdb.test.{ts,tsx}',
      },
      {
        projects: kobatoAppProjects,
        name: 'app-duckdb',
        include: 'apps/kobato/tests/it/**/*.duckdb.test.{ts,tsx}',
      },
    ]
    for (const { projects, name, include } of expectations) {
      const project = projectByName(projects, name)
      expect(project.test?.include).toEqual([include])
      expect(project.test?.isolate).toBe(true)
      for (const setupFile of project.test?.setupFiles ?? []) {
        expect(existsSync(setupFile), setupFile).toBe(true)
      }
    }
  })
})

function walkTestRoots(): string[] {
  const roots: string[] = []
  for (const base of ['apps', 'packages', 'packages/shared', 'packages/web', 'tools']) {
    const baseDir = join(REPO_ROOT, base)
    if (!existsSync(baseDir)) {
      continue
    }
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') {
        continue
      }
      const testsDir = join(baseDir, entry.name, 'tests')
      if (existsSync(testsDir) && statSync(testsDir).isDirectory()) {
        roots.push(testsDir)
      }
    }
  }
  return roots
}
