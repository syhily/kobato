/**
 * Client-bundle architecture guard: fails when the client layers value-import a
 * node-only specifier. Routes may import `@/server/*` for loaders only; keep
 * server imports out of render paths. New node-only deps go in NODE_ONLY_PACKAGES.
 *
 * The same scan enforces the i18n bundle boundary: message catalogs and the
 * server translator are SERVER-ONLY value imports. The browser receives the
 * current locale's UI catalog as root-loader data (`content.bootstrap`), and
 * `@/shared/i18n/fallback-messages` is the single synchronous exception.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_LAYERS = ['src/ui', 'src/client', 'src/routes', 'src/shared']

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
    name: 'jsdom',
    reason: 'server-side DOM for the sanitize engine and inkling headless projections',
    // Swapped client-side to the browser engine by the `sanitize-html-engine-alias` plugin (vite.config.ts).
    allowedIn: ['src/shared/sanitize/engine.node.ts'],
  },
  { name: 'shiki', reason: 'server-side syntax highlighting' },
  { name: 'katex', reason: 'server-side math rendering' },
  { name: 'pinyin-pro', reason: '~150KB CJK tables, server-side slug romanisation' },
  { name: 'pg', reason: 'data-pump script only (devDependency)' },
  { name: 'drizzle-orm', reason: 'data layer, server-only' },
  { name: 'nodemailer', reason: 'mail delivery, server-only' },
  { name: 'bcryptjs', reason: 'auth hashing, server-only' },
  { name: 'sharp', reason: 'native binary, ssr-external' },
  { name: '@napi-rs/canvas', reason: 'native binary, ssr-external' },
  { name: '@duckdb/node-api', reason: 'native binary, ssr-external' },
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
    if (!match[1]) {
      specifiers.push(match[2])
    }
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
  if (specifier.startsWith('node:')) {
    return true
  }
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
          "import nodemailer from 'nodemailer'",
          "import 'drizzle-orm'",
          "export const load = () => import('shiki')",
          'export const x = () => readFileSync(String(nodemailer))',
        ].join('\n'),
      )
      const violations = collectViolations(fixtureRoot)
      expect(violations).toHaveLength(4)
      for (const specifier of ['node:fs', 'nodemailer', 'drizzle-orm', 'shiki']) {
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
        ["import type { Options } from 'nodemailer'", 'export type { Options }'].join('\n'),
      )
      expect(collectViolations(fixtureRoot)).toEqual([])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})

/**
 * One server-only module family: client layers must not value-import anything
 * matching `patterns`, and the listed `owners` are the modules whose JOB is to
 * aggregate that family (they are the only files allowed to import it).
 */
interface ServerOnlyImportRule {
  /** Sentence fragment used in the violation line. */
  label: string
  patterns: readonly RegExp[]
  owners: readonly string[]
}

function collectServerOnlyImportViolations(filePaths: readonly string[], rule: ServerOnlyImportRule): string[] {
  const violations: string[] = []
  for (const filePath of filePaths) {
    const rel = relativePath(filePath)
    if (rule.owners.includes(rel)) {
      continue
    }
    const source = readFileSync(filePath, 'utf-8')
    for (const specifier of getValueSpecifiers(source)) {
      if (rule.patterns.some((pattern) => pattern.test(specifier))) {
        violations.push(`${rel} value-imports ${rule.label} '${specifier}'`)
      }
    }
  }
  return violations.sort()
}

const I18N_SCANNED_ROOTS = ['src/ui', 'src/client', 'src/routes', 'src/shared']
/** Root route module: part of the client bundle, so it must not pin the catalogs. */
const I18N_SCANNED_ROOT_FILES = ['src/root.tsx']

function collectScannedFiles(): string[] {
  const files: string[] = []
  for (const root of I18N_SCANNED_ROOTS) {
    walk(join(PROJECT_ROOT, root), (filePath) => files.push(filePath))
  }
  for (const rel of I18N_SCANNED_ROOT_FILES) {
    files.push(join(PROJECT_ROOT, rel))
  }
  return files
}

