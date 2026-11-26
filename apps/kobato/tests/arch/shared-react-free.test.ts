import { REPO_PACKAGES } from '@tests/arch/workspace-packages'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SHARED_SRC_ROOTS = readdirSync(join(PROJECT_ROOT, 'packages/shared'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(PROJECT_ROOT, 'packages/shared', entry.name, 'src'))
  .filter((srcDir) => existsSync(srcDir))

const API_SRC_ROOT = join(PROJECT_ROOT, 'packages/api/src')
const API_BROWSER_ASSEMBLY_ROOT = join(API_SRC_ROOT, 'browser')
const DEFAULT_FETCH_ADAPTERS = new Set([
  'packages/api/src/client/create-client.ts',
  'packages/api/src/client/create-server-client.ts',
])
const WORKSPACE_SRC_ROOTS = REPO_PACKAGES.map((pkg) => join(PROJECT_ROOT, pkg.dir, 'src')).filter((srcDir) =>
  existsSync(srcDir),
)
const NON_BROWSER_CONSUMER_ROOTS = ['packages/server/src', 'packages/db/src'].map((dir) => join(PROJECT_ROOT, dir))

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

function listSourceFiles(root: string): string[] {
  const files: string[] = []
  walk(root, (filePath) => files.push(filePath))
  return files
}

function isInside(root: string, filePath: string): boolean {
  const rel = relative(root, filePath)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

const apiSourceFiles = listSourceFiles(API_SRC_ROOT)
const apiUiRuntimeFreeFiles = apiSourceFiles.filter((filePath) => !isInside(API_BROWSER_ASSEMBLY_ROOT, filePath))

const sourceFiles: string[] = []
for (const root of SHARED_SRC_ROOTS) {
  walk(root, (filePath) => sourceFiles.push(filePath))
}
sourceFiles.push(...apiUiRuntimeFreeFiles)

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

describe('arch: the shared leaf packages and the api SDK are UI-runtime-free outside the browser assembly', () => {
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
      `React components found in the shared leaf packages or the api SDK (move them to apps/kobato/src/ui):\n${tsxFiles.map(relativePath).join('\n')}`,
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

const GLOBAL_THIS_ACCESS = /globalThis\.([A-Za-z_$][\w$]*)/g
const BROWSER_GLOBAL_MEMBER_ACCESS = /\b(?:window|document|navigator|localStorage|sessionStorage)\s*\./g

function isBrowserAssemblySpecifier(specifier: string): boolean {
  return isPackageOrSubpath(specifier, '@kobato/api/browser')
}

function isReactQueryBinding(specifier: string): boolean {
  return isPackageOrSubpath(specifier, '@orpc/react-query') || isPackageOrSubpath(specifier, '@tanstack/react-query')
}

function ambientViolations(files: readonly string[]): string[] {
  const violations: string[] = []
  for (const filePath of files) {
    const rel = relativePath(filePath)
    const source = readFileSync(filePath, 'utf8')
    for (const match of source.matchAll(GLOBAL_THIS_ACCESS)) {
      if (DEFAULT_FETCH_ADAPTERS.has(rel) && match[1] === 'fetch') {
        continue
      }
      violations.push(`${rel} -> globalThis.${match[1]}`)
    }
    for (const match of source.matchAll(BROWSER_GLOBAL_MEMBER_ACCESS)) {
      violations.push(`${rel} -> ${match[0]}`)
    }
  }
  return violations.sort()
}

describe('arch: the browser assembly is the only UI-bound, ambient part of the api SDK', () => {
  it('exempts exactly packages/api/src/browser from the UI-runtime-free file set', () => {
    const exempt = listSourceFiles(API_BROWSER_ASSEMBLY_ROOT).map(relativePath).sort()
    expect(exempt).toEqual([
      'packages/api/src/browser/client.ts',
      'packages/api/src/browser/orpc-query.ts',
      'packages/api/src/browser/query-client.ts',
    ])
    expect(apiUiRuntimeFreeFiles.map(relativePath)).not.toContain('packages/api/src/browser/client.ts')
  })

  it('imports no @orpc/react-query or @tanstack/react-query outside the browser assembly', () => {
    expect(
      importViolations(apiUiRuntimeFreeFiles, isReactQueryBinding),
      'TanStack / oRPC React bindings belong in packages/api/src/browser only',
    ).toEqual([])
  })

  it('is ambient-free outside the browser assembly — the only globalThis access is the default fetch adapter', () => {
    expect(
      ambientViolations(apiUiRuntimeFreeFiles),
      'module-level ambient state and browser globals belong in packages/api/src/browser only',
    ).toEqual([])
  })

  it('is a leaf in the workspace graph: the rest of the api SDK, the server, the db, and the shared leaves never import it', () => {
    const consumers = [...sourceFiles, ...NON_BROWSER_CONSUMER_ROOTS.flatMap((root) => listSourceFiles(root))]
    expect(
      importViolations(consumers, isBrowserAssemblySpecifier),
      'only the built-in frontend imports @kobato/api/browser — the server, the db, and the headless seam never do',
    ).toEqual([])
  })

  it('keeps @orpc/react-query at exactly one import site in workspace source', () => {
    const importSites = WORKSPACE_SRC_ROOTS.flatMap((root) => listSourceFiles(root))
      .filter((filePath) =>
        collectImportSpecifiers(readFileSync(filePath, 'utf8')).some((specifier) =>
          isPackageOrSubpath(specifier, '@orpc/react-query'),
        ),
      )
      .map(relativePath)
      .sort()
    expect(importSites, 'the TanStack Query binding of the oRPC client lives in one module').toEqual([
      'packages/api/src/browser/orpc-query.ts',
    ])
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
