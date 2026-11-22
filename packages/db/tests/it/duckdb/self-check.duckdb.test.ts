import { runDuckDbSelfCheck } from '@kobato/db/duckdb/self-check'
import { describe, expect, it } from 'vitest'

describe('runDuckDbSelfCheck', () => {
  it('runs the native engine aggregate probe and closes the instance', async () => {
    await expect(runDuckDbSelfCheck()).resolves.toBeUndefined()
  })
})
