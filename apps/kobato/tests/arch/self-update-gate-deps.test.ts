import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { SELF_UPDATE_GATE_REASON_KEYS } from '@kobato/server/infra/sea/self-update-gate.ts'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ENTRY = 'packages/server/src/infra/sea/self-update-gate.ts'
const BANNED = [
  'packages/server/src/infra/config.ts',
  'packages/server/src/infra/i18n.ts',
  'packages/server/src/infra/http/error-descriptor.ts',
] as const

const SPECIFIER = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

const PACKAGE_SRC_ROOTS: Record<string, string> = {
  server: 'packages/server/src',
  contracts: 'packages/shared/contracts/src',
  seo: 'packages/shared/seo/src',
  lexical: 'packages/shared/lexical/src',
  utils: 'packages/shared/utils/src',
  i18n: 'packages/shared/i18n/src',
  cache: 'packages/shared/cache/src',
  settings: 'packages/shared/settings/src',
  assets: 'packages/shared/assets/src',
  sanitize: 'packages/shared/sanitize/src',
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  const pkgMatch = /^@kobato\/([\w-]+)\/(.*)$/.exec(specifier)
  if (pkgMatch && PACKAGE_SRC_ROOTS[pkgMatch[1]!] !== undefined) {
    base = resolve(process.cwd(), PACKAGE_SRC_ROOTS[pkgMatch[1]!]!, pkgMatch[2]!)
  } else if (specifier.startsWith('.')) {
    base = resolve(process.cwd(), dirname(fromFile), specifier)
  } else {
    return null
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return toPosix(relative(process.cwd(), candidate))
    }
  }
  return null
}

function importClosure(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) {
      continue
    }
    seen.add(file)
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    for (const match of source.matchAll(SPECIFIER)) {
      const resolved = resolveSpecifier(file, match[1]!)
      if (resolved !== null) {
        queue.push(resolved)
      }
    }
  }
  return seen
}

describe('server/infra/sea/self-update-gate — zero-side-effect import contract', () => {
  it('never reaches the config, translator or error-descriptor modules', () => {
    const closure = importClosure(ENTRY)

    expect(closure.size).toBeGreaterThan(3)
    expect(closure.has(ENTRY)).toBe(true)
    expect(closure.has('packages/server/src/infra/sea/sea.ts')).toBe(true)
    expect(closure.has('packages/shared/i18n/src/messages/ui/en-US.ts')).toBe(true)

    for (const banned of BANNED) {
      expect(closure.has(banned), `${ENTRY} must not import ${banned} (directly or transitively)`).toBe(false)
    }
  })

  it('reads the English baseline directly instead of the server translator', () => {
    const source = readFileSync(resolve(process.cwd(), ENTRY), 'utf8')
    expect(source).toMatch(/import\s*\{[^}]*uiMessagesEnUS[^}]*\}\s*from\s*'@kobato\/i18n\/messages\/ui\/en-US/)
    expect(source).not.toContain('@kobato/server/infra/i18n.ts')
    expect(source).not.toContain('@kobato/server/infra/http/error-descriptor.ts')
  })

  it('keeps every gate reason parameter-free (so the baseline value is the fallback)', () => {
    for (const key of SELF_UPDATE_GATE_REASON_KEYS) {
      expect(uiMessagesEnUS[key], key).not.toContain('{')
      expect(uiMessagesEnUS[key].length).toBeGreaterThan(0)
    }
  })
})
