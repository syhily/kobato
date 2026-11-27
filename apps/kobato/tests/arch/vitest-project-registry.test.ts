import { DEMO_UNIT_INCLUDE } from '@kobato/test/projects/demo-unit'
import { INKLING_UNIT_INCLUDE } from '@kobato/test/projects/inkling-unit'
import {
  allTestProjects,
  demoUnitConfigPath,
  fontSplitUnitConfigPath,
  inklingUnitConfigPath,
  packUnitConfigPath,
  traceUnitConfigPath,
} from '@kobato/test/projects/registry'
import { FONT_SPLIT_UNIT_INCLUDE, PACK_UNIT_INCLUDE, TRACE_UNIT_INCLUDE } from '@kobato/test/projects/unit-includes'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

type InlineProject = {
  test?: {
    name?: string
    include?: string[]
    exclude?: string[]
    isolate?: boolean
    maxWorkers?: number
    pool?: string
  }
}

const PINNED_INLINE_PROJECT_NAMES = [
  'shared-unit',
  'shared-snaps',
  'web-unit',
  'ui-unit',
  'ui-snaps',
  'db-unit',
  'db-iso-unit',
  'db-it',
  'db-duckdb',
  'server-unit',
  'server-iso-unit',
  'server-it',
  'server-iso-it',
  'server-duckdb',
  'api-unit',
  'api-iso-unit',
  'app-arch',
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
  packUnitConfigPath,
  traceUnitConfigPath,
  fontSplitUnitConfigPath,
] as const

const VM_THREAD_PROJECTS = [
  'web-unit',
  'ui-unit',
  'ui-snaps',
  'server-unit',
  'server-it',
  'app-unit',
  'app-snaps',
  'sayaka-unit',
  'sayaka-snaps',
] as const

const ISOLATED_PROJECTS = [
  'db-iso-unit',
  'server-iso-unit',
  'server-iso-it',
  'api-iso-unit',
  'app-it',
  'app-duckdb',
] as const

const PATH_CONFIG_THREAD_PROJECTS = ['pack-unit', 'trace-unit', 'font-split-unit'] as const

const ISOLATE_CONSTRAINT =
  'isolate: false is a hard constraint (AGENTS.md): rename the file to *.iso.test.ts instead of flipping the default'
const ISO_OVERRIDE = /\bisolate\s*:/

const OUT_OF_DEFAULT_TEST_TREES = [
  'apps/kobato/tests/e2e',
  'apps/kobato/tests/browser',
  'apps/sayaka/tests/e2e',
  'apps/sayaka/tests/browser',
] as const

const SKIPPED_TREE_DIRS = new Set(['node_modules', '__snapshots__', 'e2e', 'browser'])
const WORKSPACE_BASES = ['apps', 'packages', 'packages/shared', 'packages/web', 'tools'] as const

const MOCK_REGISTERING_HELPERS = ['mock-react-query'] as const
const MOCK_CALL = /^\s*vi\.(?:do)?mock\(/m

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
    [PACK_UNIT_INCLUDE, 'pack-unit'],
    [TRACE_UNIT_INCLUDE, 'trace-unit'],
    [FONT_SPLIT_UNIT_INCLUDE, 'font-split-unit'],
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

function sharedThreadProjects(): string[] {
  return inlineProjects()
    .filter((project) => {
      const test = project.test
      if (test?.isolate || test?.pool === 'vmThreads' || test?.pool === 'forks') {
        return false
      }
      return (test?.pool ?? 'threads') === 'threads'
    })
    .map((project) => project.test?.name ?? '(unnamed)')
}

function workspacePackageDirs(): string[] {
  const dirs: string[] = []
  for (const base of WORKSPACE_BASES) {
    const baseDir = join(REPO_ROOT, base)
    if (!existsSync(baseDir)) {
      continue
    }
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        dirs.push(join(baseDir, entry.name))
      }
    }
  }
  return dirs
}

function walkSource(dir: string, out: string[], skip: (file: string) => boolean): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const file = relative(REPO_ROOT, full).replace(/\\/g, '/')
    if (skip(file)) {
      continue
    }
    if (entry.isDirectory()) {
      walkSource(full, out, skip)
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(file)
    }
  }
}

function allDiskTestFiles(): string[] {
  const files: string[] = []
  const roots: string[] = []
  for (const base of WORKSPACE_BASES) {
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
    if (existsSync(root) && statSync(root).isDirectory()) {
      walkSource(root, files, (file) => file.split('/').some((segment) => SKIPPED_TREE_DIRS.has(segment)))
    }
  }
  return files.filter((file) => /\.test\.(ts|tsx|js|jsx)$/.test(file)).sort()
}

function mockRegisteringHelperNames(): string[] {
  const files: string[] = []
  const utilsDirs = workspacePackageDirs().map((dir) => join(dir, 'tests/utils'))
  for (const dir of [join(REPO_ROOT, 'tools/test/src'), ...utilsDirs]) {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      walkSource(dir, files, (file) => /(^|\/)setup(\.tsx?$|\/)/.test(file))
    }
  }
  return files
    .filter((file) => MOCK_CALL.test(readFileSync(join(REPO_ROOT, file), 'utf8')))
    .map(
      (file) =>
        file
          .split('/')
          .pop()
          ?.replace(/\.tsx?$/, '') ?? file,
    )
    .sort()
}

