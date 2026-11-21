import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SHARED_SRC_ROOTS = readdirSync(join(PROJECT_ROOT, 'packages/shared'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(PROJECT_ROOT, 'packages/shared', entry.name, 'src'))
  .filter((srcDir) => existsSync(srcDir))

const sourceFiles: string[] = []
for (const root of SHARED_SRC_ROOTS) {
  walk(root, (filePath) => sourceFiles.push(filePath))
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
  it('discovers the shared leaf src trees automatically', () => {
    expect(
      SHARED_SRC_ROOTS.length,
      'expected at least the twelve documented leaves — the umbrella collapsed or moved',
    ).toBeGreaterThanOrEqual(12)
  })

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
