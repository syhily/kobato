import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CONFIG_TABLE } from '@/server/infra/config'

// Contract: `kobato.config.example.json`'s flattened dot-path key set must
// exactly equal CONFIG_TABLE's. Legacy keys live only in migrateLegacyKeys
// (so old files keep booting) and must never appear in the example.

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
