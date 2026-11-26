import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const nodeRequire = createRequire(resolve(REPO_ROOT, 'apps/kobato/vite.config.ts'))

const ENTRIES = {
  root: 'packages/ui/src/styles/ui.css',
  admin: 'apps/kobato/src/styles/admin.css',
  public: 'apps/kobato/src/styles/public.css',
  demo: 'apps/inkling-demo/src/styles/public.css',
  inkling: 'packages/inkling/src/styles/index.css',
} as const

const SOURCE_ROOTS = [
  'apps/kobato/src',
  'apps/inkling-demo/src',
  'packages/ui/src',
  'packages/web/admin/src',
  'packages/web/kit/src',
  'packages/web/public/src',
  'packages/inkling/src',
] as const

const BRIDGE_SHEETS = {
  admin: ['packages/web/admin/src/styles/inkling-editor.css'],
  public: ['packages/web/kit/src/styles/inkling-comment-editor.css'],
  demo: [],
} as const

const RUNTIME_INJECTED = new Set([
  '--anchor-width',
  '--available-height',
  '--transform-origin',
  '--blue',
  '--grey-450',
  '--lightgrey',
  '--orange',
  '--yellow',
])
const RUNTIME_INJECTED_PREFIXES = ['--shiki-']

interface CompiledSheet {
  css: string
  scanPaths: string[]
  root: string
}

async function compileEntry(entryRel: string): Promise<CompiledSheet> {
  const entry = resolve(REPO_ROOT, entryRel)
  const base = dirname(entry)
  const resolver =
    (cssOnly: boolean) =>
    async (id: string, from: string): Promise<string | false | undefined> => {
      try {
        const resolved = nodeRequire.resolve(id, { paths: [from] })
        return resolved.endsWith('.css') === cssOnly ? resolved : undefined
      } catch {
        return false
      }
    }
  const compiler = await compile(readFileSync(entry, 'utf8'), {
    base,
    onDependency: () => {},
    customCssResolver: resolver(true),
    customJsResolver: resolver(false),
  })
  const autoSources =
    compiler.root === 'none' ? [] : compiler.root === null ? [{ base, pattern: '**/*' }] : [compiler.root]
  const scanner = new Scanner({
    sources: [...autoSources, ...compiler.sources].map((source) => Object.assign({ negated: false }, source)),
  })
  const css = compiler.build(scanner.scan())
  return {
    css,
    scanPaths: compiler.sources.map((source) => relative(REPO_ROOT, resolve(source.base, source.pattern))).sort(),
    root: compiler.root === null ? 'auto' : typeof compiler.root === 'string' ? compiler.root : 'explicit',
  }
}

function collectFiles(root: string, matches: (fileName: string) => boolean): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.isFile() && matches(entry.name)) {
        files.push(path)
      }
    }
  }
  walk(resolve(REPO_ROOT, root))
  return files
}

function customPropertyDefinitions(text: string): Set<string> {
  const out = new Set<string>()
  for (const match of text.matchAll(/@property\s+(--[a-zA-Z][\w-]*)/g)) {
    out.add(match[1])
  }
  for (const match of text.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) {
    out.add(match[1])
  }
  return out
}

function varReferences(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)\s*([),])/g)) {
    if (match[1].startsWith('--tw-') || match[2] === ',') {
      continue
    }
    out.push(match[1])
  }
  return out
}

