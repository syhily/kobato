import { REPO_PACKAGES } from '@tests/arch/workspace-packages'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const DB_SRC = 'packages/db/src'
const IGNORE_DIRS = new Set(['node_modules', 'build', 'dist', 'coverage', 'tmp', '.react-router'])
const BANNED_IMPORTS = ['node:sqlite', 'drizzle-orm', '@duckdb/node-api', '@duckdbfan/drizzle-duckdb'] as const
const BANNED_UNWRAP_NAMES = /\b(?:sqliteOf|sqliteEngineOf|engineOf|DuckDbEngine)\b/
const BANNED_QUERY_CALL =
  /\b(?:db|tx|client|handle)\.(?:select|insert|update|delete|transaction|prepare|exec|run|runAndReadAll)\s*\(/
const INDEXEDDB_OWNERS = new Set(['packages/web/admin/src/ui/editor-shell/drafts/draft-store.ts'])
const BANNED_NATIVE_ACCESS = /\.(?:writer|reader)\.(?:run|runAndReadAll)\s*\(|\.client\.(?:prepare|exec)\s*\(/

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

function sourceOffenders(file: string, source: string): string[] {
  const offenders: string[] = []
  for (const specifier of importSpecifiers(source)) {
    if (BANNED_IMPORTS.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))) {
      offenders.push(`${file}: persistence driver import ${specifier}`)
    }
  }
  if (BANNED_UNWRAP_NAMES.test(source)) {
    offenders.push(`${file}: native unwrap seam escaped @kobato/db`)
  }
  if (
    file.startsWith('packages/server/src/') ||
    file.startsWith('packages/web/admin/src/') ||
    file.startsWith('apps/kobato/src/') ||
    file.startsWith('apps/sayaka/src/')
  ) {
    if (BANNED_QUERY_CALL.test(source) && !INDEXEDDB_OWNERS.has(file)) {
      offenders.push(`${file}: query builder or native statement call`)
    }
    if (BANNED_NATIVE_ACCESS.test(source)) {
      offenders.push(`${file}: native connection access`)
    }
    if (/\bCHECKPOINT\b/.test(source)) {
      offenders.push(`${file}: raw DuckDB CHECKPOINT`)
    }
  }
  return offenders
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) {
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function productionOffenders(): string[] {
  const files: string[] = []
  for (const pkg of REPO_PACKAGES) {
    if (!pkg.dir.startsWith('apps/') && !pkg.dir.startsWith('packages/')) {
      continue
    }
    const src = join(REPO_ROOT, pkg.dir, 'src')
    if (src !== join(REPO_ROOT, DB_SRC)) {
      walk(src, files)
    }
  }
  return files.flatMap((file) => {
    const relativeFile = relative(REPO_ROOT, file)
    return sourceOffenders(relativeFile, stripComments(readFileSync(file, 'utf8')))
  })
}

describe('persistence ownership', () => {
  it('keeps every SQLite/DuckDB driver, unwrap seam, and statement inside @kobato/db', () => {
    expect(productionOffenders()).toEqual([])
  })

  it('detects driver imports, unwrap seams, query calls, and native statements', () => {
    const offenders = sourceOffenders(
      'packages/server/src/example.ts',
      [
        "import { DatabaseSync } from 'node:sqlite'",
        "import { sqliteOf } from '@kobato/db/sqlite/database'",
        'db.select()',
        "handle.writer.run('CHECKPOINT')",
      ].join('\n'),
    )
    expect(offenders).toHaveLength(5)
  })
})
