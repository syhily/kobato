import { REPO_PACKAGES } from '@tests/arch/workspace-packages'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const PATH_TABLE = 'tools/tsconfig/tsconfig.base.json'
const TABLE_DIR = join(REPO_ROOT, 'tools/tsconfig')

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'dist-sea',
  '.react-router',
  '.source',
  '.vite',
  '.cache',
  'coverage',
  'tmp',
  'target',
])

const ASSET_SPECIFIER = /\.(?:css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|json|txt|md)(?:\?.*)?$/

type ModuleGraph = ReadonlyMap<string, readonly string[]>

const pathTable = (
  JSON.parse(readFileSync(join(REPO_ROOT, PATH_TABLE), 'utf8')) as {
    compilerOptions: { paths: Record<string, string[]> }
  }
).compilerOptions.paths

const PACKAGE_DIRS: Record<string, string> = Object.fromEntries(REPO_PACKAGES.map((pkg) => [pkg.name, pkg.dir]))

function walk(root: string, out: string[]): string[] {
  if (!existsSync(root)) {
    return out
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function resolveFile(path: string): string | null {
  for (const candidate of [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    `${path}.mts`,
    join(path, 'index.ts'),
    join(path, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

function viaPathTable(specifier: string): string | null {
  if (Object.hasOwn(pathTable, specifier)) {
    for (const target of pathTable[specifier]!) {
      const hit = resolveFile(resolve(TABLE_DIR, target))
      if (hit !== null) {
        return hit
      }
    }
    return null
  }
  let best: { prefix: string; targets: string[]; star: string } | null = null
  for (const [alias, targets] of Object.entries(pathTable)) {
    const star = alias.indexOf('*')
    if (star === -1) {
      continue
    }
    const prefix = alias.slice(0, star)
    const suffix = alias.slice(star + 1)
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue
    }
    if (best !== null && best.prefix.length >= prefix.length) {
      continue
    }
    best = { prefix, targets, star: specifier.slice(prefix.length, specifier.length - suffix.length) }
  }
  if (best === null) {
    return null
  }
  for (const target of best.targets) {
    const hit = resolveFile(resolve(TABLE_DIR, target.replace('*', best.star)))
    if (hit !== null) {
      return hit
    }
  }
  return null
}

function viaPackageConvention(specifier: string): string | null {
  const scoped = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
  const dir = PACKAGE_DIRS[scoped]
  if (dir === undefined) {
    return null
  }
  const rest = specifier.slice(scoped.length + 1)
  return rest === '' ? resolveFile(join(REPO_ROOT, dir, 'src')) : resolveFile(join(REPO_ROOT, dir, 'src', rest))
}

const unresolved = new Map<string, number>()

const ALIAS_PREFIXES = Object.keys(pathTable).map((alias) => alias.replace(/\*$/, ''))

function workspaceLooking(specifier: string): boolean {
  return specifier.startsWith('@kobato/') || ALIAS_PREFIXES.some((prefix) => specifier.startsWith(prefix))
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const hit = specifier.startsWith('.')
    ? resolveFile(resolve(dirname(fromFile), specifier))
    : (viaPathTable(specifier) ?? viaPackageConvention(specifier))
  if (hit === null && workspaceLooking(specifier)) {
    unresolved.set(specifier, (unresolved.get(specifier) ?? 0) + 1)
  }
  return hit
}

function stripComments(source: string): string {
  return source.replace(/(?:^|(?<=[\s;{}(]))\/\*[\s\S]*?\*\//g, '').replace(/(?:^|(?<=[\s;{}(]))\/\/.*$/gm, '')
}

function typeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim()
  if (/^type\b/.test(trimmed)) {
    return true
  }
  const braced = /^\{([^}]*)\}$/.exec(trimmed)
  if (braced === null) {
    return false
  }
  const bindings = braced[1]!
    .split(',')
    .map((binding) => binding.trim())
    .filter((binding) => binding !== '')
  return bindings.length > 0 && bindings.every((binding) => /^type\s/.test(binding))
}

function valueImportSpecifiers(source: string): string[] {
  const stripped = stripComments(source).replace(/typeof\s+import\s*\(/g, 'typeofIgnore(')
  const candidates: string[] = []
  for (const match of stripped.matchAll(/(?:^|[\s;}])(?:import|export)\s*([^'"]*?)\s*from\s*['"]([^'"]+)['"]/gm)) {
    if (!typeOnlyClause(match[1]!)) {
      candidates.push(match[2]!)
    }
  }
  for (const match of stripped.matchAll(/(?:^|[\s;}])import\s*['"]([^'"]+)['"]/gm)) {
    candidates.push(match[1]!)
  }
  for (const match of stripped.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    candidates.push(match[1]!)
  }
  return candidates.filter((specifier) => !specifier.startsWith('./+types/') && !ASSET_SPECIFIER.test(specifier))
}

function stronglyConnectedComponents(graph: ModuleGraph): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  let counter = 0
  for (const start of graph.keys()) {
    if (index.has(start)) {
      continue
    }
    const work: Array<[string, number]> = [[start, 0]]
    while (work.length > 0) {
      const frame = work[work.length - 1]!
      const [node] = frame
      if (frame[1] === 0) {
        index.set(node, counter)
        low.set(node, counter)
        counter += 1
        stack.push(node)
        onStack.add(node)
      }
      const neighbors = graph.get(node) ?? []
      let descended = false
      while (frame[1] < neighbors.length) {
        const next = neighbors[frame[1]!]!
        frame[1] += 1
        if (!index.has(next)) {
          work.push([next, 0])
          descended = true
          break
        }
        if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!))
        }
      }
      if (descended) {
        continue
      }
      if (low.get(node) === index.get(node)) {
        const component: string[] = []
        let popped: string
        do {
          popped = stack.pop()!
          onStack.delete(popped)
          component.push(popped)
        } while (popped !== node)
        if (component.length > 1) {
          components.push(component.sort())
        }
      }
      work.pop()
      if (work.length > 0) {
        const [parent] = work[work.length - 1]!
        low.set(parent, Math.min(low.get(parent)!, low.get(node)!))
      }
    }
  }
  return components
}

function concreteCycle(graph: ModuleGraph, component: readonly string[]): string[] {
  const members = new Set(component)
  const start = component[0]!
  const path = [start]
  const seen = new Set([start])
  const dfs = (node: string): boolean => {
    for (const next of graph.get(node) ?? []) {
      if (!members.has(next)) {
        continue
      }
      if (next === start) {
        return true
      }
      if (seen.has(next)) {
        continue
      }
      seen.add(next)
      path.push(next)
      if (dfs(next)) {
        return true
      }
      path.pop()
    }
    return false
  }
  return dfs(start) ? path : [...component]
}

function renderCycle(graph: ModuleGraph, component: readonly string[]): string {
  const loop = concreteCycle(graph, component)
  const offPath = component.filter((file) => !loop.includes(file))
  const lines = loop.map((file) => `  → ${relative(REPO_ROOT, file)}`)
  for (const file of offPath) {
    lines.push(`    (same component) ${relative(REPO_ROOT, file)}`)
  }
  return lines.join('\n')
}

function sourceFiles(): string[] {
  const files: string[] = []
  for (const pkg of REPO_PACKAGES) {
    walk(join(REPO_ROOT, pkg.dir, 'src'), files)
  }
  return files.sort()
}

function buildGraph(files: readonly string[]): ModuleGraph {
  const nodeSet = new Set(files)
  const graph = new Map<string, readonly string[]>()
  for (const file of files) {
    const targets = new Set<string>()
    for (const specifier of valueImportSpecifiers(readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(file, specifier)
      if (resolved !== null && nodeSet.has(resolved) && resolved !== file) {
        targets.add(resolved)
      }
    }
    graph.set(file, [...targets].sort())
  }
  return graph
}

describe('module cycles', () => {
  it('the workspace src graph has no value-import cycle', () => {
    const files = sourceFiles()
    expect(files.length, 'the graph must cover every workspace src tree').toBeGreaterThan(1500)
    const coveredPackageDirs = new Set(files.map((file) => relative(REPO_ROOT, file).split('/src/')[0]))
    const packagesWithSrc = REPO_PACKAGES.filter((pkg) => existsSync(join(REPO_ROOT, pkg.dir, 'src'))).map(
      (pkg) => pkg.dir,
    )
    expect([...coveredPackageDirs].sort()).toEqual(packagesWithSrc.sort())

    const graph = buildGraph(files)
    expect(
      [...unresolved.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      'every workspace specifier must resolve through the path table or the package wildcard-export convention',
    ).toEqual([])

    const cycles = stronglyConnectedComponents(graph)
      .map((component) => ({ component, rendered: renderCycle(graph, component) }))
      .sort((a, b) => (a.rendered < b.rendered ? -1 : a.rendered > b.rendered ? 1 : 0))
      .map((cycle) => cycle.rendered)
    expect(
      cycles,
      'value-import cycles found — move the shared binding into a leaf module both sides import:\n' +
        cycles.join('\n\n'),
    ).toEqual([])
  })

  it('counts side-effect imports (line-start, mid-line, and unspaced), re-exports, and dynamic import() as value edges, and ignores type-only imports, type re-exports, and assets', () => {
    const specifiers = valueImportSpecifiers(`
      import type { A } from '@kobato/base/a'
      import type Default from '@kobato/base/default'
      import { type B, b } from './b'
      import { type C } from './c'
      export type { D } from './d'
      export type * from './l'
      export { type M } from './m'
      export { type N, type O } from './no'
      export { e } from './e'
      export * as f from './f'
      export * from './g'
      import './h'
      import i from './i'
      import j, { type P } from './j'
      const lazy = () => import('./r')
      type K = typeof import('./k')
      import './logo.svg?react'
      import styles from './styles.css'
      import './+types/root'
      // import './commented'
      /* import './blocked' */
      const a = 1; import './n'
      const o = import'./o'
      const u = 'a//b'; import './p'
      const v = 'x/*y*/z'; import './q'
    `)
    expect(specifiers.sort()).toEqual([
      './b',
      './e',
      './f',
      './g',
      './h',
      './i',
      './j',
      './n',
      './o',
      './p',
      './q',
      './r',
    ])
  })

  it('tripwire: every path-table alias resolves from a source file, and a workspace-looking specifier that cannot resolve is reported', () => {
    const from = join(REPO_ROOT, 'apps/kobato/src/server.ts')
    expect(relative(REPO_ROOT, resolveSpecifier(from, '@/server/client-assets-root')!)).toBe(
      'apps/kobato/src/server/client-assets-root.ts',
    )
    expect(relative(REPO_ROOT, resolveSpecifier(from, '@sayaka/server/config')!)).toBe(
      'apps/sayaka/src/server/config.ts',
    )
    expect(relative(REPO_ROOT, resolveSpecifier(from, '@kobato/inkling/headless')!)).toBe(
      'packages/inkling/src/headless/index.ts',
    )
    expect(relative(REPO_ROOT, resolveSpecifier(from, '@kobato/instance/temp')!)).toBe('tools/instance/src/temp.ts')
    expect(resolveSpecifier(from, 'react')).toBeNull()
    expect(unresolved.has('react')).toBe(false)

    expect(resolveSpecifier(from, '@/server/does-not-exist')).toBeNull()
    expect(unresolved.get('@/server/does-not-exist')).toBe(1)
    unresolved.delete('@/server/does-not-exist')
  })

  it('tripwire: the detector reports a two-file cycle as a concrete path and leaves acyclic files alone', () => {
    const a = '/repo/packages/x/src/a.ts'
    const b = '/repo/packages/x/src/b.ts'
    const c = '/repo/packages/x/src/c.ts'
    const d = '/repo/packages/x/src/d.ts'
    const graph = new Map<string, readonly string[]>([
      [a, [b]],
      [b, [a, c]],
      [c, []],
      [d, [c]],
    ])
    const components = stronglyConnectedComponents(graph)
    expect(components).toEqual([[a, b]])
    expect(concreteCycle(graph, components[0]!)).toEqual([a, b])
    expect(
      stronglyConnectedComponents(
        new Map([
          [a, [b]],
          [b, [c]],
          [c, []],
        ]),
      ),
    ).toEqual([])
  })
})
