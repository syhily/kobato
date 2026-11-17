/**
 * Web package direction guard — `client/` is a LOWER layer than `ui/`.
 *
 * `packages/web/src/client/` holds the browser platform glue (hooks, oRPC
 * client, editor surface) that `packages/web/src/ui/` composes into product
 * components; the direction is strictly ui → client. A `client/**` module
 * importing `@kobato/web/ui/…` would invert that dependency and drag view
 * components into every consumer of the platform layer.
 *
 * This is one check over the real import specifiers of the whole client tree
 * (static `from`, side-effect/dynamic `import`, and `vi.mock` module paths —
 * the same shapes the package-dag scanner resolves), with NO exceptions: any
 * client module that needs a ui module must move to ui instead.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const CLIENT_ROOT = 'packages/web/src/client'

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

// Comments may quote specifiers; only real import statements count.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Whole-file match: static `from`, side-effect/dynamic `import`, and vi.mock
// module paths — the shapes a bundler or test runner would resolve.
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

describe('web direction', () => {
  it('keeps client/ below ui/: no client module imports a @kobato/web/ui module', () => {
    const files: string[] = []
    walk(`${REPO_ROOT}/${CLIENT_ROOT}`, files)

    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files.sort()) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (specifier === '@kobato/web/ui' || specifier.startsWith('@kobato/web/ui/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
