/**
 * Server-internal layer + cross-domain DAG guard.
 *
 * `packages/server/AGENTS.md` pins the one-way server graph: `infra/` is the
 * technical-leaf layer, `domains/` sits on `infra/` plus the shared leaf
 * packages, `http/` and `render/` orchestrate domains, and `bootstrap/` is
 * the composition root. Package-level edges are enforced by
 * `package-dag.test.ts`; its "product source trees use package-root imports"
 * rule keeps every intra-server specifier package-anchored
 * (`@kobato/server/...`), so this guard can read the real import graph
 * textually — static `from`, side-effect and dynamic `import()`, value and
 * type imports alike (any `from`/`import` shape counts):
 *
 *  a. no relative specifier inside `packages/server/src` — the completeness
 *     precondition for the graph below (package-dag pins the same rule; it is
 *     re-asserted here because this file's edges are built from it);
 *  b. `infra/*` imports no `domains/`, `http/`, `render/`, `bootstrap/` module;
 *  c. `domains/*` imports no `bootstrap/`, `http/`, `render/` module;
 *  d. `render/*` imports no `http/` module, and its domain consumers equal
 *     the audited RENDER_DOMAIN_IMPORTS module-pair set exactly;
 *  e. cross-domain edges equal ALLOWED_CROSS_DOMAIN_IMPORTS exactly — every
 *     discovered edge is allowlisted, every allowlisted edge exists, and
 *     every domain folder carries an allowlist line.
 *
 * `bootstrap/*` (composition root) and `http/*` (perimeter) may reach every
 * lower layer by design; same-domain imports are free; `src/assets/` holds
 * static asset blobs rather than code and, like the package root, sits
 * outside the layer graph.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const SERVER_SRC = `${REPO_ROOT}/packages/server/src`
const SERVER_SPECIFIER = '@kobato/server/'

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
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

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

interface Classified {
  layer: string | null
  domain: string | null
}

function classify(serverPath: string): Classified {
  if (serverPath.startsWith('domains/')) {
    return { layer: 'domains', domain: serverPath.slice('domains/'.length).split('/')[0] }
  }
  const layer = ['infra', 'http', 'render', 'bootstrap', 'assets'].find((entry) => serverPath.startsWith(`${entry}/`))
  return layer === undefined ? { layer: null, domain: null } : { layer, domain: null }
}

const scanned = walk(SERVER_SRC, [])
  .sort()
  .flatMap((file) => {
    const path = relative(SERVER_SRC, file)
    const source = classify(path)
    return importSpecifiers(stripComments(readFileSync(file, 'utf8'))).map((specifier) => ({
      path,
      specifier,
      source,
      target: specifier.startsWith(SERVER_SPECIFIER) ? classify(specifier.slice(SERVER_SPECIFIER.length)) : null,
    }))
  })

function offendersOf(entries: typeof scanned): string[] {
  return entries.map((entry) => `packages/server/src/${entry.path}: ${entry.specifier}`)
}

const RENDER_DOMAIN_IMPORTS: Record<string, readonly string[]> = {
  'feed/generator.tsx': [
    'domains/content/services/body-html',
    'domains/posts/services/feed',
    'domains/taxonomies/categories/services/query',
    'domains/taxonomies/tags/service',
  ],
  'og/assets.ts': ['domains/assets/services/routes'],
  'seo/listing-seo.ts': ['domains/content/urls'],
  'seo/sitemap.ts': ['domains/pages/services/public-query', 'domains/posts/services/public-query'],
  'warmup/content-cache.ts': ['domains/content/render-warmup'],
}

const ALLOWED_CROSS_DOMAIN_IMPORTS: Record<string, readonly string[]> = {
  analytics: [],
  audit: [],
  backup: [],
  newsletter: [],
  observability: [],
  settings: [],
  update: [],
  assets: ['settings'],
  auth: ['audit', 'settings'],
  comments: ['analytics', 'audit', 'auth', 'content'],
  content: ['auth', 'images', 'settings'],
  fonts: ['settings'],
  friends: ['images'],
  images: ['auth'],
  music: ['auth'],
  notifications: ['auth'],
  pages: ['content', 'images'],
  posts: ['auth', 'comments', 'content', 'images'],
  storage: ['assets', 'audit'],
  taxonomies: ['auth', 'content', 'images', 'posts'],
  users: ['auth'],
  webmentions: ['content', 'pages', 'posts'],
}
describe('server layers', () => {
  it('keeps every intra-server import package-anchored (no relative specifier)', () => {
    const offenders = offendersOf(scanned.filter((entry) => entry.specifier.startsWith('.')))
    expect(
      offenders,
      'a relative import would hide its edge from this graph — import through @kobato/server/… (package-dag pins the same rule)',
    ).toEqual([])
  })

  it('infra imports no domains/http/render/bootstrap module', () => {
    const banned = new Set(['domains', 'http', 'render', 'bootstrap'])
    const offenders = offendersOf(
      scanned.filter(
        (entry) =>
          entry.source.layer === 'infra' &&
          entry.target !== null &&
          entry.target.layer !== null &&
          banned.has(entry.target.layer),
      ),
    )
    expect(offenders, 'infra is the technical-leaf layer — it must know no upper module').toEqual([])
  })

  it('domains import no bootstrap/http/render module', () => {
    const banned = new Set(['bootstrap', 'http', 'render'])
    const offenders = offendersOf(
      scanned.filter(
        (entry) =>
          entry.source.layer === 'domains' &&
          entry.target !== null &&
          entry.target.layer !== null &&
          banned.has(entry.target.layer),
      ),
    )
    expect(offenders, 'composition roots and perimeters wire domains, never the reverse').toEqual([])
  })

  it('render imports no http module', () => {
    const offenders = offendersOf(
      scanned.filter((entry) => entry.source.layer === 'render' && entry.target?.layer === 'http'),
    )
    expect(offenders, 'render output never crosses the HTTP perimeter').toEqual([])
  })

  it('render domain consumers equal the audited module table exactly', () => {
    const actual = new Map<string, string[]>()
    for (const entry of scanned) {
      if (entry.source.layer !== 'render') {
        continue
      }
      const targetDomain = entry.target?.domain ?? null
      if (targetDomain === null) {
        continue
      }
      const file = entry.path.slice('render/'.length)
      const sites = actual.get(file) ?? []
      sites.push(entry.specifier.slice(SERVER_SPECIFIER.length))
      actual.set(file, sites)
    }

    const unexpected: string[] = []
    for (const [file, targets] of actual) {
      for (const target of targets) {
        if (!RENDER_DOMAIN_IMPORTS[file]?.includes(target)) {
          unexpected.push(`render/${file}: @kobato/server/${target} — not in RENDER_DOMAIN_IMPORTS`)
        }
      }
    }
    expect(unexpected, 'a new render→domains seam needs a RENDER_DOMAIN_IMPORTS row after auditing').toEqual([])

    const stale: string[] = []
    for (const [file, targets] of Object.entries(RENDER_DOMAIN_IMPORTS)) {
      for (const target of targets) {
        if (!actual.get(file)?.includes(target)) {
          stale.push(`render/${file}: @kobato/server/${target} — table row no longer matches reality`)
        }
      }
    }
    expect(stale, 'drop the stale RENDER_DOMAIN_IMPORTS row').toEqual([])
  })

  it('every domain folder carries an allowlist line', () => {
    const folders = readdirSync(`${SERVER_SRC}/domains`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(
      folders,
      'a new domain folder needs an ALLOWED_CROSS_DOMAIN_IMPORTS row before it may import siblings',
    ).toEqual(Object.keys(ALLOWED_CROSS_DOMAIN_IMPORTS).sort())
  })

  it('cross-domain edges equal the audited allowlist exactly', () => {
    const actual = new Map<string, string[]>()
    for (const entry of scanned) {
      if (entry.source.domain === null) {
        continue
      }
      const targetDomain = entry.target?.domain ?? null
      if (targetDomain === null || targetDomain === entry.source.domain) {
        continue
      }
      const key = `${entry.source.domain}->${targetDomain}`
      const sites = actual.get(key) ?? []
      sites.push(`packages/server/src/${entry.path}: ${entry.specifier}`)
      actual.set(key, sites)
    }

    const unexpected: string[] = []
    for (const [key, sites] of [...actual.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const [from, to] = key.split('->')
      if (!ALLOWED_CROSS_DOMAIN_IMPORTS[from]?.includes(to)) {
        unexpected.push(...sites.map((site) => `${site} — domains/${from} → domains/${to} is not allowlisted`))
      }
    }
    expect(unexpected, 'extend ALLOWED_CROSS_DOMAIN_IMPORTS only after auditing the new edge').toEqual([])

    const missing: string[] = []
    for (const [from, targets] of Object.entries(ALLOWED_CROSS_DOMAIN_IMPORTS)) {
      for (const to of targets) {
        if (!actual.has(`${from}->${to}`)) {
          missing.push(`domains/${from} → domains/${to}: allowlisted but no import site exists`)
        }
      }
    }
    expect(missing, 'drop the stale allowlist row').toEqual([])
  })
})
