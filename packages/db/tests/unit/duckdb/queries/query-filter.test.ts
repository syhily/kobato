import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter.ts'
import { compileAnalyticsQuery, createAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { describe, expect, it } from 'vitest'

const baseQuery = { range: { startAt: 100, endAt: 200 } }

describe('analytics filters', () => {
  it('always filters bots and the resolved range', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where(buildAnalyticsFilter(baseQuery)))
    expect(compiled.sql).toContain('is_bot = FALSE')
    expect(compiled.sql).toContain('timestamp >= to_timestamp(?)')
    expect(compiled.sql).toContain('timestamp < to_timestamp(?)')
    expect(compiled.parameters).toEqual([100, 200])
  })

  it('excludes geo-unknown events (empty country blob) by default', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where(buildAnalyticsFilter(baseQuery)))
    expect(compiled.sql).toContain(`blob7 <> ''`)
    expect(compiled.parameters).toEqual([100, 200])
  })

  it('keeps geo-unknown events when includeUnknown is true', () => {
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery()
        .selectAll()
        .where(buildAnalyticsFilter({ ...baseQuery, includeUnknown: true })),
    )
    expect(compiled.sql).not.toContain(`blob7 <> ''`)
  })

  it('combines entity, dimension, and range filters with bound parameters', () => {
    const filter = buildAnalyticsFilter({
      ...baseQuery,
      entityType: 'post',
      entityId: 7,
      country: 'US',
      path: 'alpha,beta',
    })
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where(filter))
    expect(compiled.sql).toContain(`index1 = ?`)
    expect(compiled.sql).toContain('blob7 in (?)')
    expect(compiled.sql).toContain('blob1 in (?, ?)')
    expect(compiled.parameters).toEqual([100, 200, 'post:7', 'US', 'alpha', 'beta'])
  })

  it('keeps injection payloads out of the SQL text', () => {
    const payload = String.raw`x'); DROP TABLE access_events; --`
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery()
        .selectAll()
        .where(buildAnalyticsFilter({ ...baseQuery, path: payload })),
    )
    expect(compiled.sql).not.toContain('DROP TABLE')
    expect(compiled.parameters).toContain(payload)
  })
})