// `@/shared/i18n/messages/**` are the four catalogs (they also TYPE the message
// ids, so `import type` is fine); `catalog` aggregates them; `server/infra/i18n`
// is the server translator. All three must stay out of the client static graph.
const I18N_CATALOG_RULE: ServerOnlyImportRule = {
  label: 'server-only i18n module',
  patterns: [/^@\/shared\/i18n\/catalog$/, /^@\/shared\/i18n\/messages\//, /^@\/server\/infra\/i18n$/],
  /** The aggregator itself may import the per-locale catalogs — that is its job. */
  owners: ['src/shared/i18n/catalog.ts'],
}

function collectI18nViolations(filePaths: readonly string[]): string[] {
  return collectServerOnlyImportViolations(filePaths, I18N_CATALOG_RULE)
}

describe('i18n bundle boundary', () => {
  it('client layers and the root route never value-import the catalogs or the server translator', () => {
    expect(collectI18nViolations(collectScannedFiles())).toEqual([])
  })

  it('tripwire: reports catalog/translator value imports and ignores type-only ones', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-bundle-i18n-'))
    try {
      const leak = join(fixtureRoot, 'leak.ts')
      const typesOnly = join(fixtureRoot, 'types-only.ts')
      writeFileSync(
        leak,
        [
          "import { uiMessagesFor } from '@/shared/i18n/catalog'",
          "import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'",
          "import { createServerTranslator } from '@/server/infra/i18n'",
          'export const send = () => import("@/shared/i18n/catalog")',
        ].join('\n'),
      )
      writeFileSync(
        typesOnly,
        ["import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'", 'export type Id = UiMessageId'].join(
          '\n',
        ),
      )

      const violations = collectI18nViolations([leak, typesOnly])
      expect(violations).toHaveLength(4)
      for (const specifier of ['@/shared/i18n/catalog', '@/shared/i18n/messages/ui/zh-CN', '@/server/infra/i18n']) {
        expect(
          violations.some((v) => v.includes('leak.ts') && v.includes(`'${specifier}'`)),
          `expected a violation naming leak.ts and '${specifier}'`,
        ).toBe(true)
      }
      expect(violations.some((v) => v.includes('types-only.ts'))).toBe(false)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})

// The four Kobato Inkling label tables are ~22 KB together and the comment
// composer is a PUBLIC chunk. Workspace documents get ONLY the active locale's
// table as root-loader data (`content.bootstrap` → `i18n.inklingLabels`); a
// public document loads one table on demand through the client resolver's
// per-locale dynamic imports. No other module may value-import a table or the
// locale→table aggregator (static OR dynamic), so a stray import cannot pull
// all four locales into a chunk.
const INKLING_LABEL_RULE: ServerOnlyImportRule = {
  label: 'server-only Inkling label module',
  patterns: [
    /^@\/shared\/i18n\/inkling-labels$/,
    /^@\/shared\/i18n\/inkling-labels\//,
    // Banned: importing a table from here pulls all four locales into a chunk.
    /^@\/client\/editor\/inkling-labels\//,
  ],
  owners: [
    'src/shared/i18n/inkling-labels.ts',
    // The client seam owns the ONE sanctioned dynamic per-locale load for
    // public documents (each locale is its own chunk).
    'src/client/editor/inkling-labels.ts',
  ],
}

const INKLING_LABEL_RESOLVER = 'src/client/editor/inkling-labels.ts'

describe('inkling label bundle boundary', () => {
  it('client layers and the root route never value-import an Inkling label table', () => {
    expect(collectServerOnlyImportViolations(collectScannedFiles(), INKLING_LABEL_RULE)).toEqual([])
  })

  it('the client resolver reads the active locale from the root payload', () => {
    const source = readFileSync(join(PROJECT_ROOT, INKLING_LABEL_RESOLVER), 'utf-8')
    expect(source).toContain("from 'react-router'")
    expect(source).toContain('useRouteLoaderData')
    // No STATIC table import — the public fallback is one dynamic import per
    // locale (four chunks; a visitor downloads only the active one).
    expect(source).not.toMatch(/^import (?!type\b).*inkling-labels\//m)
    for (const locale of ['en-US', 'zh-CN', 'zh-HK', 'zh-TW']) {
      expect(source).toContain(`import('@/shared/i18n/inkling-labels/${locale}')`)
    }
  })

  it('tripwire: reports a table import and ignores the type-only key import', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-bundle-inkling-labels-'))
    try {
      const leak = join(fixtureRoot, 'leak.ts')
      const typesOnly = join(fixtureRoot, 'types-only.ts')
      writeFileSync(
        leak,
        [
          "import { kobatoInklingLabelsZhTW } from '@/shared/i18n/inkling-labels/zh-TW'",
          "import { inklingLabelsFor } from '@/shared/i18n/inkling-labels'",
          "import { kobatoInklingLabelsZhCN } from '@/client/editor/inkling-labels/zh-CN'",
          'export const load = () => import("@/shared/i18n/inkling-labels/zh-HK")',
          'export const label = () => [kobatoInklingLabelsZhTW, inklingLabelsFor, kobatoInklingLabelsZhCN]',
        ].join('\n'),
      )
      writeFileSync(
        typesOnly,
        [
          "import type { KobatoInklingLabelKey } from '@/shared/i18n/inkling-labels/en-US'",
          'export type Key = KobatoInklingLabelKey',
        ].join('\n'),
      )

      const violations = collectServerOnlyImportViolations([leak, typesOnly], INKLING_LABEL_RULE)
      expect(violations).toHaveLength(4)
      for (const specifier of [
        '@/shared/i18n/inkling-labels/zh-TW',
        '@/shared/i18n/inkling-labels',
        '@/client/editor/inkling-labels/zh-CN',
        '@/shared/i18n/inkling-labels/zh-HK',
      ]) {
        expect(
          violations.some((v) => v.includes('leak.ts') && v.includes(`'${specifier}'`)),
          `expected a violation naming leak.ts and '${specifier}'`,
        ).toBe(true)
      }
      expect(violations.some((v) => v.includes('types-only.ts'))).toBe(false)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})
