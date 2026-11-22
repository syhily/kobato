import type { SQL } from 'drizzle-orm'

import { liveEntityWhere, promotedEntityWhere } from '@kobato/db/operations/entity-meta'
import { post as postMetaTable } from '@kobato/db/schema/post'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

const dialect = new PgDialect()

function toQuery(where: SQL) {
  return dialect.sqlToQuery(where)
}

describe('liveEntityWhere', () => {
  it('emits all four live conditions by default', () => {
    const query = toQuery(liveEntityWhere(postMetaTable))
    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.sql).toContain('"published" = ')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.sql).toContain('"published_at" <= ')
    expect(query.params).toContain(1)
  })

  it('uses the provided asOf for the publishedAt comparison', () => {
    const asOf = new Date('2026-06-01T12:00:00.000Z')
    const query = toQuery(liveEntityWhere(postMetaTable, { asOf }))
    expect(query.params).toContain(asOf.getTime())
  })

  it('omits the publishedAt condition when includeScheduled is true', () => {
    const query = toQuery(liveEntityWhere(postMetaTable, { includeScheduled: true }))
    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.sql).not.toContain('"published_at"')
  })
})

describe('promotedEntityWhere', () => {
  it('emits exactly the two promoted conditions', () => {
    const query = toQuery(promotedEntityWhere(postMetaTable))
    expect(query.sql).toContain('"published" = ')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.params).toContain(1)
  })

  it('does not emit the live-only legs (deletedAt, publishedAt)', () => {
    const query = toQuery(promotedEntityWhere(postMetaTable))
    expect(query.sql).not.toContain('deleted_at')
    expect(query.sql).not.toContain('published_at')
  })
})
