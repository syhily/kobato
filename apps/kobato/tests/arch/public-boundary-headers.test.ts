import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const PUBLIC_ROUTES_DIR = join(PROJECT_ROOT, 'apps/sayaka/src/routes')

const LEGITIMATE_EXCEPTIONS: ReadonlySet<string> = new Set()

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && typeof (value as AstNode).type === 'string'
}

function walk(dir: string, callback: (filePath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, callback)
    } else if (stat.isFile() && entry.endsWith('.tsx')) {
      callback(fullPath)
    }
  }
}

function relativePath(absolutePath: string): string {
  return relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/')
}

function parse(filePath: string, source: string): AstNode {
  return parseAst(source, { lang: 'tsx' }, filePath) as unknown as AstNode
}

function idName(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  return typeof node.name === 'string' ? node.name : null
}

function statementName(declaration: unknown): string | null {
  if (!isNode(declaration)) {
    return null
  }
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
    return idName(declaration.id)
  }
  return null
}

interface ModuleExports {
  names: Set<string>
  headerBindings: string[]
}

function topLevelBindings(program: AstNode, source: string): Map<string, string> {
  const bindings = new Map<string, string>()
  for (const statement of program.body as AstNode[]) {
    const declaration = isNode(statement.declaration) ? statement.declaration : statement
    if (declaration.type === 'VariableDeclaration' && Array.isArray(declaration.declarations)) {
      for (const declarator of declaration.declarations as AstNode[]) {
        const name = idName(declarator.id)
        const init = declarator.init
        if (name !== null && isNode(init)) {
          bindings.set(name, source.slice(init.start, init.end))
        }
      }
    } else {
      const name = statementName(declaration)
      if (name !== null) {
        const body = isNode(declaration) ? declaration.body : undefined
        bindings.set(name, isNode(body) ? source.slice(body.start, body.end) : '')
      }
    }
  }
  return bindings
}

function moduleExports(source: string, filePath: string): ModuleExports {
  const program = parse(filePath, source)
  const locals = topLevelBindings(program, source)
  const names = new Set<string>()
  const headerBindings: string[] = []

  const pushHeader = (text: string) => {
    if (/\bdocumentHeaders\b/.test(text)) {
      headerBindings.push(text)
    }
  }

  for (const statement of program.body as AstNode[]) {
    if (statement.type !== 'ExportNamedDeclaration') {
      continue
    }
    const declaration = statement.declaration
    if (isNode(declaration)) {
      if (declaration.type === 'VariableDeclaration' && Array.isArray(declaration.declarations)) {
        for (const declarator of declaration.declarations as AstNode[]) {
          const name = idName(declarator.id)
          if (name === null) {
            continue
          }
          names.add(name)
          const init = declarator.init
          if (name === 'headers') {
            pushHeader(isNode(init) ? source.slice(init.start, init.end) : '')
          }
        }
      } else {
        const name = statementName(declaration)
        if (name === null) {
          continue
        }
        names.add(name)
        if (name === 'headers') {
          const body = isNode(declaration) ? declaration.body : undefined
          pushHeader(isNode(body) ? source.slice(body.start, body.end) : '')
        }
      }
      continue
    }
    if (!Array.isArray(statement.specifiers)) {
      continue
    }
    for (const specifier of statement.specifiers as AstNode[]) {
      const exported = idName(specifier.exported)
      if (exported === null) {
        continue
      }
      names.add(exported)
      if (exported === 'headers') {
        const local = idName(specifier.local)
        const binding = local !== null ? locals.get(local) : undefined
        pushHeader(binding ?? local ?? '')
      }
    }
  }

  return { names, headerBindings }
}

function publicBoundaryModules(): string[] {
  const result: string[] = []
  walk(PUBLIC_ROUTES_DIR, (filePath) => {
    const source = readFileSync(filePath, 'utf8')
    if (moduleExports(source, filePath).names.has('ErrorBoundary')) {
      result.push(relativePath(filePath))
    }
  })
  return result.sort()
}

describe('public route ErrorBoundary modules preserve document headers — scanner controls', () => {
  it('reports an ErrorBoundary module whose headers do not forward documentHeaders', () => {
    const source = [
      'export function ErrorBoundary() { return null }',
      "export const headers = cacheHeaders('detail')",
    ].join('\n')
    const result = moduleExports(source, 'synthetic.tsx')

    expect(result.names.has('ErrorBoundary')).toBe(true)
    expect(result.headerBindings).toEqual([])
  })

  it('accepts composition and alias re-exports that use documentHeaders', () => {
    const composed = moduleExports(
      [
        'export function ErrorBoundary() { return null }',
        "export const headers = compose(documentHeaders, cacheHeaders('detail'))",
      ].join('\n'),
      'synthetic.tsx',
    )
    const aliased = moduleExports(
      [
        'export function ErrorBoundary() { return null }',
        'const boundaryHeaders = documentHeaders',
        'export { boundaryHeaders as headers }',
      ].join('\n'),
      'synthetic.tsx',
    )

    expect(composed.headerBindings).toHaveLength(1)
    expect(aliased.headerBindings).toHaveLength(1)
  })
})

describe('public route ErrorBoundary modules preserve document headers', () => {
  it('scans a non-vacuous set (the public layout owns the current boundary)', () => {
    expect(publicBoundaryModules()).toContain('apps/sayaka/src/routes/layout.tsx')
  })

  it('every public module exporting ErrorBoundary forwards documentHeaders through headers()', () => {
    const violations = publicBoundaryModules()
      .filter((file) => !LEGITIMATE_EXCEPTIONS.has(file))
      .filter((file) => {
        const source = readFileSync(join(PROJECT_ROOT, file), 'utf8')
        return moduleExports(source, join(PROJECT_ROOT, file)).headerBindings.length === 0
      })

    expect(violations).toEqual([])
  })
})