function inlineStyleProperties(): Set<string> {
  const out = new Set<string>()
  const files = SOURCE_ROOTS.flatMap((root) => collectFiles(root, (name) => /\.tsx?$/.test(name)))
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/['"](--[a-zA-Z][\w-]*)['"]\s*:/g)) {
      out.add(match[1])
    }
    for (const match of source.matchAll(/setProperty\(\s*['"](--[a-zA-Z][\w-]*)['"]/g)) {
      out.add(match[1])
    }
  }
  return out
}

describe('Tailwind compile contract', () => {
  it('pins each surface compile to its intended source scan', async () => {
    const expected: Record<string, string[]> = {
      root: ['packages/ui/src/components', 'packages/ui/src/icons', 'packages/ui/src/lib'],
      admin: [
        'apps/kobato/src/root.tsx',
        'apps/kobato/src/routes/admin',
        'apps/kobato/src/routes/auth',
        'apps/kobato/src/routes/editor',
        'packages/inkling/src/headless/cards',
        'packages/inkling/src/host-cards',
        'packages/web/admin/src/ui',
        'packages/web/kit/src/ui',
      ],
      public: [
        'apps/kobato/src/root.tsx',
        'apps/kobato/src/routes/public',
        'packages/inkling/src/headless/cards',
        'packages/inkling/src/host-cards',
        'packages/web/kit/src/ui',
        'packages/web/public/src/ui',
      ],
      demo: [
        'apps/inkling-demo/src/**/*.{ts,tsx}',
        'packages/inkling/src/headless/cards',
        'packages/inkling/src/host-cards',
        'packages/web/kit/src/ui',
        'packages/web/public/src/ui',
      ],
      inkling: ['packages/inkling/src'],
    }
    const compiled = new Map<string, CompiledSheet>()
    for (const [name, entry] of Object.entries(ENTRIES)) {
      compiled.set(name, await compileEntry(entry))
    }
    for (const [name, paths] of Object.entries(expected)) {
      const sheet = compiled.get(name)
      expect(sheet, name).toBeDefined()
      expect(sheet!.scanPaths, `${name}: compiled scan set drifted from the intended map`).toEqual(paths)
    }
    for (const name of ['root', 'admin', 'public', 'demo']) {
      expect(compiled.get(name)!.root, `${name}: entry must keep source(none)`).toBe('none')
    }
  })

  it('resolves every var() reference each document loads', async () => {
    const [rootSheet, adminSheet, publicSheet, demoSheet, inklingSheet] = await Promise.all(
      Object.values(ENTRIES).map((entry) => compileEntry(entry)),
    )
    const inlineDefs = inlineStyleProperties()
    const documents: Record<string, string[]> = {
      admin: [rootSheet.css, adminSheet.css, inklingSheet.css, ...BRIDGE_SHEETS.admin.map(readRaw)],
      public: [rootSheet.css, publicSheet.css, inklingSheet.css, ...BRIDGE_SHEETS.public.map(readRaw)],
      demo: [rootSheet.css, demoSheet.css],
    }
    for (const [document_, texts] of Object.entries(documents)) {
      const defs = new Set(inlineDefs)
      for (const text of texts) {
        for (const property of customPropertyDefinitions(text)) {
          defs.add(property)
        }
      }
      const missing = new Set<string>()
      for (const text of texts) {
        for (const ref of varReferences(text)) {
          if (defs.has(ref) || RUNTIME_INJECTED.has(ref) || RUNTIME_INJECTED_PREFIXES.some((p) => ref.startsWith(p))) {
            continue
          }
          missing.add(ref)
        }
      }
      expect([...missing].sort(), `${document_} document loads unresolved var() references`).toEqual([])
    }
  })

  it('keeps the base border default after each sheet preflight', async () => {
    const sheets = await Promise.all(
      (['root', 'admin', 'public', 'demo'] as const).map((name) => compileEntry(ENTRIES[name])),
    )
    for (const [index, name] of (['root', 'admin', 'public', 'demo'] as const).entries()) {
      const css = sheets[index]!.css
      const borderDefault = /[^{}]*\{[^}]*border-color:\s*var\(--border\)[^}]*\}/.exec(css)
      expect(borderDefault, `${name}: base border default missing from the sheet`).not.toBeNull()
      const lastPreflight = css.lastIndexOf('border:0 solid')
      const lastPreflightSpaced = css.lastIndexOf('border: 0 solid')
      const last = Math.max(lastPreflight, lastPreflightSpaced)
      expect(
        borderDefault!.index > last,
        `${name}: border default must follow the sheet preflight or a later sheet overrides it`,
      ).toBe(true)
    }
  })
})

function readRaw(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8')
}
