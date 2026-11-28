import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

function dirsOf(root: string): string[] {
  const out: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const full = join(dir, entry.name)
      out.push(relative(REPO_ROOT, full))
      visit(full)
    }
  }
  visit(root)
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const UI_ROOT = 'apps/kobato/src/ui'

const WEB_SRC_ROOTS = ['packages/web/ui/src', 'packages/web/kit/src', 'apps/kobato/src/ui', 'packages/api/src/browser']

function packageDirs(): string[] {
  const out: string[] = []
  for (const root of ['apps', 'packages', 'shared', 'tools']) {
    for (const file of walk(`${REPO_ROOT}/${root}`)) {
      if (file.endsWith('/package.json') && !file.includes('/node_modules/')) {
        out.push(file.slice(0, -'/package.json'.length))
      }
    }
  }
  return out.sort()
}

describe('structure conventions', () => {
  it('gives every workspace package an AGENTS.md', () => {
    const missing = packageDirs()
      .filter((dir) => {
        try {
          return !statSync(`${dir}/AGENTS.md`).isFile()
        } catch {
          return true
        }
      })
      .map((dir) => relative(REPO_ROOT, dir))
    expect(missing, 'a workspace package documents its own conventions in AGENTS.md').toEqual([])
  })

  it('keeps configuration and test files out of src', () => {
    const offenders: string[] = []
    for (const root of ['apps', 'packages', 'shared', 'tools']) {
      for (const file of walk(`${REPO_ROOT}/${root}`)) {
        if (!file.includes('/src/') || file.includes('/node_modules/')) {
          continue
        }
        const name = file.slice(file.lastIndexOf('/') + 1)
        if (/\.test\.tsx?$/.test(name) || ['vite.config.ts', 'vitest.config.ts', 'tsconfig.json'].includes(name)) {
          offenders.push(relative(REPO_ROOT, file))
        }
      }
    }
    expect(offenders, 'config lives at the package root; tests live under tests/').toEqual([])
  })

  it('names every hook use-kebab-case across the web packages and the api browser assembly', () => {
    const offenders: string[] = []
    for (const root of WEB_SRC_ROOTS) {
      for (const file of walk(`${REPO_ROOT}/${root}`)) {
        if (!/\.tsx?$/.test(file)) {
          continue
        }
        const name = file.slice(file.lastIndexOf('/') + 1)
        if (/^use[A-Z]/.test(name) || /^use_[a-z]/.test(name)) {
          offenders.push(relative(REPO_ROOT, file))
        }
      }
    }
    expect(offenders, `a hook file is \`use-kebab-case.ts(x)\` under ${WEB_SRC_ROOTS.join(', ')}`).toEqual([])
  })

  it('suffixes every router-owning controller with .controller.ts', () => {
    const root = `${REPO_ROOT}/packages/server/src/http/controllers`
    const sharedFactories = new Set(['admin/revision-shared.ts', 'account/auth-shared.ts'])
    const offenders = walk(root)
      .map((file) => relative(root, file))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.controller.ts'))
      .filter((file) => !sharedFactories.has(file))
    expect(offenders, 'only a documented shared factory may omit the .controller.ts suffix (add it here)').toEqual([])
  })

  it('contains no doubled directory segment under any src tree', () => {
    const roots = [
      'apps/kobato/src',
      'packages/server/src',
      'packages/web/kit/src',
      'packages/web/ui/src',
      'packages/inkling/src',
      'packages/db/src',
      'packages/api/src',
      'shared/base/src',
      'shared/settings/src',
    ]
    const offenders: string[] = []
    for (const root of roots) {
      for (const dir of dirsOf(`${REPO_ROOT}/${root}`)) {
        const segments = dir.split('/')
        for (let i = 1; i < segments.length; i += 1) {
          if (segments[i] === segments[i - 1]) {
            offenders.push(dir)
            break
          }
        }
      }
    }
    expect(offenders, 'a directory must not be nested inside itself (transforms/transforms)').toEqual([])
  })

  it('keeps UI primitives free of hook definitions', () => {
    const root = `${REPO_ROOT}/packages/web/ui/src/components`
    const offenders = walk(root)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /(?:export\s+)?function\s+use[A-Z]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file))
    expect(offenders, 'a context/hook pair lives in packages/web/ui/src/lib, never in components/').toEqual([])
  })

  it('keeps inkling test helpers out of test trees and tests out of helper dirs', () => {
    const helperRoot = `${REPO_ROOT}/packages/inkling/tests/utils`
    const testFiles = walk(helperRoot).filter((file) => /\.test\.tsx?$/.test(file))
    expect(
      testFiles.map((file) => relative(REPO_ROOT, file)),
      'tests/utils/ holds helpers only',
    ).toEqual([])

    const strayTestDirs = dirsOf(`${REPO_ROOT}/packages/inkling/tests`).filter((dir) =>
      /(?:^|\/)(?:test-utils|utils\/utils)$/.test(dir),
    )
    expect(strayTestDirs, 'tree-local helpers are one `test-helpers.ts`, never a test-utils/ dir').toEqual([])
  })

  it('prefixes every admin route metadata path with /admin', () => {
    const root = `${REPO_ROOT}/packages/api/src/rpc/admin`
    const legacyAnalyticsRoutes = new Set([
      '/analytics/counters',
      '/analytics/views',
      '/analytics/heatmap',
      '/analytics/metrics',
      '/analytics/export',
      '/analytics/overview',
      '/analytics/mentions',
      '/analytics/events',
    ])
    const offenders: string[] = []
    for (const file of walk(root).filter((entry) => entry.endsWith('.ts'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/path:\s*'([^']+)'/g)) {
        if (match[1].startsWith('/admin/')) {
          continue
        }
        if (relative(root, file) === 'analytics.ts' && legacyAnalyticsRoutes.has(match[1])) {
          continue
        }
        offenders.push(`${relative(REPO_ROOT, file)}: ${match[1]}`)
      }
    }
    expect(
      offenders,
      'every admin route metadata path is `/admin/<domain>/…` (sole legacy exception: analytics keeps its deployed ' +
        '`/analytics/*` route metadata)',
    ).toEqual([])
  })

  it('groups every contract module into an audience layer — only generic primitives sit at the root', () => {
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const layers = new Set(['public', 'account', 'admin'])
    const offenders: string[] = []
    for (const entry of readdirSync(contractRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!layers.has(entry.name)) {
          offenders.push(entry.name)
        }
      } else if (entry.name !== 'primitives.ts') {
        offenders.push(entry.name)
      }
    }
    expect(
      offenders,
      'packages/api/src/contracts holds exactly the three audience layers — public/, account/, admin/ — plus the ' +
        'audience-free generic wire vocabulary in primitives.ts at the root, and nothing else',
    ).toEqual([])
  })

  it('aligns the rpc group module names with their contract modules', () => {
    const apiRoot = `${REPO_ROOT}/packages/api/src/rpc`
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const groups = ['public', 'account', 'admin'] as const

    const orphans: string[] = []
    for (const group of groups) {
      for (const entry of readdirSync(join(apiRoot, group), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) {
          continue
        }
        if (!statSync(`${contractRoot}/${group}/${entry.name}`, { throwIfNoEntry: false })?.isFile()) {
          orphans.push(`${group}/${entry.name}`)
        }
      }
    }
    expect(
      orphans,
      'an `@kobato/api/rpc/<group>/<domain>` module composes the same-named ' +
        '`@kobato/api/contracts/<group>/<domain>` wire vocabulary (same noun)',
    ).toEqual([])
  })

  it('gives every audience contract module an rpc counterpart in its own group', () => {
    const apiRoot = `${REPO_ROOT}/packages/api/src/rpc`
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const groups = ['public', 'account', 'admin'] as const

    const BASES: Record<(typeof groups)[number], string[]> = {
      public: [],
      account: [],
      admin: ['content-admin-base.ts'],
    }

    const orphans: string[] = []
    for (const group of groups) {
      for (const entry of readdirSync(join(contractRoot, group), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || BASES[group].includes(entry.name)) {
          continue
        }
        if (!statSync(`${apiRoot}/${group}/${entry.name}`, { throwIfNoEntry: false })?.isFile()) {
          orphans.push(`${group}/${entry.name}`)
        }
      }
    }
    expect(
      orphans,
      'a `contracts/<group>/<domain>` module serves that group’s procedures — it pairs with ' +
        '`rpc/<group>/<domain>` (sole exception: a same-layer base module listed in BASES)',
    ).toEqual([])
  })

  it('keeps the contracts dependency direction — audiences reach only downward; root primitives stay audience-free', () => {
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const layers = ['public', 'account', 'admin'] as const
    const allowed: Record<string, readonly string[]> = {
      root: [],
      public: ['public'],
      account: ['public', 'account'],
      admin: ['public', 'account', 'admin'],
    }
    const offenders: string[] = []
    for (const file of walk(contractRoot).filter((entry) => entry.endsWith('.ts'))) {
      const first = relative(contractRoot, file).split('/')[0]
      const layer = (layers as readonly string[]).includes(first) ? first : 'root'
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/@kobato\/api\/contracts\/(public|account|admin)\/[a-z0-9-]+/g)) {
        if (!allowed[layer].includes(match[1])) {
          offenders.push(`${relative(REPO_ROOT, file)} → ${match[0]}`)
        }
      }
    }
    expect(
      offenders,
      'the root primitives module imports no audience layer; public imports only itself; account may reach public; ' +
        'admin may reach public and account — cross-audience vocabulary lives in the lower layer, never duplicated ' +
        'and never shimmed',
    ).toEqual([])
  })

  it('pins no orphan contract modules — every module has at least one importer', () => {
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const referenced = new Set<string>()
    const specifier = /@kobato\/api\/contracts\/(?:(?:public|account|admin)\/)?[a-z0-9-]+/g
    const sourceFiles = ['packages', 'apps', 'shared'].flatMap((root) =>
      walk(`${REPO_ROOT}/${root}`).filter((file) => /\.tsx?$/.test(file)),
    )
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('@kobato/api/contracts/')) {
        continue
      }
      for (const match of stripComments(source).matchAll(specifier)) {
        referenced.add(match[0])
      }
    }
    const orphans = walk(contractRoot)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => relative(REPO_ROOT, file))
      .filter((rel) => {
        const id = rel.replace('packages/api/src', '@kobato/api').replace(/\.ts$/, '')
        return !referenced.has(id)
      })
    expect(orphans, 'every contracts module has at least one importer — no dead wire vocabulary').toEqual([])
  })
})

