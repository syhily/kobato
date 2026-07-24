import type { SQL } from 'drizzle-orm'

import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { isPromoted, promotedContentWhere, type PromotedMeta } from '@/server/domains/content/schema'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

function promotedMeta(overrides: Partial<PromotedMeta> = {}): PromotedMeta {
  return {
    published: true,
    publishedRevisionId: 1n,
    ...overrides,
  }
}

describe('content/schema — isPromoted', () => {
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

const dialect = new PgDialect()

function toQuery(where: SQL) {
  return dialect.sqlToQuery(where)
}

const postColumns = {
  published: postMetaTable.published,
  publishedRevisionId: postMetaTable.publishedRevisionId,
} as const

describe('content/schema — promotedContentWhere', () => {
  it('emits exactly the two promoted conditions', () => {
    const query = toQuery(promotedContentWhere(postColumns))
    expect(query.sql).toContain('"published" = ')
    expect(query.sql).toContain('"published_revision_id" is not null')
    expect(query.params).toContain(true)
  })

  it('does not emit the live-only legs (deletedAt, publishedAt)', () => {
    const query = toQuery(promotedContentWhere(postColumns))
    expect(query.sql).not.toContain('deleted_at')
    expect(query.sql).not.toContain('published_at')
  })
})
