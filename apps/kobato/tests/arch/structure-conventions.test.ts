/**
 * Directory-convention guard — pins the layout rules documented in
 * `packages/server/AGENTS.md`, `packages/web/AGENTS.md`,
 * `packages/web/admin/src/ui/AGENTS.md`, `packages/inkling/AGENTS.md`, and
 * `packages/ui/AGENTS.md`.
 *
 * These are the structural rules that a rename or a new file can silently
 * break; behavior is covered by the other arch guards. Four groups:
 *
 *  a. module naming — hooks are `use-kebab-case`, controller files end in
 *     `.controller.ts`, no doubled directory segment anywhere in `src/`;
 *  b. layer placement — UI `components/` never exports a hook, settings section
 *     directories own their view/form file, the server `http/utils` trio stays
 *     the only `utils/` drawer;
 *  c. test-tree layout — `tests/utils/` holds helpers only;
 *  d. domain naming — the admin UI directory set and the `@kobato/api` admin
 *     route prefix table match the canonical domain names exactly.
 */
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

describe('structure conventions', () => {
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
      'packages/shared/contracts/src',
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

    // `tasks/` is the operator-facing name for the `jobs` wire group (route
    // `/admin/tasks`, copy `admin.tasks.*`); `editor*`/`shell`/`shared` are
    // composition tiers, not domains.
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
      'music',
      'pages',
      'posts',
      'sessions',
      'settings',
      'shared',
      'shell',
      'tags',
      'tasks',
      'users',
      'webmentions',
    ]
    expect(actual, 'a new admin domain directory joins this table with its API/server counterpart').toEqual(expected)
  })

  it('prefixes every admin API route with /admin except the documented wire exceptions', () => {
    const root = `${REPO_ROOT}/packages/api/src/admin`
    const exceptions: Record<string, readonly string[]> = {
      'comments.ts': ['/comment-admin/'],
      'webmentions.ts': ['/webmention-admin/'],
    }
    const offenders: string[] = []
    for (const file of walk(root).filter((entry) => entry.endsWith('.ts'))) {
      const name = relative(root, file)
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/path:\s*'([^']+)'/g)) {
        const path = match[1]
        if (path.startsWith('/admin/')) {
          continue
        }
        if (exceptions[name]?.some((prefix) => path.startsWith(prefix))) {
          continue
        }
        offenders.push(`${relative(REPO_ROOT, file)}: ${path}`)
      }
    }
    expect(offenders, 'admin wire paths are `/admin/<domain>/…` or a documented exception').toEqual([])
  })

  it('aligns the public API module names with their contract modules', () => {
    const apiRoot = `${REPO_ROOT}/packages/api/src`
    const contractRoot = `${REPO_ROOT}/packages/shared/contracts/src`
    const publicModules = readdirSync(apiRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .filter((name) => name !== 'contract.ts')

    // Documented aliases: these wire groups reuse the contract family they serve.
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
      'a public `@kobato/api/<domain>.ts` module needs a matching `@kobato/contracts/<domain>.ts` (same noun)',
    ).toEqual([])
  })
})
