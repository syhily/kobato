import { DEMO_UNIT_INCLUDE } from '@kobato/test/projects/demo-unit'
import { INKLING_UNIT_INCLUDE } from '@kobato/test/projects/inkling-unit'
import {
  allTestProjects,
  apiUnitConfigPath,
  demoUnitConfigPath,
  inklingUnitConfigPath,
  packUnitConfigPath,
  traceUnitConfigPath,
} from '@kobato/test/projects/registry'
import { API_UNIT_INCLUDE, PACK_UNIT_INCLUDE, TRACE_UNIT_INCLUDE } from '@kobato/test/projects/unit-includes'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

type InlineProject = {
  test?: {
    name?: string
    include?: string[]
    exclude?: string[]
    isolate?: boolean
  }
}

const PINNED_INLINE_PROJECT_NAMES = [
  'shared-unit',
  'shared-snaps',
  'web-unit',
  'web-snaps',
  'ui-unit',
  'ui-snaps',
  'db-unit',
  'db-it',
  'db-duckdb',
  'server-unit',
  'server-it',
  'server-duckdb',
  'app-unit',
  'app-it',
  'app-duckdb',
  'app-tz-unit',
  'app-snaps',
  'sayaka-unit',
  'sayaka-it',
  'sayaka-snaps',
] as const

const PINNED_CONFIG_PATH_ENTRIES = [
  inklingUnitConfigPath,
  demoUnitConfigPath,
  apiUnitConfigPath,
  packUnitConfigPath,
  traceUnitConfigPath,
] as const

const OUT_OF_DEFAULT_TEST_TREES = [
  'apps/kobato/tests/e2e',
  'apps/kobato/tests/browser',
  'apps/sayaka/tests/e2e',
  'apps/sayaka/tests/browser',
] as const

const SKIPPED_TREE_DIRS = new Set(['node_modules', '__snapshots__', 'e2e', 'browser'])

function inlineProjects(): InlineProject[] {
  return allTestProjects.filter((entry) => typeof entry !== 'string') as InlineProject[]
}

function configPathEntries(): string[] {
  return allTestProjects.filter((entry) => typeof entry === 'string')
}

function patternMatches(pattern: string, file: string): boolean {
  if (!pattern.includes('*')) {
    return pattern === file
  }
  const match = /^(.*)\/\*\*\/([^/]+)$/.exec(pattern)
  if (!match) {
    throw new Error(`unsupported project pattern: ${pattern}`)
  }
  const [, dir, name] = match
  const dirRe = new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*')}/`)
  const dirMatch = dirRe.exec(file)
  if (!dirMatch) {
    return false
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nameRe = new RegExp(
    `^${escaped.replace(/\\\{([^}]+)\\\}/, (_, alts: string) => `(?:${alts.split(',').join('|')})`).replace(/\\\*/g, '.*')}$`,
  )
  return nameRe.test(file.slice(dirMatch[0].length))
}

function configPathIncludes(): Array<readonly [readonly string[], string]> {
  return [
    [INKLING_UNIT_INCLUDE, 'inkling-unit'],
    [DEMO_UNIT_INCLUDE, 'demo-unit'],
    [API_UNIT_INCLUDE, 'api-unit'],
    [PACK_UNIT_INCLUDE, 'pack-unit'],
    [TRACE_UNIT_INCLUDE, 'trace-unit'],
  ] as const
}

function projectsMatching(file: string): string[] {
  const names: string[] = []
  for (const project of inlineProjects()) {
    const include = project.test?.include ?? []
    const exclude = (project.test?.exclude ?? []).filter((pattern) => !pattern.startsWith('**/'))
    if (include.some((pattern) => patternMatches(pattern, file)) && !exclude.some((p) => patternMatches(p, file))) {
      names.push(project.test?.name ?? '(unnamed)')
    }
  }
  for (const [include, name] of configPathIncludes()) {
    if (include.some((pattern) => patternMatches(pattern, file))) {
      names.push(name)
    }
  }
  return names
}

function walkTests(dir: string, out: string[], skipTrees = SKIPPED_TREE_DIRS): void {
  if (!existsSync(dir)) {
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipTrees.has(entry.name)) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTests(full, out, skipTrees)
    } else if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(relative(REPO_ROOT, full).replace(/\\/g, '/'))
    }
  }
}

function walkSpecFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) {
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSpecFiles(full, out)
    } else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(relative(REPO_ROOT, full).replace(/\\/g, '/'))
    }
  }
}

function allDiskTestFiles(): string[] {
  const files: string[] = []
  const roots: string[] = []
  for (const base of ['apps', 'packages', 'packages/shared', 'packages/web', 'tools'] as const) {
    const baseDir = join(REPO_ROOT, base)
    if (!existsSync(baseDir)) {
      continue
    }
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') {
        continue
      }
      roots.push(join(baseDir, entry.name, 'tests'))
    }
  }
  for (const root of roots) {
    walkTests(root, files)
  }
  return files.sort()
}

describe('vitest project registry', () => {
  it('registers exactly the pinned project set, explicitly', () => {
    expect(inlineProjects().map((project) => project.test?.name)).toEqual([...PINNED_INLINE_PROJECT_NAMES])
    expect(configPathEntries()).toEqual([...PINNED_CONFIG_PATH_ENTRIES])
    for (const path of configPathEntries()) {
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(true)
    }
  })

  it('every project runs with per-file isolation', () => {
    for (const project of inlineProjects()) {
      expect(project.test?.isolate, project.test?.name).toBe(true)
    }
    const sourceChecks: Array<[string, string]> = [
      [inklingUnitConfigPath, 'inklingUnitProject('],
      [demoUnitConfigPath, 'demoUnitProject('],
      [apiUnitConfigPath, 'API_UNIT_INCLUDE'],
      [packUnitConfigPath, 'PACK_UNIT_INCLUDE'],
      [traceUnitConfigPath, 'TRACE_UNIT_INCLUDE'],
    ]
    for (const [path, marker] of sourceChecks) {
      expect(readFileSync(join(REPO_ROOT, path), 'utf8'), path).toContain(marker)
    }
  })

  it('discovers every workspace test file exactly once', () => {
    const unmatched: string[] = []
    const duplicated: string[] = []
    for (const file of allDiskTestFiles()) {
      const matches = projectsMatching(file)
      if (matches.length === 0) {
        unmatched.push(file)
      } else if (matches.length > 1) {
        duplicated.push(`${file}: ${matches.join(', ')}`)
      }
    }
    expect(unmatched).toEqual([])
    expect(duplicated).toEqual([])
  })

  it('every registered project matches at least one test file', () => {
    const files = allDiskTestFiles()
    const names = [...PINNED_INLINE_PROJECT_NAMES, ...configPathIncludes().map(([, name]) => name)]
    for (const name of names) {
      const matched = files.filter((file) => projectsMatching(file).includes(name))
      expect(matched.length, `project ${name} matches no test file`).toBeGreaterThan(0)
    }
  })

  it('the e2e and browser trees are registered nowhere', () => {
    for (const tree of OUT_OF_DEFAULT_TEST_TREES) {
      const files: string[] = []
      walkSpecFiles(join(REPO_ROOT, tree), files)
      expect(files.length, `${tree} should hold its spec files`).toBeGreaterThan(0)
      for (const file of files) {
        expect(projectsMatching(file), file).toEqual([])
      }
    }
  })
})
