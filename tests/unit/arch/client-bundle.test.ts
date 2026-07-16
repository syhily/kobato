/**
 * Client-bundle architecture guard.
 *
 * Walks `src/ui`, `src/client` and `src/shared` — the layers whose modules
 * can reach the browser bundle — and fails if any of them value-imports a
 * Node-only specifier: a `node:*` builtin (or its bare alias), or a package
 * whose dependency chain only resolves under Node. The last leak of this
 * kind surfaced as a vite externalization warning plus a runtime break in
 * the browser (sanitize-html → postcss, fixed in 31b49a6e); this guard
 * turns the next one into a CI failure.
 *
 * Type-only imports (`import type …`) are erased at build time and ignored.
 *
 * Maintenance: when a new Node-only dependency enters devDependencies,
 * review whether it belongs in NODE_ONLY_PACKAGES below.
 *
 * Verified isomorphic and therefore intentionally NOT denied (2026-07):
 * - `isbot` — ships a `browser` export condition; used server-side only.
 * - `superjson` — pure JS, single isomorphic entry; used server-side only.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_LAYERS = ['src/ui', 'src/client', 'src/shared']

const NODE_BUILTINS = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]

interface NodeOnlyPackage {
  name: string
  reason: string
  /** Repo-relative paths allowed to import this package (documented exceptions). */
  allowedIn?: readonly string[]
}

const NODE_ONLY_PACKAGES: readonly NodeOnlyPackage[] = [
  {
    name: 'sanitize-html',
    reason: 'pulls postcss/source-map-js and node builtins',
    // The vite `sanitize-html-engine-alias` plugin swaps this specifier to
    // the DOMPurify engine for the client build (vite.config.ts).
    allowedIn: ['src/ui/lib/sanitize-html-engine.node.ts'],
  },
  // sanitize-html's transitive leak chain — not direct deps, kept pre-armed.
  { name: 'postcss', reason: 'sanitize-html transitive chain, node-only' },
  { name: 'source-map-js', reason: 'postcss transitive chain, node-only' },
  { name: 'shiki', reason: 'server-side syntax highlighting' },
  { name: 'katex', reason: 'server-side math rendering' },
  { name: 'pinyin-pro', reason: '~150KB CJK tables, server-side slug romanisation' },
  { name: 'ioredis', reason: 'data layer, server-only' },
  { name: 'pg', reason: 'data layer, server-only' },
  { name: 'drizzle-orm', reason: 'data layer, server-only' },
  { name: 'nodemailer', reason: 'mail delivery, server-only' },
  { name: 'mailgun.js', reason: 'mail delivery, node-conditional exports' },
  { name: 'bcryptjs', reason: 'auth hashing, server-only' },
  { name: 'sharp', reason: 'native binary, ssr-external' },
  { name: '@napi-rs/canvas', reason: 'native binary, ssr-external' },
  { name: 'feed', reason: 'feed generation, server-only' },
  // Not currently installed; pre-armed for the WordPress/feeds server chain.
  { name: 'fast-xml-parser', reason: 'XML parsing, server-only' },
  { name: 'lunar-typescript', reason: 'server-side calendar computation' },
]

function walk(dir: string, callback: (filePath: string) => void) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, callback)
    } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      callback(fullPath)
    }
  }
}

function relativePath(absolutePath: string): string {
  return relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/')
}

/**
 * Collect every specifier that would be emitted into the bundle: static
 * value imports, side-effect imports and dynamic imports. `import type …`
 * statements are erased by the compiler and skipped.
 */
function getValueSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  // import [type] … from '…' (default / named / namespace, possibly multiline)
  const fromRegex =
    /import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?(?:[\w$]+)?\s+from\s+['"]([^'"]+)['"]/g
  while ((match = fromRegex.exec(source)) !== null) {
    if (!match[1]) specifiers.push(match[2])
  }
  // side-effect: import '…'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g
  while ((match = sideEffectRegex.exec(source)) !== null) {
    specifiers.push(match[1])
  }
  // dynamic: import('…')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicRegex.exec(source)) !== null) {
    specifiers.push(match[1])
  }
  return specifiers
}

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true
  return NODE_BUILTINS.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

function findNodeOnlyPackage(specifier: string): NodeOnlyPackage | undefined {
  return NODE_ONLY_PACKAGES.find((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`))
}

function collectViolations(rootDir: string): string[] {
  const violations: string[] = []
  walk(rootDir, (filePath) => {
    const rel = relativePath(filePath)
    const source = readFileSync(filePath, 'utf-8')
    for (const specifier of getValueSpecifiers(source)) {
      if (isNodeBuiltin(specifier)) {
        violations.push(
          `${rel} imports node builtin '${specifier}' — node-only imports cannot ship in the client bundle`,
        )
        continue
      }
      const pkg = findNodeOnlyPackage(specifier)
      if (pkg && !(pkg.allowedIn ?? []).includes(rel)) {
        violations.push(
          `${rel} imports node-only package '${specifier}' (${pkg.reason}) — not allowed in the client bundle`,
        )
      }
    }
  })
  return violations.sort()
}

describe('client bundle guard', () => {
  for (const layer of CLIENT_LAYERS) {
    it(`${layer}/ ships no node-only imports to the browser`, () => {
      expect(collectViolations(join(PROJECT_ROOT, layer))).toEqual([])
    })
  }

  it('tripwire: reports banned value imports with file, specifier and reason', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-bundle-guard-'))
    try {
      writeFileSync(
        join(fixtureRoot, 'leak.ts'),
        [
          "import { readFileSync } from 'node:fs'",
          "import sanitizeHtml from 'sanitize-html'",
          "import 'postcss'",
          "export const load = () => import('shiki')",
          'export const x = () => readFileSync(String(sanitizeHtml))',
        ].join('\n'),
      )
      const violations = collectViolations(fixtureRoot)
      expect(violations).toHaveLength(4)
      for (const specifier of ['node:fs', 'sanitize-html', 'postcss', 'shiki']) {
        expect(
          violations.some((v) => v.includes('leak.ts') && v.includes(`'${specifier}'`)),
          `expected a violation naming leak.ts and '${specifier}'`,
        ).toBe(true)
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('tripwire: type-only imports of denied specifiers are ignored', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-bundle-guard-'))
    try {
      writeFileSync(
        join(fixtureRoot, 'types-only.ts'),
        ["import type { Options } from 'sanitize-html'", 'export type { Options }'].join('\n'),
      )
      expect(collectViolations(fixtureRoot)).toEqual([])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})
