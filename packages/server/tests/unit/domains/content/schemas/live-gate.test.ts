import type { SQL } from 'drizzle-orm'

import {
  isLive,
  isPromoted,
  liveContentWhere,
  type LiveMeta,
  promotedContentWhere,
  type PromotedMeta,
} from '@kobato/server/domains/content/schemas/live-gate'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

function liveMeta(overrides: Partial<LiveMeta> = {}): LiveMeta {
  return {
    deletedAt: null,
    published: true,
    publishedRevisionId: 1,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('content/schemas/live-gate — isLive', () => {
  it('returns true when published, not deleted, has revision, and past publishedAt', () => {
    const meta = liveMeta()
    expect(isLive(meta)).toBe(true)
  })

  it('returns false when deletedAt is set', () => {
    const meta = liveMeta({ deletedAt: new Date('2026-01-02T00:00:00.000Z') })
    expect(isLive(meta)).toBe(false)
  })

  it('returns false when published is false', () => {
    const meta = liveMeta({ published: false })
    expect(isLive(meta)).toBe(false)
  })

  it('returns false when publishedRevisionId is null', () => {
    const meta = liveMeta({ publishedRevisionId: null })
    expect(isLive(meta)).toBe(false)
  })

  it('returns false when publishedAt is in the future', () => {
    const meta = liveMeta({ publishedAt: new Date('2099-12-31T00:00:00.000Z') })
    expect(isLive(meta)).toBe(false)
  })

  it('returns true when publishedAt exactly equals asOf', () => {
    const exactDate = new Date('2026-06-01T12:00:00.000Z')
    const meta = liveMeta({ publishedAt: exactDate })
    // not strictly greater, so equal timestamps should be live
    expect(isLive(meta, { asOf: exactDate })).toBe(true)
  })

  it('honours the asOf override in the options bag', () => {
    const meta = liveMeta({ publishedAt: new Date('2026-06-01T00:00:00.000Z') })
    expect(isLive(meta, { asOf: new Date('2026-05-31T00:00:00.000Z') })).toBe(false)
    expect(isLive(meta, { asOf: new Date('2026-06-02T00:00:00.000Z') })).toBe(true)
  })

  it('includes future-dated rows when includeScheduled is true', () => {
    const meta = liveMeta({ publishedAt: new Date('2099-12-31T00:00:00.000Z') })
    expect(isLive(meta, { includeScheduled: true })).toBe(true)
  })

  it('excludes future-dated rows when includeScheduled is false', () => {
    const meta = liveMeta({ publishedAt: new Date('2099-12-31T00:00:00.000Z') })
    expect(isLive(meta, { includeScheduled: false })).toBe(false)
  })

  it('includeScheduled skips only the publishedAt leg', () => {
    expect(isLive(liveMeta({ publishedRevisionId: null }), { includeScheduled: true })).toBe(false)
    expect(isLive(liveMeta({ published: false }), { includeScheduled: true })).toBe(false)
    expect(isLive(liveMeta({ deletedAt: new Date('2020-01-01T00:00:00.000Z') }), { includeScheduled: true })).toBe(
      false,
    )
  })

  it('returns false when deletedAt is a past date (presence check, not date comparison)', () => {
    const past = new Date('2020-01-01T00:00:00.000Z')
    const meta = liveMeta({ deletedAt: past })
    // deletedAt being non-null triggers the check regardless of the date value
    expect(isLive(meta)).toBe(false)
  })
})

const dialect = new PgDialect()

function toQuery(where: SQL) {
  return dialect.sqlToQuery(where)
}

const postColumns = {
  deletedAt: postMetaTable.deletedAt,
  published: postMetaTable.published,
  publishedRevisionId: postMetaTable.publishedRevisionId,
  publishedAt: postMetaTable.publishedAt,
} as const

describe('content/schemas/live-gate — liveContentWhere', () => {
  it('emits all four live conditions by default', () => {
    const query = toQuery(liveContentWhere(postColumns))
    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.sql).toContain('"published" = ')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.sql).toContain('"published_at" <= ')
    // sqlite boolean columns bind as 1/0
    expect(query.params).toContain(1)
  })

  it('uses the provided asOf for the publishedAt comparison', () => {
    const asOf = new Date('2026-06-01T12:00:00.000Z')
    const query = toQuery(liveContentWhere(postColumns, { asOf }))
    // Raw `sql` params bind epoch ms on timestamp_ms columns.
    expect(query.params).toContain(asOf.getTime())
  })

  it('omits the publishedAt condition when includeScheduled is true', () => {
    const query = toQuery(liveContentWhere(postColumns, { includeScheduled: true }))
    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.sql).not.toContain('"published_at"')
  })
})

function promotedMeta(overrides: Partial<PromotedMeta> = {}): PromotedMeta {
  return {
    published: true,
    publishedRevisionId: 1,
    ...overrides,
  }
}

describe('content/schemas/live-gate — isPromoted', () => {
  it('returns true when published with a published revision attached', () => {
    expect(isPromoted(promotedMeta())).toBe(true)
  })

  it('returns false when published is false', () => {
    expect(isPromoted(promotedMeta({ published: false }))).toBe(false)
  })

  it('returns false when publishedRevisionId is null', () => {
    expect(isPromoted(promotedMeta({ publishedRevisionId: null }))).toBe(false)
  })

  it('ignores soft-delete state (a deleted row can still be promoted)', () => {
    const meta = { ...promotedMeta(), deletedAt: new Date('2026-01-02T00:00:00.000Z') }
    expect(isPromoted(meta)).toBe(true)
  })

  it('ignores scheduling (a future publishedAt can still be promoted)', () => {
    const meta = { ...promotedMeta(), publishedAt: new Date('2099-12-31T00:00:00.000Z') }
    expect(isPromoted(meta)).toBe(true)
  })
})

const promotedColumns = {
  published: postMetaTable.published,
  publishedRevisionId: postMetaTable.publishedRevisionId,
} as const

describe('content/schemas/live-gate — promotedContentWhere', () => {
  it('emits exactly the two promoted conditions', () => {
    const query = toQuery(promotedContentWhere(promotedColumns))
    expect(query.sql).toContain('"published" = ')
    expect(query.sql).toContain('"published_revision_id" is not null')
    // sqlite boolean columns bind as 1/0
    expect(query.params).toContain(1)
  })

  it('does not emit the live-only legs (deletedAt, publishedAt)', () => {
    const query = toQuery(promotedContentWhere(promotedColumns))
    expect(query.sql).not.toContain('deleted_at')
    expect(query.sql).not.toContain('published_at')
  })
})
