import { describe, expect, it } from 'vitest'

import type { PageMetaDraft, UpsertPageMetaInput } from '@/shared/types/pages'

import { upsertPageMetaSchema } from '@/server/domains/pages/schema'
import { EMPTY_PAGE_META_DRAFT, PAGE_META_TOGGLE_FIELDS, pageMetaDraftsEqual } from '@/shared/types/pages'
import { POST_META_TOGGLE_FIELDS } from '@/shared/types/posts'

describe('cms-pages meta shape contract', () => {
  it('EMPTY_PAGE_META_DRAFT carries every PageMetaDraft key', () => {
    const expected: Record<keyof PageMetaDraft, true> = {
      slug: true,
      title: true,
      summary: true,
      cover: true,
      og: true,
      published: true,
      commentsEnabled: true,
      showToc: true,
      showUpdated: true,
      showFriends: true,
      publishedAt: true,
    }
    expect(new Set(Object.keys(EMPTY_PAGE_META_DRAFT))).toEqual(new Set(Object.keys(expected)))
  })

  it('PageMetaDraft keys round-trip into UpsertPageMetaInput shape', () => {
    const draft: PageMetaDraft = {
      ...EMPTY_PAGE_META_DRAFT,
      title: 'About',
      slug: 'about',
      published: true,
      publishedAt: '2026-01-02T10:00:00+08:00',
    }
    const wire: UpsertPageMetaInput = {
      title: draft.title,
      slug: draft.slug || undefined,
      summary: draft.summary,
      cover: draft.cover,
      og: draft.og === '' ? null : draft.og,
      published: draft.published,
      commentsEnabled: draft.commentsEnabled,
      showToc: draft.showToc,
      showUpdated: draft.showUpdated,
      showFriends: draft.showFriends,
      publishedAt: draft.publishedAt === '' ? undefined : draft.publishedAt,
    }
    const parsed = upsertPageMetaSchema.parse(wire)
    expect(parsed.title).toBe('About')
    expect(parsed.slug).toBe('about')
    expect(parsed.published).toBe(true)
  })

  it('pageMetaDraftsEqual treats identical drafts as equal', () => {
    expect(pageMetaDraftsEqual(EMPTY_PAGE_META_DRAFT, { ...EMPTY_PAGE_META_DRAFT })).toBe(true)
  })

  it('pageMetaDraftsEqual flags any single-field change', () => {
    const mutated: PageMetaDraft = { ...EMPTY_PAGE_META_DRAFT, title: 'Different' }
    expect(pageMetaDraftsEqual(EMPTY_PAGE_META_DRAFT, mutated)).toBe(false)
  })

  it('PAGE_META_TOGGLE_FIELDS keys exist on PageMetaDraft and ids are unique', () => {
    const ids = new Set<string>()
    for (const field of PAGE_META_TOGGLE_FIELDS) {
      expect(field.key in EMPTY_PAGE_META_DRAFT).toBe(true)
      expect(typeof (EMPTY_PAGE_META_DRAFT as unknown as Record<string, unknown>)[field.key]).toBe('boolean')
      expect(ids.has(field.id)).toBe(false)
      ids.add(field.id)
    }
  })

  it('POST_META_TOGGLE_FIELDS ids are unique', () => {
    const ids = new Set<string>()
    for (const field of POST_META_TOGGLE_FIELDS) {
      expect(ids.has(field.id)).toBe(false)
      ids.add(field.id)
    }
  })
})
