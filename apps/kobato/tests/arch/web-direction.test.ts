import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const KIT_ROOT = 'packages/web/kit/src'
const UI_ROOT = 'packages/web/ui/src'
const WORKSPACE_UI_ROOT = 'apps/kobato/src/ui'
const API_BROWSER_ROOT = 'packages/api/src/browser'
const APP_SOURCE_ROOT = 'apps/kobato/src'
const APP_SERVER_SIDE = ['apps/kobato/src/server.ts', 'apps/kobato/src/server'] as const
const CLIENT_TREES = [
  'apps/kobato/src/routes',
  'apps/kobato/src/ui',
  'apps/kobato/src/lib',
  'apps/kobato/src/document',
  'apps/kobato/src/seo',
  'apps/kobato/src/root.tsx',
] as const

function walk(root: string, out: string[]): void {
  if (!existsSync(root)) {
    return
  }
  if (statSync(root).isFile()) {
    out.push(root)
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

function offendersImporting(roots: string[], banned: readonly string[], skip?: (file: string) => boolean): string[] {
  const files: string[] = []
  for (const root of roots) {
    walk(`${REPO_ROOT}/${root}`, files)
  }
  const scanned = skip === undefined ? files : files.filter((file) => !skip(file))

  expect(scanned.length).toBeGreaterThan(0)

  const offenders: string[] = []
  for (const file of scanned.sort()) {
    for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
      if (banned.some((scope) => specifier === scope || specifier.startsWith(`${scope}/`))) {
        offenders.push(`${file}: ${specifier}`)
      }
    }
  }
  return offenders
}

function isServerSideModule(file: string): boolean {
  const rel = relative(REPO_ROOT, file)
  return APP_SERVER_SIDE.some((entry) => rel === entry || rel.startsWith(`${entry}/`))
}

describe('web direction', () => {
  it('keeps packages/web at exactly the design system and the cross-surface kit', () => {
    const leaves = readdirSync(`${REPO_ROOT}/packages/web`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(
      leaves,
      'the workspace (admin, editor, auth SPA) is the kobato app under apps/ — packages/web holds what both apps share',
    ).toEqual(['kit', 'ui'])
  })

  it('keeps the kit below every consumer: no kit module imports @kobato/server, the sayaka app, or the kobato app', () => {
    expect(offendersImporting([KIT_ROOT], ['@kobato/server', '@sayaka/', '@/', '@tests/'])).toEqual([])
  })

  it('keeps the kobato client tree off the backend: nothing under src but server.ts and server/ imports @kobato/server, @kobato/db, @/server, or the sayaka app', () => {
    for (const entry of APP_SERVER_SIDE) {
      expect(existsSync(`${REPO_ROOT}/${entry}`), `${entry} must exist — it is the pinned server-side exception`).toBe(
        true,
      )
    }
    const appSource: string[] = []
    walk(`${REPO_ROOT}/${APP_SOURCE_ROOT}`, appSource)
    const serverSide = appSource.filter(isServerSideModule)
    expect(serverSide.length, 'the server-side exception covers real modules').toBeGreaterThan(0)

    for (const tree of CLIENT_TREES) {
      const treeFiles: string[] = []
      walk(`${REPO_ROOT}/${tree}`, treeFiles)
      expect(treeFiles.length, `${tree} must hold scanned modules`).toBeGreaterThan(0)
      for (const file of treeFiles) {
        expect(appSource, `${tree} is scanned by the client-tree pin`).toContain(file)
      }
    }

    expect(
      offendersImporting(
        [APP_SOURCE_ROOT],
        ['@kobato/server', '@kobato/db', '@/server', '@sayaka/'],
        isServerSideModule,
      ),
      'client code ships to the browser — reach the backend over @kobato/api only (ADR-0012 §2)',
    ).toEqual([])
  })

  it('keeps route title/meta resolution in the app layer: no web package, workspace module, or api browser hook imports @kobato/catalog/seo', () => {
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
