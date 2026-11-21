/**
 * Module-level import cycles.
 *
 * The directory-grain guards (`server-layers`, `web-direction`,
 * `admin-feature-graph`) pin layer and feature edges, but none of them can see
 * a cycle that closes INSIDE a directory or across two adjacent files. This
 * guard walks the runtime (value) import graph of every product src tree —
 * `import type` edges are erased; static `from`, side-effect, dynamic
 * `import()`, `export { … } from`, and `vi.mock` edges all count — resolves
 * specifiers through the workspace path table, and fails on any strongly
 * connected component larger than one file.
 *
 * A value-import cycle is a TDZ hazard even when it happens to work today:
 * module-evaluation order decides whether a binding is initialized when a
 * consumer reads it at its own top level. Break cycles by moving the shared
 * binding (a command constant, a schema, a small pure helper) into a leaf
 * module both sides import — see `plugins/behaviour/selector-insertion` for
 * the reference shape.
 */
import { REPO_PACKAGES } from '@tests/arch/workspace-packages.ts'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const PACKAGE_DIRS: Record<string, string> = Object.fromEntries(REPO_PACKAGES.map((pkg) => [pkg.name, pkg.dir]))

const IGNORE_DIRS = new Set(['node_modules', '.git', '.react-router', 'dist', 'build', 'tmp', '.vite'])

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
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Runtime (non-type) specifiers: `import type … from` and `export type { … } from`
 * statements are erased, and a named-import block survives only when it binds
 * at least one runtime name. `vi.mock` module paths count as edges too — mocks
 * mirror the runtime graph.
 */
function valueImportSpecifiers(source: string): string[] {
  let stripped = stripComments(source)
  stripped = stripped.replace(/import\s+type\s[\s\S]{0,800}?from\s+['"][^'"]+['"]/g, '')
  stripped = stripped.replace(/export\s+type\s+\{[^}]*\}\s*from\s+['"][^'"]+['"]/g, '')
  stripped = stripped.replace(/import\s+\{([^}]*)\}\s*from\s+['"][^'"]+['"]/g, (match, body: string) => {
    const allTypeBindings = body
      .split(',')
      .filter((binding) => binding.trim() !== '')
      .every((binding) => /^type[\s,]/.test(binding.trim()))
    return allTypeBindings ? '' : match
  })

  const specifiers: string[] = []
  for (const match of stripped.matchAll(/(?:^|[\s;])from\s+['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1])
  }
  for (const match of stripped.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    specifiers.push(match[1])
  }
  for (const match of stripped.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1])
  }
  for (const match of stripped.matchAll(/\bvi\.mock\(\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1])
  }
  return specifiers
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

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return resolveFile(resolve(dirname(fromFile), specifier))
  }
  if (specifier.startsWith('@/')) {
    return resolveFile(resolve(join(REPO_ROOT, 'apps/kobato/src'), specifier.slice(2)))
  }
  if (specifier.startsWith('@kobato/inkling-internal/')) {
    return resolveFile(
      resolve(join(REPO_ROOT, 'packages/inkling/src'), specifier.slice('@kobato/inkling-internal/'.length)),
    )
  }
  if (specifier.startsWith('@kobato/inkling-demo/')) {
    return resolveFile(resolve(join(REPO_ROOT, 'apps/inkling-demo'), specifier.slice('@kobato/inkling-demo/'.length)))
  }
  if (specifier.startsWith('@kobato/')) {
    const packageName = specifier.split('/').slice(0, 2).join('/')
    const packageDir = PACKAGE_DIRS[packageName]
    if (packageDir === undefined) {
      return null
    }
    const rest = specifier.slice(packageName.length + 1)
    if (rest === '') {
      return resolveFile(join(REPO_ROOT, packageDir, 'src', 'index.ts'))
    }
    return resolveFile(resolve(join(REPO_ROOT, packageDir, 'src'), rest))
  }
  return null
}

const files = Object.values(PACKAGE_DIRS).flatMap((dir) => walk(join(REPO_ROOT, dir, 'src'), []))
const nodeSet = new Set(files)
const adjacency = new Map<string, Set<string>>()

for (const file of files) {
  for (const specifier of valueImportSpecifiers(readFileSync(file, 'utf8'))) {
    // Unresolvable specifiers are assets (css/svg?react), externals, or
    // test-tree-only helpers outside the src graph — not cycle candidates.
    const resolved = resolveSpecifier(file, specifier)
    if (resolved !== null && nodeSet.has(resolved)) {
      const targets = adjacency.get(file) ?? new Set<string>()
      targets.add(resolved)
      adjacency.set(file, targets)
    }
  }
}

function stronglyConnectedComponents(): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  let counter = 0

  for (const start of nodeSet) {
    if (index.has(start)) {
      continue
    }
    const work: Array<[string, number]> = [[start, 0]]
    while (work.length > 0) {
      const frame = work[work.length - 1]
      const [node] = frame
      if (frame[1] === 0) {
        index.set(node, counter)
        low.set(node, counter)
        counter += 1
        stack.push(node)
        onStack.add(node)
      }
      const neighbors = [...(adjacency.get(node) ?? [])]
      let descended = false
      while (frame[1] < neighbors.length) {
        const next = neighbors[frame[1]]
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
          components.push(component)
        }
      }
      work.pop()
      if (work.length > 0) {
        const [parent] = work[work.length - 1]
        low.set(parent, Math.min(low.get(parent)!, low.get(node)!))
      }
    }
  }
  return components
}

describe('module cycles', () => {
  it('the product src graph has no value-import cycle', () => {
    expect(files.length, 'the graph must cover every product src tree').toBeGreaterThan(1000)

    const cycles = stronglyConnectedComponents()
      .map((component) => component.map((file) => relative(REPO_ROOT, file)).sort())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    const rendered = cycles.map((component) => component.join('\n  ↳ ')).join('\n\n')
    expect(
      cycles,
      `value-import cycles found — move the shared binding into a leaf module both sides import:\n${rendered}`,
    ).toEqual([])
  })
})
