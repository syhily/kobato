import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'packages/web/ui/src')
const MANIFEST = join(process.cwd(), 'packages/web/ui/package.json')
const BANNED = '@kobato/api'

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      listSources(path, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

describe('UI API-free contract (ADR-0011 §1)', () => {
  it("no module under src imports @kobato/api — a module that calls a procedure is a kit module or an app's own", () => {
    const offenders: string[] = []
    for (const file of listSources(SRC)) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const specifier of importSpecifiers(source)) {
        if (specifier === BANNED || specifier.startsWith(`${BANNED}/`)) {
          offenders.push(`${relative(SRC, file)}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('declares no @kobato/api dependency', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, Record<string, string>>
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    expect(declared.filter((name) => name === BANNED)).toEqual([])
  })
})
