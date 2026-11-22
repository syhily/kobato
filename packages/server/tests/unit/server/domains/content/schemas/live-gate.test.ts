import { isLive, isPromoted, type LiveMeta, type PromotedMeta } from '@kobato/server/domains/content/schemas/live-gate'
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
    expect(isLive(meta)).toBe(false)
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
