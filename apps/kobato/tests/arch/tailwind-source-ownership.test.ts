import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const SOURCE_ROOTS = [
  { packageRoot: 'apps/kobato', sourceRoot: 'apps/kobato/src' },
  { packageRoot: 'apps/inkling-demo', sourceRoot: 'apps/inkling-demo' },
  { packageRoot: 'packages/ui', sourceRoot: 'packages/ui/src' },
  { packageRoot: 'packages/web/admin', sourceRoot: 'packages/web/admin/src' },
  { packageRoot: 'packages/web/public', sourceRoot: 'packages/web/public/src' },
  { packageRoot: 'packages/shared/lexical', sourceRoot: 'packages/shared/lexical/src' },
  { packageRoot: 'packages/inkling', sourceRoot: 'packages/inkling/src' },
] as const

// @source owners without their own Tailwind compile: surface entries compose them via CSS @import.
const SOURCE_PARTIALS = [
  { file: 'packages/shared/lexical/src/styles/cards.css', specifier: '@kobato/lexical/styles/cards.css' },
  { file: 'packages/web/public/src/styles/public.css', specifier: '@kobato/web-public/styles/public.css' },
  { file: 'packages/web/public/src/styles/admin-subset.css', specifier: '@kobato/web-public/styles/admin-subset.css' },
  { file: 'packages/web/admin/src/styles/admin.css', specifier: '@kobato/web-admin/styles/admin.css' },
] as const

// Scan-coverage lock: the exact `@source` set each web-family partial must
// declare, relative to the partial. The public leaf's `public.css` scans the
// whole package ui tree (the public modules plus the cross-surface `ui/shared`
// (NotificationsDrawer) and `ui/lib` (LocaleSyncProvider) tiers that render on
// BOTH app surfaces); `admin-subset.css` holds the precise per-module subset
// admin actually renders — a long-term seam, so a blanket `../ui` would drag
// public-only modules into the admin sheet. The admin leaf's `admin.css`
// scans its whole `ui` tree. The ownership test above only checks direction
// (no cross-package scans) and would keep passing while a surface silently
// dropped a tier's utilities from its CSS.
const WEB_PARTIAL_REQUIRED_SOURCES = {
  'packages/web/public/src/styles/public.css': ['../ui'],
  'packages/web/public/src/styles/admin-subset.css': [
    '../ui/shared',
    '../ui/lib',
    '../ui/music-player',
    '../ui/chrome',
    '../ui/comments/*.{ts,tsx}',
    '../ui/widgets',
    '../ui/Search.tsx',
  ],
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
        'apps/inkling-demo/styles/public.css',
        'packages/ui/src/styles/ui.css',
        'packages/web/public/src/styles/public.css',
        'packages/web/public/src/styles/admin-subset.css',
        'packages/web/admin/src/styles/admin.css',
        'packages/shared/lexical/src/styles/cards.css',
        'packages/inkling/src/styles/index.css',
      ]),
    )
  })

  it('locks each web partial to its required scan set', () => {
    for (const [file, required] of Object.entries(WEB_PARTIAL_REQUIRED_SOURCES)) {
      const source = readFileSync(file, 'utf8')
      const declared = [...source.matchAll(/@source\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).sort()
      // Exact set: a missing entry drops that tier's utilities from the surface CSS; an extra
      // entry (e.g. the admin subset scanning all of `../ui`) breaks the per-surface bundling.
      expect(declared, file).toEqual([...required].sort())
      // The scanned tier must still exist — a rename would leave the scan matching nothing.
      const partialDir = dirname(resolve(REPO_ROOT, file))
      for (const entry of required) {
        expect(existsSync(resolve(partialDir, entry.split('*')[0]!)), `${file}: ${entry}`).toBe(true)
      }
    }
  })

  it('keeps UI ui.css on the root route as the single eager document entry', () => {
    const rootSource = readFileSync('apps/kobato/src/root.tsx', 'utf8')
    // Eager side-effect import, so the root route's link precedes every nested route sheet in cascade order.
    // A dynamic `import()` would move the design system's utilities behind a lazy chunk and let them outrun
    // the surface sheets again.
    expect(rootSource).toMatch(/^import '@kobato\/ui\/styles\/ui\.css'$/m)
    expect(rootSource).not.toContain(`import('@kobato/ui/styles/ui.css')`)

    const files = collectFiles(resolve(REPO_ROOT, 'apps/kobato/src'), (name) => /\.tsx?$/.test(name)).filter((path) =>
      readFileSync(path, 'utf8').includes(`@kobato/ui/styles/ui.css`),
    )
    expect(files.map((file) => relative(REPO_ROOT, file))).toEqual(['apps/kobato/src/root.tsx'])
  })

  it('keeps source partials free of their own Tailwind compile', () => {
    for (const { file } of SOURCE_PARTIALS) {
      const source = readFileSync(file, 'utf8')
      // A partial must never re-open a Tailwind compile: surface entries own the single `@import 'tailwindcss'`
      // per document surface, so base and responsive utilities are sorted by one generator instead of racing
      // across separate stylesheet links.
      expect(source, file).not.toContain(`@import 'tailwindcss'`)
      // The dark variant is UI-owned (`dark-variant.css` via the UI reference import); a partial re-declaring
      // `@custom-variant` would fight it inside the composing surface compile.
      expect(source, file).not.toContain('@custom-variant')
    }
  })

  it('keeps modules from importing source partials directly', () => {
    for (const { sourceRoot } of SOURCE_ROOTS) {
      for (const file of collectFiles(resolve(REPO_ROOT, sourceRoot), (name) => /\.tsx?$/.test(name))) {
        const source = readFileSync(file, 'utf8')
        for (const { specifier } of SOURCE_PARTIALS) {
          // Partials ride the surface entry's CSS @import; component/route imports would spawn a competing sheet.
          expect(source.includes(specifier), `${relative(REPO_ROOT, file)}: ${specifier}`).toBe(false)
        }
      }
    }
  })

  it('pins shared card compile tokens to the UI runtime contract', () => {
    const shared = readFileSync('packages/shared/lexical/src/styles/cards.css', 'utf8')
    const ui = readFileSync('packages/ui/src/styles/tailwind.css', 'utf8')
    for (const match of shared.matchAll(/^\s*(--color-[\w-]+:\s*var\(--[\w-]+\));/gm)) {
      expect(ui).toContain(match[1])
    }
  })
})
