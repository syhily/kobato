import { analyticsIdentifier, compileAnalyticsQuery, createAnalyticsQuery } from '@kobato/db/duckdb/query'
import { accessEvents } from '@kobato/db/duckdb/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('duckDB analytics SQL compiler', () => {
  it('uses the local event table and exact counts', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery({ visits: sql<number>`COUNT(*)` }))
    expect(compiled.sql).toBe('select COUNT(*) as "visits" from "access_events"')
    expect(compiled.params).toEqual([])
  })

  it('keeps user values in bound parameters', () => {
    const payload = String.raw`it's \'; DROP TABLE access_events; --`
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().where(eq(accessEvents.index1, payload)))
    expect(compiled.sql).toContain('where "access_events"."index1" = $1')
    expect(compiled.sql).not.toContain(payload)
    expect(compiled.params).toEqual([payload])
  })

  it('binds pagination and preserves stable ordering', () => {
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery().orderBy(desc(accessEvents.timestamp), desc(accessEvents.eventId)).limit(10),
    )
    expect(compiled.sql).toContain(
      'order by "access_events"."timestamp" desc, "access_events"."event_id" desc limit $1',
    )
    expect(compiled.params).toEqual([10])
  })

  it.each(['invalid-column', 'column;drop', '`column`', 'column.', 'column..drop'])(
    'rejects invalid column %s',
    (column) => {
      expect(() => analyticsIdentifier(column)).toThrow('Invalid Analytics identifier')
    },
  )

  it('quotes result aliases', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery({ 'invalid-alias': accessEvents.blob1 }))
    expect(compiled.sql).toContain('"blob1" as "invalid-alias"')
  })
})
