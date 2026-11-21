import { isInMemoryPath } from '@kobato/db/database'
import { resolveAnalyticsPath, resolveDatabasePath } from '@kobato/server/infra/db/paths'
import { describe, expect, it } from 'vitest'

describe('storage path resolvers', () => {
  it('passes :memory: through instead of resolving it to a cwd file', () => {
    expect(resolveDatabasePath()).toBe(':memory:')
    expect(resolveAnalyticsPath()).toBe(':memory:')
  })

  it('owns the :memory: convention in one predicate', () => {
    expect(isInMemoryPath(':memory:')).toBe(true)
    expect(isInMemoryPath('/data/kobato.db')).toBe(false)
  })
})
