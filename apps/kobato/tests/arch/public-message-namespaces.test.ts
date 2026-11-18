import { PUBLIC_MESSAGE_PREFIXES, isPublicMessageKey } from '@kobato/i18n/catalog-scope.ts'
import { uiMessagesForScope } from '@kobato/i18n/catalog.ts'
import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
/**
 * Public message-namespace architecture guard.
 *
 * The public bootstrap ships an explicit allowlist (`PUBLIC_MESSAGE_PREFIXES`),
 * not "everything except `admin.*`". This scan is the other half of that
 * contract: every message id the PUBLIC module graph can resolve must be in the
 * allowlist, so a public component cannot start depending on a workspace-only
 * namespace and silently render a missing message at runtime.
 *
 * The graph is walked from the real public entry points (the public route tree
 * + the root document) through static AND dynamic imports, stopping at
 * server-only modules and packages — the same shape the client bundler follows.
 * Admin/editor route trees are deliberately absent: they get the full catalog.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const APP_SRC = join(REPO_ROOT, 'apps/kobato/src')

/** Workspace package name → source root (repo-relative). */
const PACKAGE_SRC: Record<string, string> = {
  '@kobato/web-admin': 'packages/web/admin/src',
  '@kobato/web-client': 'packages/web/client/src',
  '@kobato/web-public': 'packages/web/public/src',
  '@kobato/ui': 'packages/ui/src',
  '@kobato/contracts': 'packages/shared/contracts/src',
  '@kobato/seo': 'packages/shared/seo/src',
  '@kobato/lexical': 'packages/shared/lexical/src',
  '@kobato/utils': 'packages/shared/utils/src',
  '@kobato/i18n': 'packages/shared/i18n/src',
  '@kobato/cache': 'packages/shared/cache/src',
  '@kobato/settings': 'packages/shared/settings/src',
  '@kobato/assets': 'packages/shared/assets/src',
  '@kobato/sanitize': 'packages/shared/sanitize/src',
  '@kobato/inkling': 'packages/inkling/src',
  '@kobato/test': 'tools/test/src',
}

/** Route trees whose modules render public documents. */
const PUBLIC_ENTRY_DIRS = ['apps/kobato/src/routes/public'] as const

/** Server-only subtrees: these never render client copy from the shipped catalog. */
const SERVER_ONLY_PREFIXES = ['packages/server/src/'] as const

const CATALOG_KEYS = new Set(Object.keys(uiMessagesEnUS))

function listSources(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      listSources(path, out)
    } else if (/\.(ts|tsx)$/.test(path)) {
      out.push(path)
    }
  }
}

/** Static + side-effect + dynamic import specifiers (type-only imports are erased). */
function valueSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const fromRegex =
    /import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?(?:[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(fromRegex)) {
    if (match[1] === undefined) {
      specifiers.push(match[2]!)
    }
  }
  for (const match of source.matchAll(/import\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1]!)
  }
  for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(APP_SRC, specifier.slice(2))
  } else if (specifier === '@kobato/server' || specifier.startsWith('@kobato/server/')) {
    // Server-only package: never part of the public browser graph.
    return null
  } else if (specifier === '@kobato/inkling') {
    base = join(REPO_ROOT, 'packages/inkling/src/index')
  } else if (specifier === '@kobato/inkling/headless') {
    base = join(REPO_ROOT, 'packages/inkling/src/headless')
  } else if (specifier.startsWith('@kobato/')) {
    const [scope, name, ...rest] = specifier.split('/')
    const packageSrc = PACKAGE_SRC[`${scope}/${name}`]
    if (!packageSrc || rest.length === 0) {
      return null
    }
    base = join(REPO_ROOT, packageSrc, rest.join('/'))
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier)
  } else {
    return null
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

/** Repo-relative, POSIX-separated path. */
function repoRelative(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/')
}

/** Every source file the public browser graph can reach. */
function collectPublicGraph(): Map<string, string> {
  const entries: string[] = [join(APP_SRC, 'root.tsx')]
  for (const dir of PUBLIC_ENTRY_DIRS) {
    const files: string[] = []
    listSources(join(REPO_ROOT, dir), files)
    entries.push(...files)
  }

  const reached = new Map<string, string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    const rel = repoRelative(file)
    if (reached.has(file) || SERVER_ONLY_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      continue
    }
    const source = readFileSync(file, 'utf8')
    reached.set(file, source)
    for (const specifier of valueSpecifiers(source)) {
      const resolved = resolveSpecifier(file, specifier)
      if (resolved !== null && !reached.has(resolved)) {
        queue.push(resolved)
      }
    }
  }
  return reached
}

/** Every catalog key appearing as a plain string literal. */
function referencedMessageKeys(source: string): string[] {
  const keys: string[] = []
  for (const match of source.matchAll(/'([^'\n]+)'/g)) {
    const candidate = match[1]!
    if (CATALOG_KEYS.has(candidate)) {
      keys.push(candidate)
    }
  }
  return keys
}

describe('public message namespaces', () => {
  it('never references a workspace-only message key from the public module graph', () => {
    const offenders: string[] = []
    for (const [file, source] of collectPublicGraph()) {
      for (const key of referencedMessageKeys(source)) {
        if (!isPublicMessageKey(key)) {
          offenders.push(`${repoRelative(file)} → ${key}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps every allowlist entry non-empty and backed by real catalog keys', () => {
    for (const prefix of PUBLIC_MESSAGE_PREFIXES) {
      const matches = [...CATALOG_KEYS].filter((key) => key.startsWith(prefix))
      expect(matches.length, `no catalog key starts with '${prefix}'`).toBeGreaterThan(0)
    }
  })

  it('does not let the allowlist grow into a workspace family by accident', () => {
    // Structural guard: the allowlist is a small registry, not a catch-all.
    expect(PUBLIC_MESSAGE_PREFIXES.length).toBeLessThanOrEqual(10)
    for (const prefix of PUBLIC_MESSAGE_PREFIXES) {
      expect(prefix.endsWith('.'), prefix).toBe(true)
    }
  })

  it('resolves the public catalog to the same key set for every locale', () => {
    const englishPublic = Object.keys(uiMessagesEnUS)
      .filter((key) => isPublicMessageKey(key))
      .sort()
    expect(englishPublic.length).toBeGreaterThan(0)
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(uiMessagesForScope(locale, 'public')).sort(), locale).toEqual(englishPublic)
    }
  })
})
