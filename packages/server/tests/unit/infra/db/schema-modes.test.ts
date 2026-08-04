import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Schema-lint: the SQLite migration standardised every timestamp column
// on `integer({ mode: 'timestamp_ms' })` (epoch ms — node:sqlite throws
// on integers beyond 2^53, and the other modes invite exactly that).
// Any new column using another mode (`timestamp`, `date`, or a bare
// drizzle `timestamp()` builder) fails here at authoring time, not in
// production.
const SCHEMA_DIR = join(process.cwd(), 'packages/server/src/infra/db/schema')

function schemaSources(): [string, string][] {
  return readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(SCHEMA_DIR, name), 'utf-8')])
}

describe('contract: schema column modes', () => {
  it('every timestamp column uses timestamp_ms', () => {
    const offenders: string[] = []
    for (const [name, source] of schemaSources()) {
      // `mode: 'timestamp'` exactly (no _ms suffix), and the date-only mode.
      for (const match of source.matchAll(/mode:\s*'(timestamp|date)'/g)) {
        offenders.push(`${name}: mode: '${match[1]}'`)
      }
      // The drizzle timestamp()/date() builders must never appear.
      for (const match of source.matchAll(/\b(?:timestamp|date)\(/g)) {
        offenders.push(`${name}: ${match[0]} builder`)
      }
    }
    expect(offenders).toEqual([])
  })
})
