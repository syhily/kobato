import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const SOURCE_ROOTS = [
  { packageRoot: 'apps/kobato', sourceRoot: 'apps/kobato/src' },
  { packageRoot: 'apps/inkling-demo', sourceRoot: 'apps/inkling-demo/src' },
  { packageRoot: 'packages/ui', sourceRoot: 'packages/ui/src' },
  { packageRoot: 'packages/web/admin', sourceRoot: 'packages/web/admin/src' },
  { packageRoot: 'packages/web/kit', sourceRoot: 'packages/web/kit/src' },
  { packageRoot: 'packages/web/public', sourceRoot: 'packages/web/public/src' },
  { packageRoot: 'packages/inkling', sourceRoot: 'packages/inkling/src' },
] as const

const SOURCE_PARTIALS = [
  { file: 'packages/inkling/src/styles/cards.css', specifier: '@kobato/inkling/styles/cards.css' },
  { file: 'packages/web/public/src/styles/public.css', specifier: '@kobato/web-public/styles/public.css' },
  { file: 'packages/web/kit/src/styles/kit.css', specifier: '@kobato/web-kit/styles/kit.css' },
  { file: 'packages/web/admin/src/styles/admin.css', specifier: '@kobato/web-admin/styles/admin.css' },
] as const

const WEB_PARTIAL_REQUIRED_SOURCES = {
  'packages/web/public/src/styles/public.css': ['../ui'],
  'packages/web/kit/src/styles/kit.css': ['../ui'],
  'packages/web/admin/src/styles/admin.css': ['../ui'],
} as const

function collectFiles(root: string, matches: (fileName: string) => boolean): string[] {
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.isFile() && matches(entry.name)) {
        files.push(path)
      }
    }
  }
  walk(root)
  return files
}

describe('Tailwind source ownership', () => {
  it('keeps every @source inside the package that owns the stylesheet', () => {
    const seen = new Set<string>()
    for (const { packageRoot, sourceRoot } of SOURCE_ROOTS) {
      const packagePath = resolve(REPO_ROOT, packageRoot)
      for (const file of collectFiles(resolve(REPO_ROOT, sourceRoot), (name) => name.endsWith('.css'))) {
        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(/@source\s+['"]([^'"]+)['"]/g)) {
          const target = resolve(dirname(file), match[1])
          expect(target === packagePath || target.startsWith(`${packagePath}${sep}`), `${file}: ${match[1]}`).toBe(true)
          seen.add(relative(REPO_ROOT, file))
        }
      }
    }

    expect([...seen]).toEqual(
      expect.arrayContaining([
        'apps/kobato/src/styles/public.css',
        'apps/kobato/src/styles/admin.css',
        'apps/inkling-demo/src/styles/public.css',
        'packages/ui/src/styles/ui.css',
        'packages/web/public/src/styles/public.css',
        'packages/web/kit/src/styles/kit.css',
        'packages/web/admin/src/styles/admin.css',
        'packages/inkling/src/styles/cards.css',
        'packages/inkling/src/styles/index.css',
      ]),
    )
  })

  it('locks each web partial to its required scan set', () => {
    for (const [file, required] of Object.entries(WEB_PARTIAL_REQUIRED_SOURCES)) {
      const source = readFileSync(file, 'utf8')
      const declared = [...source.matchAll(/@source\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).sort()
      expect(declared, file).toEqual([...required].sort())

      const partialDir = dirname(resolve(REPO_ROOT, file))
      for (const entry of required) {
        expect(existsSync(resolve(partialDir, entry.split('*')[0]!)), `${file}: ${entry}`).toBe(true)
      }
    }
  })

  it('keeps UI ui.css on the root route as the single eager document entry', () => {
    const rootSource = readFileSync('apps/kobato/src/root.tsx', 'utf8')

    expect(rootSource).toMatch(/^import '@kobato\/ui\/styles\/ui\.css'$/m)
    expect(rootSource).not.toContain(`import('@kobato/ui/styles/ui.css')`)
    const files = collectFiles(resolve(REPO_ROOT, 'apps/kobato/src'), (name) => /\.tsx?$/.test(name)).filter((path) =>
      readFileSync(path, 'utf8').includes(`@kobato/ui/styles/ui.css`),
    )
    expect(files.map((file) => relative(REPO_ROOT, file))).toEqual(['apps/kobato/src/root.tsx'])
  })

  it('terminates every directive at-rule (an unterminated prelude silently swallows the next directive)', () => {
    for (const { sourceRoot } of SOURCE_ROOTS) {
      for (const file of collectFiles(resolve(REPO_ROOT, sourceRoot), (name) => name.endsWith('.css'))) {
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, index) => {
          const trimmed = line.trim()
          if (!/^@(?:source|import|custom-variant|plugin)\b/.test(trimmed)) {
            return
          }
          const terminated = trimmed.endsWith(';') || trimmed.endsWith('{')
          expect(
            terminated,
            `${relative(REPO_ROOT, file)}:${index + 1} unterminated directive "${trimmed}" — its prelude swallows the next directive at scan time`,
          ).toBe(true)
        })
      }
    }
  })

  it('keeps surface entries on the reference token sheet plus the emitted base default', () => {
    const entries = [
      'apps/kobato/src/styles/admin.css',
      'apps/kobato/src/styles/public.css',
      'apps/inkling-demo/src/styles/public.css',
    ]
    for (const file of entries) {
      const source = readFileSync(resolve(REPO_ROOT, file), 'utf8')
      expect(source, `${file}: the token sheet participates via reference only`).toContain(
        `@import '@kobato/ui/styles/tailwind.css' reference;`,
      )
      expect(
        source.includes(`@import '@kobato/ui/styles/base-defaults.css';`),
        `${file}: must emit the base default after its own preflight or the sheet turns bordered elements black`,
      ).toBe(true)
    }
  })

  it('keeps source partials free of their own Tailwind compile', () => {
    for (const { file } of SOURCE_PARTIALS) {
      const source = readFileSync(file, 'utf8')

      expect(source, file).not.toContain(`@import 'tailwindcss'`)

      expect(source, file).not.toContain('@custom-variant')
    }
  })

  it('keeps modules from importing source partials directly', () => {
    for (const { sourceRoot } of SOURCE_ROOTS) {
      for (const file of collectFiles(resolve(REPO_ROOT, sourceRoot), (name) => /\.tsx?$/.test(name))) {
        const source = readFileSync(file, 'utf8')
        for (const { specifier } of SOURCE_PARTIALS) {
          expect(source.includes(specifier), `${relative(REPO_ROOT, file)}: ${specifier}`).toBe(false)
        }
      }
    }
  })
  it('pins shared card compile tokens to the UI runtime contract', () => {
    const shared = readFileSync('packages/inkling/src/styles/cards.css', 'utf8')
    const ui = readFileSync('packages/ui/src/styles/tailwind.css', 'utf8')
    for (const match of shared.matchAll(/^\s*(--color-[\w-]+:\s*var\(--[\w-]+\));/gm)) {
      expect(ui).toContain(match[1])
    }
  })
})
