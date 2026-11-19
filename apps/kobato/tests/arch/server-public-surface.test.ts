/**
 * The external surface of `@kobato/server`.
 *
 * The package's exports map stays `./*` (its own src imports itself through
 * the package root), so nothing structural narrows what other packages may
 * reach. This guard is the contract instead: every `@kobato/server/...`
 * module imported from a non-server product tree must be on the audited
 * list below, and every listed module must actually be consumed — the same
 * exact-set discipline as `server-layers.test.ts`.
 *
 * The list is organized by consuming seam:
 *
 *  - `apps/kobato/src/server.ts` boot wiring (schedulers, lifecycles, config);
 *  - the SSR entry/root pair (`entry.server.tsx`, `root.tsx`);
 *  - the audited route groups — `route-server-surface.test.ts` pins the
 *    finer per-group lists inside `src/routes/`;
 *  - build-time tools: the email preview generator (`tools/email`) and the
 *    SEA packer (`tools/pack`).
 *
 * A new entry is a deliberate architecture change: audit the seam first, then
 * extend the list — importing server internals ad hoc is exactly what this
 * guard exists to prevent.
 */
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
  'packages/web/client/src',
  'packages/web/public/src',
  'tools/toolchain/src',
  'tools/test/src',
  'tools/harness/src',
  'tools/browser/src',
  'tools/email/src',
  'tools/i18n/src',
  'tools/trace/src',
  'tools/pack/src',
] as const

const SERVER_PUBLIC_SURFACE: readonly string[] = [
  // composition root + boot wiring (apps/kobato/src/server.ts)
  '@kobato/server/bootstrap/db-lifecycle.ts',
  '@kobato/server/domains/analytics/geoip/scheduler.ts',
  '@kobato/server/domains/audit/services/scheduler.ts',
  '@kobato/server/domains/auth/setup-token.ts',
  '@kobato/server/domains/auth/token-purge-scheduler.ts',
  '@kobato/server/domains/backup/scheduler.ts',
  '@kobato/server/domains/content/scheduled-publish.ts',
  '@kobato/server/domains/observability/provision.ts',
  '@kobato/server/domains/observability/retention.ts',
  '@kobato/server/domains/observability/runtime-manager.ts',
  '@kobato/server/domains/settings/services/core.ts',
  '@kobato/server/domains/settings/services/hydrate.ts',
  '@kobato/server/domains/settings/services/migrate-secrets.ts',
  '@kobato/server/domains/webmentions/inbox-scheduler.ts',
  '@kobato/server/domains/webmentions/outbox-scheduler.ts',
  '@kobato/server/domains/webmentions/reverify-scheduler.ts',
  '@kobato/server/http/hono-env.ts',
  '@kobato/server/http/leaked-response.ts',
  '@kobato/server/http/middleware-pipeline.ts',
  '@kobato/server/infra/cache/kv-maintenance.ts',
  '@kobato/server/infra/config.ts',
  '@kobato/server/infra/db/maintenance.ts',
  '@kobato/server/infra/hono/node.ts',
  '@kobato/server/infra/image/process-pool.ts',
  '@kobato/server/infra/job-registry.ts',
  '@kobato/server/infra/lifecycle.ts',
  '@kobato/server/infra/logger.ts',

  // SSR entry + root document (entry.server.tsx, root.tsx)
  '@kobato/server/http/request-context.ts',
  '@kobato/server/http/route-cache-headers.ts',
  '@kobato/server/http/ssr-caller.ts',
  '@kobato/server/infra/http/headers.ts',
  '@kobato/server/infra/http/is-bot.ts',
  '@kobato/server/infra/http/status.ts',
  '@kobato/server/infra/trace/config.ts',
  '@kobato/server/infra/trace/facade.ts',
  '@kobato/server/infra/trace/metrics.ts',
  '@kobato/server/infra/trace/react-router.ts',
  '@kobato/server/render/warmup/manifest.ts',

  // audited route groups (route-server-surface.test.ts owns the per-group pin)
  '@kobato/server/domains/auth/csrf.ts',
  '@kobato/server/domains/auth/passkey/signin.ts',
  '@kobato/server/domains/auth/rbac.ts',
  '@kobato/server/domains/auth/schema.ts',
  '@kobato/server/domains/auth/services/credential.ts',
  '@kobato/server/domains/auth/services/identify.ts',
  '@kobato/server/domains/auth/services/magic-link.ts',
  '@kobato/server/domains/auth/services/otp.ts',
  '@kobato/server/domains/auth/services/password-reset.ts',
  '@kobato/server/domains/auth/services/setup.ts',
  '@kobato/server/domains/auth/services/shared.ts',
  '@kobato/server/domains/comments/services/public-query.ts',
  '@kobato/server/domains/settings/install-gate.ts',
  '@kobato/server/http/loaders/signin.ts',
  '@kobato/server/infra/rate-limit.ts',

  // build-time tooling (tools/email preview generator, tools/pack SEA runtime)
  '@kobato/server/infra/email/render.tsx',
  '@kobato/server/infra/email/templates/AdminNotificationEmail.tsx',
  '@kobato/server/infra/email/templates/ApprovedComment.tsx',
  '@kobato/server/infra/email/templates/AuthorInvite.tsx',
  '@kobato/server/infra/email/templates/ConfirmSubscription.tsx',
  '@kobato/server/infra/email/templates/NewReply.tsx',
  '@kobato/server/infra/email/templates/PasswordReset.tsx',
  '@kobato/server/infra/email/templates/SignInLink.tsx',
  '@kobato/server/infra/email/templates/SignInOtp.tsx',
  '@kobato/server/infra/i18n.ts',
  '@kobato/server/infra/sea/sea-bootstrap.ts',
  '@kobato/server/infra/sea/sea-cli.ts',
  '@kobato/server/infra/sea/sea.ts',
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
