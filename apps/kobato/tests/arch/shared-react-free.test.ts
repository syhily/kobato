import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SHARED_SRC_ROOTS = readdirSync(join(PROJECT_ROOT, 'packages/shared'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(PROJECT_ROOT, 'packages/shared', entry.name, 'src'))
  .filter((srcDir) => existsSync(srcDir))

const SDK_SRC_ROOTS = [join(PROJECT_ROOT, 'packages/api/src')]

const sourceFiles: string[] = []
for (const root of [...SHARED_SRC_ROOTS, ...SDK_SRC_ROOTS]) {
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

function isPackageOrSubpath(specifier: string, pkg: string): boolean {
  return specifier === pkg || specifier.startsWith(`${pkg}/`)
}

function importViolations(files: readonly string[], matches: (specifier: string) => boolean): string[] {
  const violations: string[] = []
  for (const filePath of files) {
    for (const specifier of collectImportSpecifiers(readFileSync(filePath, 'utf8'))) {
      if (matches(specifier)) {
        violations.push(`${relativePath(filePath)} -> ${specifier}`)
      }
    }
  }
  return violations
}

const contractsFiles: string[] = []
walk(join(PROJECT_ROOT, 'packages/api/src/contracts'), (filePath) => contractsFiles.push(filePath))

describe('arch: the shared leaf packages and the api SDK are UI-runtime-free', () => {
  it('discovers the shared leaf src trees automatically', () => {
    expect(
      SHARED_SRC_ROOTS.length,
      'expected at least the eight documented leaves — the umbrella collapsed or moved',
    ).toBeGreaterThanOrEqual(8)
  })

  it('has no .tsx source files', () => {
    const tsxFiles = sourceFiles.filter((filePath) => filePath.endsWith('.tsx'))
    expect(
      tsxFiles.map(relativePath),
      `React components found in the shared leaf packages or the api SDK (move them to @kobato/web-admin):\n${tsxFiles.map(relativePath).join('\n')}`,
    ).toEqual([])
  })

  it('never imports react / react-dom (value or type)', () => {
    const violations = importViolations(sourceFiles, isReactSpecifier)
    expect(
      violations,
      `react imports found in the shared leaf packages or the api SDK:\n${violations.join('\n')}`,
    ).toEqual([])
  })
})

describe('arch: the api contracts layer stays transport-free', () => {
  it('discovers the contracts src tree', () => {
    expect(contractsFiles.length, 'the wire vocabulary lives under packages/api/src/contracts').toBeGreaterThan(20)
  })

  it('imports no @orpc/* package — schema-only consumers never pull the RPC runtime', () => {
    expect(importViolations(contractsFiles, (specifier) => isPackageOrSubpath(specifier, '@orpc'))).toEqual([])
  })

  it('never imports the rpc or client layers of the SDK', () => {
    expect(
      importViolations(
        contractsFiles,
        (specifier) =>
          isPackageOrSubpath(specifier, '@kobato/api/rpc') || isPackageOrSubpath(specifier, '@kobato/api/client'),
      ),
    ).toEqual([])
  })
})
