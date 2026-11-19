import { compileAnalyticsQuery, createAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'

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
