import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const KIT_ROOT = 'packages/web/kit/src'
const UI_ROOT = 'packages/web/ui/src'
const WORKSPACE_UI_ROOT = 'apps/kobato/src/ui'
const API_BROWSER_ROOT = 'packages/api/src/browser'

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
  it('keeps packages/web at exactly the design system and the cross-surface kit', () => {
    const leaves = readdirSync(`${REPO_ROOT}/packages/web`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(leaves, 'sayaka is the public site — an app under apps/; the admin UI lives in apps/kobato/src/ui').toEqual([
      'kit',
      'ui',
    ])
  })

  it('keeps the kit below every consumer: no kit module imports @kobato/server or the sayaka app', () => {
    expect(offendersImporting([KIT_ROOT], ['@kobato/server', '@sayaka/'])).toEqual([])
  })

  it('keeps the workspace UI tree off the sayaka app: no apps/kobato/src/ui module imports @sayaka/', () => {
    expect(offendersImporting([WORKSPACE_UI_ROOT], ['@sayaka/'])).toEqual([])
  })

  it('keeps route title/meta resolution in the app layer: no web package, workspace UI module, or api browser hook imports @kobato/catalog/seo', () => {
    expect(
      offendersImporting([KIT_ROOT, UI_ROOT, WORKSPACE_UI_ROOT, API_BROWSER_ROOT], ['@kobato/catalog/seo']),
    ).toEqual([])
  })

  it('keeps root route data behind the document shell: no web package module or api browser hook reads useRouteLoaderData', () => {
    const files: string[] = []
    for (const root of [KIT_ROOT, UI_ROOT, API_BROWSER_ROOT]) {
      walk(`${REPO_ROOT}/${root}`, files)
    }

    const offenders = files
      .filter((file) => /\buseRouteLoaderData\b/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(REPO_ROOT, file))
      .sort()

    expect(
      offenders,
      "a shared hook takes document facts from @kobato/ui/lib/document-facts-context, and an api browser hook never reads a consumer's route data",
    ).toEqual([])
  })
})
