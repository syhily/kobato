import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { buildAdminListConditions } from '@/server/domains/comments/repos/shared'

// Drizzle's `SQL` objects don't expose their rendered SQL string
// directly, but `sql.toQuery({ escapeName, escapeParam, escapeString })`
// returns a `{ sql, params }` pair. The pg dialect ships with the
// package, so we reuse it here instead of hand-rolling the helpers
// — the rendered SQL is what the real driver would send.
const pgDialect = new PgDialect()

function render(sqlObj: ReturnType<typeof buildAdminListConditions>[number]): { sql: string; params: unknown[] } {
  const query = sqlObj.toQuery({
    escapeName: pgDialect.escapeName.bind(pgDialect),
    escapeParam: pgDialect.escapeParam.bind(pgDialect),
    escapeString: pgDialect.escapeString.bind(pgDialect),
  })
  return { sql: query.sql, params: query.params }
}

describe('buildAdminListConditions — text filter', () => {
  it('does not add a text condition when `q` is empty', () => {
    const conditions = buildAdminListConditions({ q: '' })
    // Only the deletedAt guard — no text predicate.
    expect(conditions).toHaveLength(1)
  })

  it('does not add a text condition when `q` is whitespace only', () => {
    const conditions = buildAdminListConditions({ q: '   ' })
    expect(conditions).toHaveLength(1)
  })

  it('adds a `LIKE` predicate by default (`match` omitted)', () => {
    const conditions = buildAdminListConditions({ q: 'foo' })
    expect(conditions).toHaveLength(2)
    const { sql, params } = render(conditions[1]!)
    expect(sql).toMatch(/\bcontent\b.*\blike\b/i)
    expect(sql).toMatch(/escape\s+'\\'/i)
    expect(sql).not.toMatch(/\bNOT\b/i)
    expect(params).toEqual(['%foo%'])
  })

  it('adds an `ILIKE` predicate when `match: "contains"` is explicit', () => {
    const conditions = buildAdminListConditions({ q: 'foo', match: 'contains' })
    expect(conditions).toHaveLength(2)
    const { sql, params } = render(conditions[1]!)
    expect(sql).toMatch(/\bcontent\b.*\blike\b/i)
    expect(sql).toMatch(/escape\s+'\\'/i)
    expect(sql).not.toMatch(/\bNOT\b/i)
    expect(params).toEqual(['%foo%'])
  })

  it('adds a `NOT ILIKE` predicate when `match: "does-not-contain"` is set', () => {
    const conditions = buildAdminListConditions({ q: 'spam', match: 'does-not-contain' })
    expect(conditions).toHaveLength(2)
    const { sql, params } = render(conditions[1]!)
    expect(sql).toMatch(/\bNOT\b/i)
    expect(sql).toMatch(/\bcontent\b.*\blike\b/i)
    expect(sql).toMatch(/escape\s+'\\'/i)
    expect(params).toEqual(['%spam%'])
  })

  it('escapes LIKE wildcards in `q` so user input cannot match arbitrary substrings', () => {
    const conditions = buildAdminListConditions({ q: '50%' })
    expect(conditions).toHaveLength(2)
    const { params } = render(conditions[1]!)
    // The `%` from the user should be backslash-escaped; the wrapping
    // wildcards are added by the repo, not interpolated from input.
    expect(params).toEqual(['%50\\%%'])
  })

  it('escapes the backslash itself so searching for a literal backslash works', () => {
    const conditions = buildAdminListConditions({ q: 'C:\\Users' })
    expect(conditions).toHaveLength(2)
    const { params } = render(conditions[1]!)
    // Backslashes are doubled so PostgreSQL treats them as literal.
    expect(params).toEqual(['%C:\\\\Users%'])
  })
})

describe('buildAdminListConditions — status filter', () => {
  it('stacks the pending predicate and excludes delete-requested rows', () => {
    const conditions = buildAdminListConditions({ status: 'pending' })
    // deletedAt + isPending + deleteRequestedAt IS NULL
    expect(conditions).toHaveLength(3)
  })

  it('stacks the approved predicate and excludes delete-requested rows', () => {
    const conditions = buildAdminListConditions({ status: 'approved' })
    // deletedAt + isPending=false + deleteRequestedAt IS NULL
    expect(conditions).toHaveLength(3)
  })

  it('stacks the delete-requested predicate', () => {
    const conditions = buildAdminListConditions({ status: 'deleteRequested' })
    // deletedAt + deleteRequestedAt IS NOT NULL
    expect(conditions).toHaveLength(2)
  })

  it('stacks the text predicate alongside the pending-status predicate', () => {
    const conditions = buildAdminListConditions({ q: 'foo', status: 'pending' })
    // deletedAt + isPending + deleteRequestedAt IS NULL + text
    expect(conditions).toHaveLength(4)
  })
})

describe('buildAdminListConditions — date filter', () => {
  const after = new Date('2026-06-01T00:00:00.000Z')
  const before = new Date('2026-06-30T23:59:59.999Z')

  it('does not add a date condition when neither bound is set', () => {
    const conditions = buildAdminListConditions({})
    // Only the deletedAt guard.
    expect(conditions).toHaveLength(1)
  })

  it('adds a `createdAt >= ?` condition when `createdAfter` is set', () => {
    const conditions = buildAdminListConditions({ createdAfter: after })
    expect(conditions).toHaveLength(2)
    const { sql, params } = render(conditions[1]!)
    // Drizzle renders the column reference first, then the operator:
    // `"comment"."created_at" >= $1`. The regex is order-tolerant so
    // it still matches if Drizzle ever flips the order.
    expect(sql).toMatch(/(created_at.*>=|>=.*created_at)/i)
    // timestamp_ms columns parameterise `Date` values as epoch ms.
    expect(params).toEqual([after.getTime()])
  })

  it('adds a `createdAt <= ?` condition when `createdBefore` is set', () => {
    const conditions = buildAdminListConditions({ createdBefore: before })
    expect(conditions).toHaveLength(2)
    const { sql, params } = render(conditions[1]!)
    expect(sql).toMatch(/(created_at.*<=|<=.*created_at)/i)
    expect(params).toEqual([before.getTime()])
  })

  it('stacks both bounds alongside the text predicate', () => {
    const conditions = buildAdminListConditions({
      createdAfter: after,
      createdBefore: before,
      q: 'foo',
    })
    // deletedAt + gte + lte + ilike
    expect(conditions).toHaveLength(4)
  })

  it('stacks both bounds alongside the pending-status predicate', () => {
    const conditions = buildAdminListConditions({
      createdAfter: after,
      createdBefore: before,
      status: 'pending',
    })
    // deletedAt + isPending + deleteRequestedAt IS NULL + gte + lte
    expect(conditions).toHaveLength(5)
  })
})
