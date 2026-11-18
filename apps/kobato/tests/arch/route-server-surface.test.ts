import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const ROUTE_GROUPS = {
  public: {
    roots: ['apps/kobato/src/root.tsx', 'apps/kobato/src/routes/public'],
    allowed: [
      '@kobato/server/http/route-cache-headers.ts',
      '@kobato/server/http/ssr-caller.ts',
      '@kobato/server/infra/http/headers.ts',
      '@kobato/server/infra/http/status.ts',
      '@kobato/server/infra/trace/config.ts',
      '@kobato/server/infra/trace/react-router.ts',
      '@kobato/server/render/warmup/manifest.ts',
    ],
  },
  admin: {
    roots: ['apps/kobato/src/routes/admin', 'apps/kobato/src/routes/editor'],
    allowed: [
      '@kobato/server/domains/auth/rbac.ts',
      '@kobato/server/http/request-context.ts',
      '@kobato/server/http/ssr-caller.ts',
      '@kobato/server/infra/http/status.ts',
    ],
  },
  auth: {
    roots: ['apps/kobato/src/routes/auth'],
    allowed: [
      '@kobato/server/domains/auth/csrf.ts',
      '@kobato/server/domains/auth/passkey/signin.ts',
      '@kobato/server/domains/auth/schema.ts',
      '@kobato/server/domains/auth/services/credential.ts',
      '@kobato/server/domains/auth/services/identify.ts',
      '@kobato/server/domains/auth/services/magic-link.ts',
      '@kobato/server/domains/auth/services/otp.ts',
      '@kobato/server/domains/auth/services/password-reset.ts',
      '@kobato/server/domains/auth/services/setup.ts',
      '@kobato/server/domains/auth/services/shared.ts',
      '@kobato/server/domains/auth/setup-token.ts',
      '@kobato/server/domains/comments/services/public-query.ts',
      '@kobato/server/domains/settings/install-gate.ts',
      '@kobato/server/http/loaders/signin.ts',
      '@kobato/server/http/request-context.ts',
      '@kobato/server/infra/rate-limit.ts',
    ],
  },
} as const

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

function sourceFiles(root: string, out: string[]): void {
  if (statSync(root).isFile()) {
    out.push(root)
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

describe('route server surfaces', () => {
  for (const [name, group] of Object.entries(ROUTE_GROUPS)) {
    it(`${name} routes use exactly the audited server modules`, () => {
      const files: string[] = []
      for (const root of group.roots) {
        sourceFiles(join(REPO_ROOT, root), files)
      }
      expect(files.length).toBeGreaterThan(0)

      const actual = new Set<string>()
      for (const file of files) {
        for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
          if (specifier.startsWith('@kobato/server/')) {
            actual.add(specifier)
          }
        }
      }
      expect([...actual].sort()).toEqual([...group.allowed].sort())
    })
  }
})
