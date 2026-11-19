/**
 * Web family direction guard — three leaves, one direction:
 *
 *   @kobato/web-client (browser platform) ← @kobato/web-public (public
 *   frontend) ← @kobato/web-admin (admin frontend).
 *
 * `packages/web/client/src/` holds the browser platform glue (hooks, oRPC
 * client, editor surface) that both product leaves compose; a `client/**`
 * module importing `@kobato/web-admin…` would invert that dependency and drag
 * view components into every consumer of the platform layer.
 *
 * `packages/web/public/src/` holds the public frontend (chrome, comments,
 * widgets, the cross-surface shared/lib tiers); `@kobato/web-admin`
 * (`packages/web/admin/src/`) may reuse audited public modules as long-term
 * seams — but the public leaf must never reach back into admin
 * (`@kobato/web-admin/…`) or the server.
 *
 * These are checks over the real import specifiers of the whole trees
 * (static `from`, side-effect/dynamic `import`, and `vi.mock` module paths —
 * the same shapes the package-dag scanner resolves), with NO exceptions: a
 * lower layer that needs an upper-layer module takes it over instead.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const CLIENT_ROOT = 'packages/web/client/src'
const PUBLIC_ROOT = 'packages/web/public/src'
const ADMIN_ROOT = 'packages/web/admin/src/ui'
const ADMIN_PUBLIC_IMPORTS = [
  '@kobato/web-public/ui/chrome/use-chrome-clock.ts',
  '@kobato/web-public/ui/comments/CommentContentHtml.tsx',
  '@kobato/web-public/ui/comments/LazyCommentBodyEditor.tsx',
  '@kobato/web-public/ui/comments/comment-body-helpers.ts',
  '@kobato/web-public/ui/music-player/music-player.tsx',
  '@kobato/web-public/ui/widgets/Image.tsx',
] as const

function walk(root: string, out: string[]): void {
  if (!existsSync(root)) {
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = `${root}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
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

describe('web direction', () => {
  const ADMIN_SPECIFIERS = ['@kobato/web', '@kobato/web-admin'] as const

  function isAdminSpecifier(specifier: string): boolean {
    return ADMIN_SPECIFIERS.some((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
  }

  it('keeps the platform below the product leaves: no client module imports anything from @kobato/web-admin', () => {
    const files: string[] = []
    walk(`${REPO_ROOT}/${CLIENT_ROOT}`, files)

    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files.sort()) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (isAdminSpecifier(specifier)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the public leaf below admin: no public module imports @kobato/web-admin or @kobato/server', () => {
    const files: string[] = []
    walk(`${REPO_ROOT}/${PUBLIC_ROOT}`, files)

    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files.sort()) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (isAdminSpecifier(specifier) || specifier === '@kobato/server' || specifier.startsWith('@kobato/server/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps admin reuse of public components on the audited module set', () => {
    const files: string[] = []
    walk(`${REPO_ROOT}/${ADMIN_ROOT}`, files)

    const actual = new Set<string>()
    for (const file of files.sort()) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (
          specifier.startsWith('@kobato/web-public/ui/') &&
          !specifier.startsWith('@kobato/web-public/ui/shared/') &&
          !specifier.startsWith('@kobato/web-public/ui/lib/')
        ) {
          actual.add(specifier)
        }
      }
    }

    expect([...actual].sort()).toEqual([...ADMIN_PUBLIC_IMPORTS].sort())
  })
})