describe('workspace structure conventions', () => {
  it('lets a settings section directory own its view or form file', () => {
    const root = `${UI_ROOT}/settings`
    expect(statSync(`${REPO_ROOT}/${root}/cache/CacheView.tsx`).isFile()).toBe(true)
    expect(statSync(`${REPO_ROOT}/${root}/rate-limit/ThresholdForm.tsx`).isFile()).toBe(true)
    expect(statSync(`${REPO_ROOT}/${root}/backup/BackupView.tsx`).isFile()).toBe(true)
    expect(statSync(`${REPO_ROOT}/${root}/mail/MailForm.tsx`).isFile()).toBe(true)
  })

  it('keeps the canonical admin UI domain directories', () => {
    const actual = readdirSync(`${REPO_ROOT}/${UI_ROOT}`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    const expected = [
      'account',
      'analytics',
      'audit',
      'auth',
      'branding',
      'categories',
      'comments',
      'dashboard',
      'editor',
      'editor-meta',
      'editor-shell',
      'fonts',
      'friends',
      'images',
      'jobs',
      'music',
      'pages',
      'posts',
      'sessions',
      'settings',
      'shared',
      'shell',
      'styles',
      'tags',
      'users',
      'webmentions',
    ]
    expect(
      actual,
      'a new admin domain directory joins this table with its API/server counterpart (styles/ holds the ui style adapters)',
    ).toEqual(expected)
  })
})