function registersMocks(source: string): boolean {
  if (MOCK_CALL.test(source)) {
    return true
  }
  return MOCK_REGISTERING_HELPERS.some((name) => new RegExp(`(?:from|import\\()\\s*'[^']*/${name}'`).test(source))
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

describe('vitest project registry', () => {
  it('registers exactly the pinned project set, explicitly', () => {
    expect(inlineProjects().map((project) => project.test?.name)).toEqual([...PINNED_INLINE_PROJECT_NAMES])
    expect(configPathEntries()).toEqual([...PINNED_CONFIG_PATH_ENTRIES])
    for (const path of configPathEntries()) {
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(true)
    }
  })

  it('the shared-worker base is the default and pins four workers', () => {
    expect(vitestTestBase.maxWorkers).toBe(4)
    expect(vitestTestBase.isolate, ISOLATE_CONSTRAINT).toBe(false)
    for (const project of inlineProjects()) {
      expect(project.test?.maxWorkers, `${project.test?.name} maxWorkers`).toBe(4)
    }
    const sourceChecks: Array<[string, string]> = [
      [inklingUnitConfigPath, 'inklingUnitProject('],
      [demoUnitConfigPath, 'demoUnitProject('],
      [packUnitConfigPath, 'PACK_UNIT_INCLUDE'],
      [traceUnitConfigPath, 'TRACE_UNIT_INCLUDE'],
      [fontSplitUnitConfigPath, 'FONT_SPLIT_UNIT_INCLUDE'],
    ]
    for (const [path, marker] of sourceChecks) {
      expect(readFileSync(join(REPO_ROOT, path), 'utf8'), path).toContain(marker)
    }
    for (const path of [packUnitConfigPath, traceUnitConfigPath, fontSplitUnitConfigPath]) {
      expect(readFileSync(join(REPO_ROOT, path), 'utf8'), path).toContain('vitestTestBase')
    }
    for (const path of [
      ...configPathEntries(),
      'vitest.config.ts',
      'tools/test/src/projects/inkling-unit.ts',
      'tools/test/src/projects/demo-unit.ts',
    ]) {
      expect(readFileSync(join(REPO_ROOT, path), 'utf8'), `${path}: ${ISOLATE_CONSTRAINT}`).not.toMatch(ISO_OVERRIDE)
    }
  })

  it('isolate stays false everywhere except the pinned isolated projects', () => {
    for (const project of inlineProjects()) {
      const name = project.test?.name ?? '(unnamed)'
      if ((ISOLATED_PROJECTS as readonly string[]).includes(name)) {
        expect(project.test?.pool ?? 'threads', `${name} pool`).toBe('threads')
        expect(project.test?.isolate, `${name} isolate`).toBe(true)
        continue
      }
      expect(project.test?.isolate, `${name}: ${ISOLATE_CONSTRAINT}`).toBe(false)
      if ((VM_THREAD_PROJECTS as readonly string[]).includes(name)) {
        expect(project.test?.pool, `${name} pool`).toBe('vmThreads')
      } else if (name === 'app-tz-unit') {
        expect(project.test?.pool, `${name} pool`).toBe('forks')
      } else {
        expect(project.test?.pool, `${name} pool`).toBe('threads')
      }
    }
    const isolated = inlineProjects().filter((project) => project.test?.isolate)
    expect(isolated.map((project) => project.test?.name ?? '(unnamed)').sort()).toEqual([...ISOLATED_PROJECTS].sort())
    const vm = inlineProjects().filter((project) => project.test?.pool === 'vmThreads')
    expect(vm.map((project) => project.test?.name ?? '(unnamed)').sort()).toEqual([...VM_THREAD_PROJECTS].sort())
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

  it('every helper that registers module mocks is known', () => {
    expect(mockRegisteringHelperNames()).toEqual([...MOCK_REGISTERING_HELPERS])
  })

  it('a shared threads pool never carries a mock-registering file and *.iso.test.ts runs only isolated', () => {
    const shared = new Set<string>([...sharedThreadProjects(), ...PATH_CONFIG_THREAD_PROJECTS])
    const isolated = new Set<string>(ISOLATED_PROJECTS)
    const offenders: string[] = []
    for (const file of allDiskTestFiles()) {
      const projects = projectsMatching(file)
      if (/\.iso\.test\.(ts|tsx|js|jsx)$/.test(file)) {
        if (projects.length === 0 || projects.some((name) => !isolated.has(name))) {
          offenders.push(`${file}: *.iso.test.ts must run only in an isolated project`)
        }
        continue
      }
      const registers = registersMocks(readFileSync(join(REPO_ROOT, file), 'utf8'))
      if (registers && projects.some((name) => shared.has(name))) {
        offenders.push(`${file}: registers mocks on a shared threads pool but is not named *.iso.test.ts`)
      }
    }
    expect(offenders).toEqual([])
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
