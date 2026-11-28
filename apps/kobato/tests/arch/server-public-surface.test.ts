import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const CONSUMING_TREES = [
  'apps/kobato/src',
  'apps/inkling-demo/src',
  'packages/api/src',
  'packages/db/src',
  'packages/web/ui/src',
  'packages/inkling/src',
  'tools/instance/src',
  'tools/test/src',
  'tools/trace/src',
  'tools/pack/src',
] as const

const SERVER_PUBLIC_SURFACE: readonly string[] = [
  '@kobato/server/bootstrap/start-kobato',
  '@kobato/server/infra/image/process-pool',
  '@kobato/server/infra/sea/sea',
  '@kobato/server/infra/sea/sea-bootstrap',
  '@kobato/server/infra/sea/sea-cli',
]

const KOBATO_ENTRY = 'apps/kobato/src/server.ts'
const KOBATO_ENTRY_SERVER_SEAM: readonly string[] = [
  '@kobato/server/bootstrap/start-kobato',
  '@kobato/server/infra/sea/sea',
]

function walk(root: string, out: string[]): void {
  if (!existsSync(root)) {
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

const scanned = CONSUMING_TREES.flatMap((tree) => {
  const files: string[] = []
  walk(join(REPO_ROOT, tree), files)
  return files.sort().map((file) => {
    const rel = file.slice(REPO_ROOT.length + 1)
    return importSpecifiers(stripComments(readFileSync(file, 'utf8'))).map((specifier) => ({ file: rel, specifier }))
  })
}).flat()

describe('server public surface', () => {
  it('non-server product trees import exactly the audited @kobato/server surface', () => {
    const actual = new Map<string, string[]>()
    for (const { file, specifier } of scanned) {
      if (specifier === '@kobato/server' || specifier.startsWith('@kobato/server/')) {
        const sites = actual.get(specifier) ?? []
        sites.push(file)
        actual.set(specifier, sites)
      }
    }

    const allowed = new Set(SERVER_PUBLIC_SURFACE)
    const unexpected: string[] = []
    for (const [specifier, sites] of [...actual.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (!allowed.has(specifier)) {
        unexpected.push(...sites.map((site) => `${site}: ${specifier} — not on the audited server surface`))
      }
    }
    expect(unexpected, 'importing a server module outside SERVER_PUBLIC_SURFACE needs an audited seam first').toEqual(
      [],
    )

    const stale: string[] = []
    for (const specifier of SERVER_PUBLIC_SURFACE) {
      if (!actual.has(specifier)) {
        stale.push(`${specifier}: listed but no consuming site exists — drop the stale row`)
      }
    }
    expect(stale, 'the surface list must match reality exactly').toEqual([])
  })

  it('the kobato app boots through startKobato and reaches the server package only through the composition root and the SEA VFS seam', () => {
    const entry = readFileSync(join(REPO_ROOT, KOBATO_ENTRY), 'utf8')
    expect(entry).toContain("from '@kobato/server/bootstrap/start-kobato'")
    expect(entry).toMatch(/await startKobato\(\{\s*assetsRoot: clientAssetsRoot\(\),/)
    expect(entry).toContain("{ mode: 'bind' }")
    expect(entry).toContain("{ mode: 'host', server: getViteDevServer()?.httpServer ?? null }")
    expect(
      entry,
      'the dev host loads this graph through ssrLoadModule, whose compat runner has hmr: false — import.meta.hot is ' +
        'undefined here, so an accept() boundary is dead code and the run-once guards live in the dev-host state store',
    ).not.toContain('import.meta.hot')
    expect(entry).toMatch(/export default app\s*$/)

    const appServerImports = scanned
      .filter(({ file }) => file.startsWith('apps/kobato/src/'))
      .map(({ specifier }) => specifier)
      .filter((specifier) => specifier === '@kobato/server' || specifier.startsWith('@kobato/server/'))
    expect(
      [...new Set(appServerImports)].sort(),
      'the boot sequence and the workspace-serving app live in @kobato/server (ADR-0011 §5) — the app hands over its build layout and nothing else',
    ).toEqual([...KOBATO_ENTRY_SERVER_SEAM].sort())
  })

  it('a domain repos tree is private to its domain', () => {
    const trees = [...CONSUMING_TREES, 'packages/server/src'] as const
    const offenders: string[] = []
    for (const tree of trees) {
      const files: string[] = []
      walk(join(REPO_ROOT, tree), files)
      for (const file of files.sort()) {
        const rel = file.slice(REPO_ROOT.length + 1)
        for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
          const domain = /^@kobato\/server\/domains\/([a-z-]+)\/repos\//.exec(specifier)?.[1]
          if (domain !== undefined && !rel.startsWith(`packages/server/src/domains/${domain}/`)) {
            offenders.push(`${rel}: ${specifier} — repos are private to domains/${domain}`)
          }
        }
      }
    }
    expect(offenders, 'cross-domain consumers import the domain surface, never its repos').toEqual([])
  })
})
