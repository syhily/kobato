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

const WEB_SRC_ROOTS = ['packages/web/admin/src', 'packages/web/public/src', 'packages/web/client/src']

function packageDirs(): string[] {
  const out: string[] = []
  for (const root of ['apps', 'packages', 'tools']) {
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
    for (const root of ['apps', 'packages', 'tools']) {
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

  it('names every web hook use-kebab-case', () => {
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
    expect(offenders, 'a hook file is `use-kebab-case.ts(x)`').toEqual([])
  })

  it('suffixes every router-owning controller with .controller.ts', () => {
    const root = `${REPO_ROOT}/packages/server/src/http/controllers`
    const offenders = walk(root)
      .map((file) => relative(root, file))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.controller.ts'))
      .filter((file) => file !== 'admin/revision-shared.ts')
    expect(offenders, 'only a documented shared factory may omit the .controller.ts suffix (add it here)').toEqual([])
  })

  it('contains no doubled directory segment under any src tree', () => {
    const roots = [
      'packages/server/src',
      'packages/web/admin/src',
      'packages/web/public/src',
      'packages/web/client/src',
      'packages/ui/src',
      'packages/inkling/src',
      'packages/db/src',
      'packages/api/src',
      'packages/shared/settings/src',
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
    const root = `${REPO_ROOT}/packages/ui/src/components`
    const offenders = walk(root)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /(?:export\s+)?function\s+use[A-Z]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file))
    expect(offenders, 'a context/hook pair lives in packages/ui/src/lib, never in components/').toEqual([])
  })

  it('lets a settings section directory own its view or form file', () => {
    const root = `${REPO_ROOT}/packages/web/admin/src/ui/settings`
    expect(statSync(`${root}/cache/CacheView.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/rate-limit/ThresholdForm.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/backup/BackupView.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/mail/MailForm.tsx`).isFile()).toBe(true)
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

  it('keeps the canonical admin UI domain directories', () => {
    const root = `${REPO_ROOT}/packages/web/admin/src/ui`
    const actual = readdirSync(root, { withFileTypes: true })
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
      'tags',
      'users',
      'webmentions',
    ]
    expect(actual, 'a new admin domain directory joins this table with its API/server counterpart').toEqual(expected)
  })

  it('prefixes every admin API route with /admin', () => {
    const root = `${REPO_ROOT}/packages/api/src/rpc/admin`
    const offenders: string[] = []
    for (const file of walk(root).filter((entry) => entry.endsWith('.ts'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/path:\s*'([^']+)'/g)) {
        if (match[1].startsWith('/admin/')) {
          continue
        }
        offenders.push(`${relative(REPO_ROOT, file)}: ${match[1]}`)
      }
    }
    expect(offenders, 'every admin wire path is `/admin/<domain>/…`').toEqual([])
  })

  it('aligns the public API module names with their contract modules', () => {
    const apiRoot = `${REPO_ROOT}/packages/api/src/rpc`
    const contractRoot = `${REPO_ROOT}/packages/api/src/contracts`
    const publicModules = readdirSync(apiRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)

    const ALIASES: Record<string, string> = {
      'account.ts': 'users.ts',
      'avatar.ts': 'comments.ts',
      'passkey.ts': 'users.ts',
    }

    const orphans = publicModules.filter((name) => {
      const target = ALIASES[name] ?? name
      try {
        statSync(`${contractRoot}/${target}`)
        return false
      } catch {
        return true
      }
    })
    expect(
      orphans,
      'a public `@kobato/api/rpc/<domain>` module needs a matching `@kobato/api/contracts/<domain>` (same noun)',
    ).toEqual([])
  })
})
