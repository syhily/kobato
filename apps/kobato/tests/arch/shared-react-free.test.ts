/**
 * The thirteen leaf packages under `packages/shared/*`
 * (`packages/shared/{utils,i18n,cache,settings,assets,lexical,sanitize,contracts,seo}`)
 * are UI-runtime-free: they must never carry React into either bundle. The
 * product settings contexts/hooks live in `@kobato/web-client`
 * (`@kobato/web-client/settings/blog-settings-context`); this scan pins that
 * split — no `.tsx` source file and no `react` / `react-dom`
 * import (value OR type) anywhere under those `src` trees.
 *
 * Node-only imports are NOT this guard's concern — the client-bundle scan
 * owns that boundary.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SHARED_SRC_ROOTS = [
  'packages/shared/utils/src',
  'packages/shared/auth/src',
  'packages/shared/catalog/src',
  'packages/shared/distribution/src',
  'packages/shared/telemetry/src',
  'packages/shared/i18n/src',
  'packages/shared/cache/src',
  'packages/shared/settings/src',
  'packages/shared/assets/src',
  'packages/shared/lexical/src',
  'packages/shared/sanitize/src',
  'packages/shared/contracts/src',
  'packages/shared/seo/src',
]

const sourceFiles: string[] = []
for (const root of SHARED_SRC_ROOTS) {
  const dir = join(PROJECT_ROOT, root)
  if (existsSync(dir)) {
    walk(dir, (filePath) => sourceFiles.push(filePath))
  }
}

function walk(dir: string, callback: (filePath: string) => void): void {
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

function collectImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  const fromRegex =
    /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?(?:[\w$]+)?\s+from\s+['"]([^'"]+)['"]/g
  while ((match = fromRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g
  while ((match = sideEffectRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  const exportFromRegex = /export\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+|\*)\s+from\s+['"]([^'"]+)['"]/g
  while ((match = exportFromRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

function isReactSpecifier(specifier: string): boolean {
  return (
    specifier === 'react' ||
    specifier === 'react-dom' ||
    specifier.startsWith('react/') ||
    specifier.startsWith('react-dom/')
  )
}

describe('arch: the shared leaf packages are UI-runtime-free', () => {
  it('has no .tsx source files', () => {
    const tsxFiles = sourceFiles.filter((filePath) => filePath.endsWith('.tsx'))
    expect(
      tsxFiles.map(relativePath),
      `React components found in the shared leaf packages (move them to @kobato/web-admin):\n${tsxFiles.map(relativePath).join('\n')}`,
    ).toEqual([])
  })

  it('never imports react / react-dom (value or type)', () => {
    const violations: string[] = []
    for (const filePath of sourceFiles) {
      for (const specifier of collectImportSpecifiers(readFileSync(filePath, 'utf8'))) {
        if (isReactSpecifier(specifier)) {
          violations.push(`${relativePath(filePath)} -> ${specifier}`)
        }
      }
    }
    expect(violations, `react imports found in the shared leaf packages:\n${violations.join('\n')}`).toEqual([])
  })
})
