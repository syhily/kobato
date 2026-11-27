import { readHmrFlag, writeHmrFlag } from '@kobato/server/bootstrap/hmr-state'
import { describe, expect, it } from 'vitest'

describe('bootstrap/hmr-state', () => {
  it('reads no flag and drops every write when no HMR context exists', () => {
    expect(readHmrFlag('secretsMigrated')).toBe(false)

    writeHmrFlag('secretsMigrated', true)

    expect(readHmrFlag('secretsMigrated')).toBe(false)
  })
})
