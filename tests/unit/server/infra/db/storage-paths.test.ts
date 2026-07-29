import { describe, expect, it } from 'vitest'

import { resolveAnalyticsPath } from '@/server/infra/analytics/duckdb'
import { isInMemoryPath, resolveDatabasePath } from '@/server/infra/db/database'

// The unit setup provides the config env (storage__data=/tmp/kobato-data,
// storage__database/storage__analyticsDatabase=:memory:).
describe('storage path resolvers', () => {
  it('passes :memory: through instead of resolving it to a cwd file', () => {
    // Regression: resolveAnalyticsPath used to run path.resolve on the
    // sentinel, silently yielding `<cwd>/:memory:`.
    expect(resolveDatabasePath()).toBe(':memory:')
    expect(resolveAnalyticsPath()).toBe(':memory:')
  })

  it('owns the :memory: convention in one predicate', () => {
    expect(isInMemoryPath(':memory:')).toBe(true)
    expect(isInMemoryPath('/data/kobato.db')).toBe(false)
  })
})
