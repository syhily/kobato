import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_LAYERS = [
  'packages/web/admin/src/ui',
  'apps/kobato/src/document',
  'apps/kobato/src/route-warmup',
  'apps/kobato/src/rum',
  'packages/web/public/src',
  'packages/ui/src',
  'apps/kobato/src/routes',
  'packages/api/src/contracts',
  'packages/api/src/browser',
  'packages/shared/catalog/src/seo',
  'packages/inkling/src/headless',
  'packages/inkling/src/host-cards',
  'packages/shared/utils/src',
  'packages/shared/i18n/src',
  'packages/shared/settings/src',
  'packages/shared/assets/src',
  'packages/shared/sanitize/src',
]

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
  allowedIn?: readonly string[]
}

const NODE_ONLY_PACKAGES: readonly NodeOnlyPackage[] = [
  {
    name: 'jsdom',
    reason: 'server-side DOM for the sanitize engine and inkling headless projections',
    allowedIn: ['packages/shared/sanitize/src/engine.node.ts'],
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
  { name: 'fast-xml-parser', reason: 'XML parsing, server-only' },
  { name: 'lunar-typescript', reason: 'server-side calendar computation' },
]

function walk(dir: string, callback: (filePath: string) => void) {
  if (!existsSync(dir)) {
    return
  }
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

function getValueSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  const fromRegex =
    /import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?(?:[\w$]+)?\s+from\s+['"]([^'"]+)['"]/g
  while ((match = fromRegex.exec(source)) !== null) {
    if (!match[1]) {
      specifiers.push(match[2])
    }
  }

  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g
  while ((match = sideEffectRegex.exec(source)) !== null) {
    specifiers.push(match[1])
  }
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

interface ServerOnlyImportRule {
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

const I18N_SCANNED_ROOTS = [
  'packages/web/admin/src/ui',
  'apps/kobato/src/document',
  'apps/kobato/src/route-warmup',
  'apps/kobato/src/rum',
  'packages/web/public/src',
  'packages/ui/src',
  'apps/kobato/src/routes',
  'packages/api/src/contracts',
  'packages/api/src/browser',
  'packages/shared/catalog/src/seo',
  'packages/inkling/src',
  'packages/shared/utils/src',
  'packages/shared/i18n/src',
  'packages/shared/settings/src',
  'packages/shared/assets/src',
  'packages/shared/sanitize/src',
]

const I18N_SCANNED_ROOT_FILES = ['apps/kobato/src/root.tsx']

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

const I18N_CATALOG_RULE: ServerOnlyImportRule = {
  label: 'server-only i18n module',

  patterns: [
    /(^|\/)i18n\/catalog(\.ts)?$/,
    /(^|\/)i18n\/messages\//,
    /^\.\/messages\//,
    /(^|\/)server\/infra\/i18n(\.ts)?$/,
  ],
  owners: ['packages/shared/i18n/src/catalog.ts'],
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
          "import { uiMessagesFor } from '@kobato/i18n/catalog'",
          "import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'",
          "import { createServerTranslator } from '@kobato/server/infra/i18n'",
          'export const send = () => import("@kobato/i18n/catalog")',
        ].join('\n'),
      )
      writeFileSync(
        typesOnly,
        ["import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'", 'export type Id = UiMessageId'].join(
          '\n',
        ),
      )

      const violations = collectI18nViolations([leak, typesOnly])
      expect(violations).toHaveLength(4)
      for (const specifier of ['@kobato/i18n/catalog', '@kobato/i18n/messages/ui/zh-CN', '@kobato/server/infra/i18n']) {
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

const INKLING_LABEL_RULE: ServerOnlyImportRule = {
  label: 'server-only Inkling label module',

  patterns: [
    /(^|\/)i18n\/inkling-labels(\.ts)?$/,

    /(^|\/)i18n\/inkling-labels\//,
    /^\.\/inkling-labels\//,
  ],
  owners: [
    'packages/shared/i18n/src/inkling-labels.ts',

    'packages/web/public/src/ui/shared/editor/inkling-labels.ts',
  ],
}

const INKLING_LABEL_RESOLVER = 'packages/web/public/src/ui/shared/editor/inkling-labels.ts'
describe('inkling label bundle boundary', () => {
  it('client layers and the root route never value-import an Inkling label table', () => {
    expect(collectServerOnlyImportViolations(collectScannedFiles(), INKLING_LABEL_RULE)).toEqual([])
  })

  it('the client resolver reads the active locale from the root payload', () => {
    const source = readFileSync(join(PROJECT_ROOT, INKLING_LABEL_RESOLVER), 'utf-8')
    expect(source).toContain("from 'react-router'")
    expect(source).toContain('useRouteLoaderData')

    expect(source).not.toMatch(/^import (?!type\b).*inkling-labels\//m)
    for (const locale of ['en-US', 'zh-CN', 'zh-HK', 'zh-TW']) {
      expect(source).toContain(`import('@kobato/i18n/inkling-labels/${locale}')`)
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
          "import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'",
          "import { inklingLabelsFor } from '@kobato/i18n/inkling-labels'",
          "import { kobatoInklingLabelsZhCN } from './i18n/inkling-labels/zh-CN'",
          'export const load = () => import("@kobato/i18n/inkling-labels/zh-HK")',
          'export const label = () => [kobatoInklingLabelsZhTW, inklingLabelsFor, kobatoInklingLabelsZhCN]',
        ].join('\n'),
      )
      writeFileSync(
        typesOnly,
        [
          "import type { KobatoInklingLabelKey } from '@kobato/i18n/inkling-labels/en-US'",
          'export type Key = KobatoInklingLabelKey',
        ].join('\n'),
      )

      const violations = collectServerOnlyImportViolations([leak, typesOnly], INKLING_LABEL_RULE)
      expect(violations).toHaveLength(4)
      for (const specifier of [
        '@kobato/i18n/inkling-labels/zh-TW',
        '@kobato/i18n/inkling-labels',
        './i18n/inkling-labels/zh-CN',
        '@kobato/i18n/inkling-labels/zh-HK',
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
