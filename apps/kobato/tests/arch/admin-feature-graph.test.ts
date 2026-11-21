import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const ADMIN_UI = join(REPO_ROOT, 'packages/web/admin/src/ui')
const UI_PREFIX = '@kobato/web-admin/ui/'
const STYLES_PREFIX = '@kobato/web-admin/styles/'

const ALLOWED_FEATURE_IMPORTS: Record<string, readonly string[]> = {
  account: ['auth', 'comments', 'sessions', 'shared'],
  analytics: [],
  audit: ['shared'],
  auth: ['shared'],
  branding: ['shared'],
  categories: ['shared'],
  comments: ['shared', 'users'],
  dashboard: ['analytics'],
  editor: ['music', 'shared', 'styles/inkling-editor.css'],
  'editor-meta': ['editor', 'editor-shell', 'shared'],
  'editor-shell': ['editor', 'editor-meta', 'shared', 'shell'],
  fonts: ['shared'],
  friends: ['shared'],
  images: ['shared'],
  jobs: ['shared'],
  music: ['shared'],
  pages: ['editor-meta', 'editor-shell', 'shared'],
  posts: ['editor-meta', 'editor-shell', 'shared'],
  sessions: ['shared'],
  settings: ['shared'],
  shared: [],
  shell: ['music', 'shared'],
  tags: ['shared'],
  users: ['shared'],
  webmentions: ['shared'],
}

function walk(root: string, out: string[]): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
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

function targetFeatureOf(specifier: string): string | null {
  if (specifier.startsWith(UI_PREFIX)) {
    return specifier.slice(UI_PREFIX.length).split('/')[0]
  }
  if (specifier.startsWith(STYLES_PREFIX)) {
    return specifier.slice('@kobato/web-admin/'.length)
  }
  return null
}

const scanned = walk(ADMIN_UI, [])
  .sort()
  .flatMap((file) => {
    const feature = file.slice(ADMIN_UI.length + 1).split('/')[0]
    return importSpecifiers(stripComments(readFileSync(file, 'utf8'))).map((specifier) => ({
      file: file.slice(REPO_ROOT.length + 1),
      feature,
      specifier,
      target: targetFeatureOf(specifier),
    }))
  })

describe('admin feature graph', () => {
  it('every ui feature folder carries an allowlist line', () => {
    const folders = readdirSync(ADMIN_UI, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(folders, 'a new feature folder needs an ALLOWED_FEATURE_IMPORTS row before it may import siblings').toEqual(
      Object.keys(ALLOWED_FEATURE_IMPORTS).sort(),
    )
  })

  it('cross-feature edges equal the audited allowlist exactly', () => {
    const actual = new Map<string, string[]>()
    for (const { file, feature, specifier, target } of scanned) {
      if (target === null || target === feature) {
        continue
      }
      const key = `${feature} -> ${target}`
      const sites = actual.get(key) ?? []
      sites.push(`${file}: ${specifier}`)
      actual.set(key, sites)
    }

    const unexpected: string[] = []
    for (const [key, sites] of [...actual.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const [from, to] = key.split(' -> ')
      if (!ALLOWED_FEATURE_IMPORTS[from]?.includes(to)) {
        unexpected.push(...sites.map((site) => `${site} — ui/${key} is not allowlisted`))
      }
    }
    expect(unexpected, 'a new intra-admin feature seam needs an audited allowlist row').toEqual([])

    const stale: string[] = []
    for (const [from, targets] of Object.entries(ALLOWED_FEATURE_IMPORTS)) {
      for (const to of targets) {
        if (!actual.has(`${from} -> ${to}`)) {
          stale.push(`ui/${from} -> ${to}: allowlisted but no import site exists`)
        }
      }
    }
    expect(stale, 'drop the stale allowlist row').toEqual([])
  })

  it('the shared tier stays a hub, not a dependent of features', () => {
    const offenders = scanned
      .filter(({ feature, target }) => feature === 'shared' && target !== null && target !== 'shared')
      .map(({ file, specifier }) => `${file}: ${specifier}`)
    expect(offenders, 'ui/shared may not depend on a feature directory').toEqual([])
  })

  it('feature roots hold only directories', () => {
    const strays = readdirSync(ADMIN_UI, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => entry.name)
    expect(strays, 'a module at the ui root belongs inside a feature folder').toEqual([])
  })
})
