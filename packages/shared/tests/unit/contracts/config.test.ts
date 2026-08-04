import { CONFIG_TABLE } from '@kobato/server/infra/config'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contract: `kobato.config.example.json` is the operator-facing sample of
// the real `kobato.config.json`, whose only source of truth is CONFIG_TABLE
// (`src/server/infra/config.ts`). The two can drift silently — a table row
// added without updating the example (or an example key the strict file
// schema would reject) — so the flattened dot-path key sets must match
// exactly.
//
// Legacy keys (`auth.sessionSecret`, `paths.*`, `logging.level`, `redis`,
// `database`) are NOT part of this mapping: they exist only inside
// migrateLegacyKeys so old files keep booting, they carry no CONFIG_TABLE
// row, and they must never appear in the example.

/** Flatten nested object keys into dot paths (`storage.database`). */
function flattenKeys(value: unknown, prefix: string, out: string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    out.push(prefix)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    flattenKeys(child, prefix === '' ? key : `${prefix}.${key}`, out)
  }
}

describe('contract: kobato.config.example.json mirrors CONFIG_TABLE', () => {
  it('declares exactly the CONFIG_TABLE keys (flattened dot paths)', () => {
    const example: unknown = JSON.parse(readFileSync('kobato.config.example.json', 'utf8'))
    const exampleKeys: string[] = []
    flattenKeys(example, '', exampleKeys)

    const tableKeys = CONFIG_TABLE.map((entry) => entry.path.join('.'))

    expect(exampleKeys.sort()).toEqual([...tableKeys].sort())
  })
})
