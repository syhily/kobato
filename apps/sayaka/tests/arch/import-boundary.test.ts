import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const SRC_ROOT = 'apps/sayaka/src'

function sourceFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

const BANNED_SPECIFIERS = [
  '@kobato/server',
  '@kobato/db',
  '@kobato/web-admin',
  '@kobato/web-public',
  '@kobato/pack',
] as const

describe('sayaka import boundary', () => {
  it('never imports the kobato app, its aliases, the server, the db, the admin or public web packages, or pack', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC_ROOT)) {
      const source = readFileSync(full(file), 'utf8')
      for (const specifier of importSpecifiers(source)) {
        if (
          specifier.startsWith('@/') ||
          specifier.startsWith('@tests/') ||
          specifier.includes('apps/kobato') ||
          BANNED_SPECIFIERS.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('reads process.env only inside the config module and the vendored hono glue', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC_ROOT)) {
      if (file === `${SRC_ROOT}/server/config.ts` || file.startsWith(`${SRC_ROOT}/server/hono/`)) {
        continue
      }
      if (readFileSync(full(file), 'utf8').includes('process.env')) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('reads no import.meta.hot in the server graph — the dev host loads it through ssrLoadModule, whose runner has hmr: false', () => {
    const offenders = sourceFiles(`${SRC_ROOT}/server`)
      .concat(`${SRC_ROOT}/server.ts`)
      .filter((file) => readFileSync(full(file), 'utf8').includes('import.meta.hot'))
    expect(offenders, 'an HMR boundary or hot.data carrier in the server graph is dead code').toEqual([])
  })
})

function full(file: string): string {
  return join(REPO_ROOT, file)
}
