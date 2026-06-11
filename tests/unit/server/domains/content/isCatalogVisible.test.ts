import { describe, expect, it } from 'vitest'

import { isCatalogVisible, type CatalogVisibleMeta } from '@/server/domains/content/schema'

function visibleMeta(overrides: Partial<CatalogVisibleMeta> = {}): CatalogVisibleMeta {
  return {
    deletedAt: null,
    published: true,
    publishedRevisionId: 1n,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('content/schema — isCatalogVisible', () => {
  it('returns true when published, not deleted, has revision, and past publishedAt', () => {
    const meta = visibleMeta()
    expect(isCatalogVisible(meta)).toBe(true)
  })

  it('returns false when deletedAt is set', () => {
    const meta = visibleMeta({ deletedAt: new Date('2026-01-02T00:00:00.000Z') })
    expect(isCatalogVisible(meta)).toBe(false)
  })

  it('returns false when published is false', () => {
    const meta = visibleMeta({ published: false })
    expect(isCatalogVisible(meta)).toBe(false)
  })

  it('returns false when publishedRevisionId is null', () => {
    const meta = visibleMeta({ publishedRevisionId: null })
    expect(isCatalogVisible(meta)).toBe(false)
  })

  it('returns false when publishedAt is in the future', () => {
    const meta = visibleMeta({ publishedAt: new Date('2099-12-31T00:00:00.000Z') })
    expect(isCatalogVisible(meta)).toBe(false)
  })

  it('returns true when publishedAt exactly equals asOf', () => {
    const exactDate = new Date('2026-06-01T12:00:00.000Z')
    const meta = visibleMeta({ publishedAt: exactDate })
    // not strictly greater, so equal timestamps should be visible
    expect(isCatalogVisible(meta, exactDate)).toBe(true)
  })

  it('returns false when deletedAt is a past date (presence check, not date comparison)', () => {
    const past = new Date('2020-01-01T00:00:00.000Z')
    const meta = visibleMeta({ deletedAt: past })
    // deletedAt being non-null triggers the check regardless of the date value
    expect(isCatalogVisible(meta)).toBe(false)
  })
})
