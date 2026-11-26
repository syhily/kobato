import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const KIT_ROOT = 'packages/web/kit/src'
const PUBLIC_ROOT = 'packages/web/public/src'
const ADMIN_ROOTS = ['packages/web/admin/src/ui', 'packages/web/admin/src/styles']

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

function offendersImporting(roots: string[], banned: readonly string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    walk(`${REPO_ROOT}/${root}`, files)
  }

  expect(files.length).toBeGreaterThan(0)

  const offenders: string[] = []
  for (const file of files.sort()) {
    for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
      if (banned.some((scope) => specifier === scope || specifier.startsWith(`${scope}/`))) {
        offenders.push(`${file}: ${specifier}`)
      }
    }
  }
  return offenders
}

describe('web direction', () => {
  it('keeps packages/web at exactly the two product leaves plus the cross-surface kit', () => {
    const leaves = readdirSync(`${REPO_ROOT}/packages/web`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(leaves, 'cross-leaf modules live in @kobato/web-kit; app-only runtime lives in apps/kobato').toEqual([
      'admin',
      'kit',
      'public',
    ])
  })

  it('keeps the kit below both leaves: no kit module imports @kobato/web-admin, @kobato/web-public, or @kobato/server', () => {
    expect(offendersImporting([KIT_ROOT], ['@kobato/web-admin', '@kobato/web-public', '@kobato/server'])).toEqual([])
  })

  it('keeps the public leaf below admin: no public module imports @kobato/web-admin or @kobato/server', () => {
    expect(offendersImporting([PUBLIC_ROOT], ['@kobato/web-admin', '@kobato/server'])).toEqual([])
  })

  it('keeps the admin leaf off the public leaf: no admin module imports @kobato/web-public', () => {
    expect(offendersImporting(ADMIN_ROOTS, ['@kobato/web-public'])).toEqual([])
  })

  it('keeps route title/meta resolution in the app layer: no web package imports @kobato/catalog/seo', () => {
    expect(offendersImporting([KIT_ROOT, PUBLIC_ROOT, ...ADMIN_ROOTS], ['@kobato/catalog/seo'])).toEqual([])
  })
})
