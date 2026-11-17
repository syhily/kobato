import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const SOURCE_ROOTS = [
  { packageRoot: 'apps/kobato', sourceRoot: 'apps/kobato/src' },
  { packageRoot: 'apps/inkling-demo', sourceRoot: 'apps/inkling-demo' },
  { packageRoot: 'packages/ui', sourceRoot: 'packages/ui/src' },
  { packageRoot: 'packages/web', sourceRoot: 'packages/web/src' },
  { packageRoot: 'packages/shared/pt', sourceRoot: 'packages/shared/pt/src' },
  { packageRoot: 'packages/inkling', sourceRoot: 'packages/inkling/src' },
] as const

function cssFiles(root: string): string[] {
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.isFile() && entry.name.endsWith('.css')) {
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
      for (const file of cssFiles(resolve(REPO_ROOT, sourceRoot))) {
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
        'apps/inkling-demo/styles/public.css',
        'packages/ui/src/styles/ui.css',
        'packages/web/src/styles/public.css',
        'packages/web/src/styles/admin.css',
        'packages/shared/pt/src/styles/cards.css',
        'packages/inkling/src/styles/index.css',
      ]),
    )
  })

  it('pins shared card compile tokens to the UI runtime contract', () => {
    const shared = readFileSync('packages/shared/pt/src/styles/cards.css', 'utf8')
    const ui = readFileSync('packages/ui/src/styles/tailwind.css', 'utf8')
    for (const match of shared.matchAll(/^\s*(--color-[\w-]+:\s*var\(--[\w-]+\));/gm)) {
      expect(ui).toContain(match[1])
    }
    const variant = /(@custom-variant dark \{[\s\S]*?\n\})/.exec(shared)?.[1]
    expect(variant).toBeDefined()
    expect(readFileSync('packages/ui/src/styles/dark-variant.css', 'utf8')).toContain(variant!)
  })
})
