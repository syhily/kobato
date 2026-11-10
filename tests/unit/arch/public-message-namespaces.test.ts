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

import { uiMessagesForScope } from '@/shared/i18n/catalog'
import { PUBLIC_MESSAGE_PREFIXES, isPublicMessageKey } from '@/shared/i18n/catalog-scope'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

const PROJECT_ROOT = process.cwd()
const SRC_ROOT = join(PROJECT_ROOT, 'src')

/** Route trees whose modules render public documents. */
const PUBLIC_ENTRY_DIRS = ['src/routes/public'] as const

/** Server-only subtrees: these never render client copy from the shipped catalog. */
const SERVER_ONLY_PREFIXES = ['src/server/'] as const

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
    base = join(SRC_ROOT, specifier.slice(2))
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

/** Every source file the public browser graph can reach. */
function collectPublicGraph(): Map<string, string> {
  const entries: string[] = [join(PROJECT_ROOT, 'src/root.tsx')]
  for (const dir of PUBLIC_ENTRY_DIRS) {
    const files: string[] = []
    listSources(join(PROJECT_ROOT, dir), files)
    entries.push(...files)
  }

  const reached = new Map<string, string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    const rel = relative(PROJECT_ROOT, file)
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
          offenders.push(`${relative(PROJECT_ROOT, file)} → ${key}`)
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
