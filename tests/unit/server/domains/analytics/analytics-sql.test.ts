import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'

import { compileAnalyticsQuery, createAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { buildAnalyticsFilter } from '@/server/domains/analytics/services/query-filter'

// SQL-injection regression suite ported from Slite (tests/unit/analytics-sql.spec.ts),
// adapted to kobato's range-based filter (is_bot + [startAt, endAt) are always present).

const baseQuery = { range: { startAt: 100, endAt: 200 } }

describe('duckDB analytics SQL compiler', () => {
  it('uses the local event table and exact counts', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().select(sql<number>`COUNT(*)`.as('visits')))
    expect(compiled.sql).toBe('select COUNT(*) as visits from access_events')
    expect(compiled.parameters).toEqual([])
  })

  it('keeps user values in bound parameters', () => {
    const payload = String.raw`it's \'; DROP TABLE access_events; --`
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where('index1', '=', payload))
    expect(compiled.sql).toBe('select * from access_events where index1 = ?')
    expect(compiled.sql).not.toContain(payload)
    expect(compiled.parameters).toEqual([payload])
  })

  it('binds pagination and preserves stable ordering', () => {
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery().selectAll().orderBy('timestamp', 'desc').orderBy('event_id', 'desc').limit(10),
    )
    expect(compiled.sql).toContain('order by timestamp desc, event_id desc limit ?')
    expect(compiled.parameters).toEqual([10])
  })

  it.each(['invalid-column', 'column;drop', '`column`'])('rejects invalid column %s', (column) => {
    expect(() => compileAnalyticsQuery(createAnalyticsQuery().select(sql.ref(column).as('value')))).toThrow(
      'Invalid Analytics identifier',
    )
  })

  it('rejects invalid result aliases', () => {
    expect(() => compileAnalyticsQuery(createAnalyticsQuery().select(sql.ref('blob1').as('invalid-alias')))).toThrow(
      'Invalid Analytics identifier',
    )
  })
})

describe('analytics filters', () => {
  it('always filters bots and the resolved range', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where(buildAnalyticsFilter(baseQuery)))
    expect(compiled.sql).toContain('is_bot = FALSE')
    expect(compiled.sql).toContain('timestamp >= to_timestamp(?)')
    expect(compiled.sql).toContain('timestamp < to_timestamp(?)')
    expect(compiled.parameters).toEqual([100, 200])
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
