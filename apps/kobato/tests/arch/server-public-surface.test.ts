import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const CONSUMING_TREES = [
  'apps/kobato/src',
  'apps/inkling-demo/src',
  'packages/api/src',
  'packages/db/src',
  'packages/ui/src',
  'packages/inkling/src',
  'packages/web/admin/src',
  'packages/web/public/src',
  'tools/test/src',
  'tools/trace/src',
  'tools/pack/src',
] as const

const SERVER_PUBLIC_SURFACE: readonly string[] = [
  '@kobato/server/bootstrap/db-lifecycle',
  '@kobato/server/domains/analytics/geoip/scheduler',
  '@kobato/server/domains/audit/services/scheduler',
  '@kobato/server/domains/auth/setup-token',
  '@kobato/server/domains/auth/token-purge-scheduler',
  '@kobato/server/domains/backup/scheduler',
  '@kobato/server/domains/content/scheduled-publish',
  '@kobato/server/domains/observability/provision',
  '@kobato/server/domains/observability/retention',
  '@kobato/server/domains/observability/runtime-manager',
  '@kobato/server/domains/settings/services/core',
  '@kobato/server/domains/settings/services/hydrate',
  '@kobato/server/domains/settings/services/migrate-secrets',
  '@kobato/server/domains/webmentions/inbox-scheduler',
  '@kobato/server/domains/webmentions/outbox-scheduler',
  '@kobato/server/domains/webmentions/reverify-scheduler',
  '@kobato/server/http/hono-env',
  '@kobato/server/http/leaked-response',
  '@kobato/server/http/middleware-pipeline',
  '@kobato/server/infra/cache/kv-maintenance',
  '@kobato/server/infra/config',
  '@kobato/server/infra/db/maintenance',
  '@kobato/server/infra/hono/node',
  '@kobato/server/infra/image/process-pool',
  '@kobato/server/infra/job-registry',
  '@kobato/server/infra/lifecycle',
  '@kobato/server/infra/logger',

  '@kobato/server/http/request-context',
  '@kobato/server/http/route-cache-headers',
  '@kobato/server/http/ssr-caller',
  '@kobato/server/infra/http/headers',
  '@kobato/server/infra/http/is-bot',
  '@kobato/server/infra/http/status',
  '@kobato/server/infra/trace/config',
  '@kobato/server/infra/trace/facade',
  '@kobato/server/infra/trace/metrics',
  '@kobato/server/infra/trace/react-router',
  '@kobato/server/render/warmup/manifest',

  '@kobato/server/domains/auth/csrf',
  '@kobato/server/domains/auth/rbac',
  '@kobato/server/domains/auth/services/shared',
  '@kobato/server/domains/auth/setup-token',
  '@kobato/server/domains/settings/install-gate',

  '@kobato/server/infra/sea/sea-bootstrap',
  '@kobato/server/infra/sea/sea-cli',
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
