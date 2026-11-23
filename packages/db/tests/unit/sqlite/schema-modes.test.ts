import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCHEMA_DIR = join(process.cwd(), 'packages/db/src/sqlite/schema')

function schemaSources(): [string, string][] {
  return readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(SCHEMA_DIR, name), 'utf-8')])
}

describe('contract: schema column modes', () => {
  it('every timestamp column uses timestamp_ms', () => {
    const offenders: string[] = []
    for (const [name, source] of schemaSources()) {
      for (const match of source.matchAll(/mode:\s*'(timestamp|date)'/g)) {
        offenders.push(`${name}: mode: '${match[1]}'`)
      }
      for (const match of source.matchAll(/\b(?:timestamp|date)\(/g)) {
        offenders.push(`${name}: ${match[0]} builder`)
      }
    }
    expect(offenders).toEqual([])
  })
})
