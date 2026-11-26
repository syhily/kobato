import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const CLIENT_TREES = [
  'apps/kobato/src/routes',
  'apps/kobato/src/ui',
  'apps/kobato/src/lib',
  'apps/kobato/src/document',
  'apps/kobato/src/route-warmup',
  'apps/kobato/src/seo',
  'apps/kobato/src/root.tsx',
] as const

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

function sourceFiles(root: string, out: string[]): void {
  if (statSync(root).isFile()) {
    out.push(root)
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

describe('kobato client code boundary', () => {
  it('routes, ui, lib, document, route-warmup, seo, and root import no @kobato/server module', () => {
    const files: string[] = []
    for (const root of CLIENT_TREES) {
      const treeFiles: string[] = []
      sourceFiles(join(REPO_ROOT, root), treeFiles)
      expect(treeFiles.length, root).toBeGreaterThan(0)
      files.push(...treeFiles)
    }

    const offenders: string[] = []
    for (const file of files) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (specifier === '@kobato/server' || specifier.startsWith('@kobato/server/')) {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${specifier}`)
        }
      }
    }
    expect(offenders, 'client code ships to the browser — reach the backend over @kobato/api only').toEqual([])
  })
})
