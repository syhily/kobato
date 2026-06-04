import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SERVER_DIR = join(PROJECT_ROOT, 'src/server')

function walk(dir: string, callback: (filePath: string) => void) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, callback)
    } else if (stat.isFile() && entry.endsWith('.ts')) {
      callback(fullPath)
    }
  }
}

function relativePath(absolutePath: string): string {
  return relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/')
}

function getImports(source: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[^'"]+)\s+from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(source)) !== null) {
    imports.push(match[1])
  }
  return imports
}

describe('server layer constraints', () => {
  it('has no .server.ts files inside src/server/', () => {
    const violations: string[] = []
    walk(SERVER_DIR, (filePath) => {
      if (filePath.endsWith('.server.ts')) {
        violations.push(relativePath(filePath))
      }
    })
    expect(violations).toEqual([])
  })

  it('has no barrel index.ts files inside src/server/', () => {
    const violations: string[] = []
    walk(SERVER_DIR, (filePath) => {
      if (filePath.endsWith('/index.ts')) {
        violations.push(relativePath(filePath))
      }
    })
    expect(violations).toEqual([])
  })

  it('domains/ never imports from http/ or render/', () => {
    const violations: string[] = []
    const domainsDir = join(SERVER_DIR, 'domains')
    walk(domainsDir, (filePath) => {
      const source = readFileSync(filePath, 'utf-8')
      const imports = getImports(source)
      for (const imp of imports) {
        if (imp.startsWith('@/server/http/') || imp.startsWith('@/server/render/')) {
          violations.push(`${relativePath(filePath)} imports ${imp}`)
        }
      }
    })
    expect(violations).toEqual([])
  })

  it('infra/ never imports from domains/, http/, or render/', () => {
    const violations: string[] = []
    const infraDir = join(SERVER_DIR, 'infra')
    walk(infraDir, (filePath) => {
      const source = readFileSync(filePath, 'utf-8')
      const imports = getImports(source)
      for (const imp of imports) {
        if (
          imp.startsWith('@/server/domains/') ||
          imp.startsWith('@/server/http/') ||
          imp.startsWith('@/server/render/')
        ) {
          violations.push(`${relativePath(filePath)} imports ${imp}`)
        }
      }
    })
    expect(violations).toEqual([])
  })

  it('render/ never imports from http/', () => {
    const violations: string[] = []
    const renderDir = join(SERVER_DIR, 'render')
    walk(renderDir, (filePath) => {
      const source = readFileSync(filePath, 'utf-8')
      const imports = getImports(source)
      for (const imp of imports) {
        if (imp.startsWith('@/server/http/')) {
          violations.push(`${relativePath(filePath)} imports ${imp}`)
        }
      }
    })
    expect(violations).toEqual([])
  })
})
