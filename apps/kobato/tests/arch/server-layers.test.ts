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

  it('domains, loaders, and controllers know no frontend framework and throw no Response control flow', () => {
    const inScope = (path: string) =>
      path.startsWith('domains/') || path.startsWith('http/loaders/') || path.startsWith('http/controllers/')
    const bannedSpecifiers = new Set(['react-router', '@kobato/server/infra/http/status'])
    const bannedImports = offendersOf(
      scanned.filter((entry) => inScope(entry.path) && bannedSpecifiers.has(entry.specifier)),
    )
    expect(
      bannedImports,
      'domains, http/loaders, and http/controllers are framework-free (ADR-0009 §11) — loaders return the content signal union instead of throwing Response control flow',
    ).toEqual([])

    const bannedPatterns = [/throw\s+redirect\(/, /throw\s+new\s+Response\(/, /\bnotFound\(/, /\bredirectPermanent\(/]
    const probeSnippets = [
      "throw redirect('/admin/setup', { status: 303 })",
      "throw new Response('Not Found', { status: 404 })",
      'notFound()',
      "redirectPermanent('/posts/x')",
    ]
    for (const snippet of probeSnippets) {
      expect(
        bannedPatterns.some((pattern) => pattern.test(snippet)),
        `the control-flow pin must catch: ${snippet}`,
      ).toBe(true)
    }

    const controlFlow: string[] = []
    for (const file of walk(SERVER_SRC, [])) {
      const path = relative(SERVER_SRC, file)
      if (!inScope(path)) {
        continue
      }
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const pattern of bannedPatterns) {
        if (pattern.test(source)) {
          controlFlow.push(`packages/server/src/${path}: matches ${pattern.source}`)
        }
      }
    }
    expect(
      controlFlow,
      'procedure control flow is wire-shaped: return a ContentRedirectSignal or throw ORPCError — never a Response (ADR-0009 §11)',
    ).toEqual([])
  })
})
