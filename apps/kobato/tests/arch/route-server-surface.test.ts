import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const ROUTE_GROUPS = {
  public: {
    roots: ['apps/kobato/src/root.tsx', 'apps/kobato/src/routes/public'],
    allowed: [
      '@kobato/server/http/route-cache-headers',
      '@kobato/server/http/ssr-caller',
      '@kobato/server/infra/http/headers',
      '@kobato/server/infra/http/status',
      '@kobato/server/infra/trace/config',
      '@kobato/server/infra/trace/react-router',
      '@kobato/server/render/warmup/manifest',
    ],
  },
  admin: {
    roots: ['apps/kobato/src/routes/admin', 'apps/kobato/src/routes/editor'],
    allowed: [
      '@kobato/server/domains/auth/rbac',
      '@kobato/server/http/request-context',
      '@kobato/server/http/ssr-caller',
      '@kobato/server/infra/http/status',
    ],
  },
  auth: {
    roots: ['apps/kobato/src/routes/auth'],
    allowed: [
      '@kobato/server/domains/auth/csrf',
      '@kobato/server/domains/auth/passkey/signin',
      '@kobato/server/domains/auth/schema',
      '@kobato/server/domains/auth/services/credential',
      '@kobato/server/domains/auth/services/identify',
      '@kobato/server/domains/auth/services/magic-link',
      '@kobato/server/domains/auth/services/otp',
      '@kobato/server/domains/auth/services/password-reset',
      '@kobato/server/domains/auth/services/setup',
      '@kobato/server/domains/auth/services/shared',
      '@kobato/server/domains/auth/setup-token',
      '@kobato/server/domains/comments/services/public-query',
      '@kobato/server/domains/settings/install-gate',
      '@kobato/server/http/loaders/signin',
      '@kobato/server/http/request-context',
      '@kobato/server/infra/rate-limit',
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
