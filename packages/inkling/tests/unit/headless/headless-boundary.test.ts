/**
 * The headless document model's React-free boundary.
 *
 * `src/headless/` is React-free by construction — the surface `server/`,
 * `db`, `contracts`, and `catalog` consume. That promise is transitive: the
 * runtime-import closure of every headless module (following value imports,
 * value re-exports, and dynamic imports; `import type` edges are erased)
 * must never reach `react` / `react-dom` / `@lexical/react` nor leave the
 * React-free roots of the package. The serialization planes (`html/`,
 * `markdown/`, `transforms/`), `nodes/`, `utils/`, and `themes/` are part of
 * the closure by design — they stay React-free too.
 *
 * The one sanctioned runtime edge into `nodes/` is
 * `nodes/base/generate-decorator-node` (the host-card assembly entry every
 * dist entry builds its own classes through); every other `nodes/**` reach
 * from headless is `import type` only.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const INKLING_SRC = join(REPO_ROOT, 'packages/inkling/src')
const HEADLESS_DIR = join(INKLING_SRC, 'headless')
const INTERNAL_PREFIX = '@kobato/inkling-internal/'
const NODES_PREFIX = `${INTERNAL_PREFIX}nodes/`
const GENERATE_DECORATOR_NODE = `${NODES_PREFIX}base/generate-decorator-node`

const REACT_EXTERNALS = /^(?:react|react-dom|@lexical\/react)(?:\/.*)?$/
const REACT_FREE_ROOTS = new Set(['headless', 'html', 'markdown', 'nodes', 'transforms', 'utils', 'themes'])

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Runtime (non-type) specifiers: `import type … from` and `export type { … } from`
 * statements are erased, and a named-import block survives only when it binds at
 * least one runtime name (`import { type A, B }`). Plain `from`, side-effect,
 * dynamic-import, and `export { … } from` forms all count as runtime edges.
 */
function runtimeImportSpecifiers(source: string): string[] {
  let stripped = source
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
  return specifiers
}

function resolveInternal(specifier: string): string | null {
  if (!specifier.startsWith(INTERNAL_PREFIX)) {
    return null
  }
  const base = join(INKLING_SRC, specifier.slice(INTERNAL_PREFIX.length))
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

interface Closure {
  seen: Set<string>
  offenders: string[]
}

function headlessRuntimeClosure(): Closure {
  const seen = new Set<string>()
  const offenders: string[] = []
  const queue = walk(HEADLESS_DIR, [])

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) {
      continue
    }
    seen.add(file)
    const rel = file.slice(REPO_ROOT.length + 1)
    for (const specifier of runtimeImportSpecifiers(readFileSync(file, 'utf8'))) {
      if (REACT_EXTERNALS.test(specifier)) {
        offenders.push(`${rel}: ${specifier} — headless must stay React-free`)
        continue
      }
      const resolved = resolveInternal(specifier)
      if (resolved === null) {
        if (specifier.startsWith(INTERNAL_PREFIX)) {
          offenders.push(`${rel}: ${specifier} — unresolvable internal specifier`)
        }
        continue
      }
      const root = resolved.slice(INKLING_SRC.length + 1).split('/')[0]
      if (!REACT_FREE_ROOTS.has(root)) {
        offenders.push(`${rel}: ${specifier} — the closure entered ${root}/, a React layer`)
      }
      queue.push(resolved)
    }
  }

  return { seen, offenders }
}

describe('headless boundary', () => {
  it('the headless runtime-import closure never reaches React or a React layer', () => {
    const { seen, offenders } = headlessRuntimeClosure()
    expect(seen.size, 'the closure must actually cover the headless tree').toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('headless reaches nodes at runtime only through generate-decorator-node', () => {
    const nodesEdges = new Set<string>()
    for (const file of walk(HEADLESS_DIR, [])) {
      for (const specifier of runtimeImportSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith(NODES_PREFIX)) {
          nodesEdges.add(specifier)
        }
      }
    }

    expect([...nodesEdges].sort()).toEqual([GENERATE_DECORATOR_NODE])
  })

  it('headless declares no react import of any kind, not even a type import', () => {
    const offenders: string[] = []
    const anyImportRe =
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bexport\s+(?:type\s+)?\{[^}]*\}\s*from\s+)['"]([^'"]+)['"]/g
    for (const file of walk(HEADLESS_DIR, [])) {
      for (const match of readFileSync(file, 'utf8').matchAll(anyImportRe)) {
        if (/^react(?:-dom)?(?:\/.*)?$/.test(match[1])) {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${match[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
