import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SELF_UPDATE_GATE_REASON_KEYS } from '@/server/infra/self-update-gate'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

// `sea-cli` imports the gate through `kobato doctor`, whose `--version/--help`
// path must stay side-effect free. Pin the gate's whole local import closure: a
// transitive edge reaching `server/infra/config` reads NODE_ENV and can create
// a default config file.
const ENTRY = 'src/server/infra/self-update-gate.ts'
const BANNED = [
  'src/server/infra/config.ts',
  'src/server/infra/i18n.ts',
  'src/server/infra/http/error-descriptor.ts',
] as const

const SPECIFIER = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/** Resolve a local `@/` or relative specifier to a repo-relative source file. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = resolve(process.cwd(), 'src', specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = resolve(process.cwd(), dirname(fromFile), specifier)
  } else {
    return null
  }
  for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = `${base}${suffix}`
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return toPosix(relative(process.cwd(), candidate))
    }
  }
  return null
}

/** Every repo-local module reachable from `entry` through static imports. */
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

describe('server/infra/self-update-gate — zero-side-effect import contract', () => {
  it('never reaches the config, translator or error-descriptor modules', () => {
    const closure = importClosure(ENTRY)

    // Guard the walker itself: an empty/under-resolved closure would make the
    // banned-module assertion vacuously green.
    expect(closure.size).toBeGreaterThan(3)
    expect(closure.has(ENTRY)).toBe(true)
    expect(closure.has('src/server/infra/sea.ts')).toBe(true)
    expect(closure.has('src/shared/i18n/messages/ui/en-US.ts')).toBe(true)

    for (const banned of BANNED) {
      expect(closure.has(banned), `${ENTRY} must not import ${banned} (directly or transitively)`).toBe(false)
    }
  })

  it('reads the English baseline directly instead of the server translator', () => {
    const source = readFileSync(resolve(process.cwd(), ENTRY), 'utf8')
    expect(source).toMatch(/import\s*\{[^}]*uiMessagesEnUS[^}]*\}\s*from\s*'@\/shared\/i18n\/messages\/ui\/en-US'/)
    expect(source).not.toContain('@/server/infra/i18n')
    expect(source).not.toContain('@/server/infra/http/error-descriptor')
  })

  it('keeps every gate reason parameter-free (so the baseline value is the fallback)', () => {
    for (const key of SELF_UPDATE_GATE_REASON_KEYS) {
      expect(uiMessagesEnUS[key], key).not.toContain('{')
      expect(uiMessagesEnUS[key].length).toBeGreaterThan(0)
    }
  })
})
