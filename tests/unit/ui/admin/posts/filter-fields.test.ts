import { describe, expect, it, vi } from 'vitest'

import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import {
  buildPostFilterFields,
  deriveStatusFields,
  type PostFilterFieldKey,
  postFiltersFromSearch,
  syncPostFiltersFromUrl,
} from '@/ui/admin/posts/filter-fields'

const fields = buildPostFilterFields({
  categories: [{ id: 'c-1', name: '前端' }],
  tags: ['react'],
  authors: [{ id: 'u-1', name: '雨帆' }],
})

function fieldSpec(key: PostFilterFieldKey) {
  const field = fields.find((f) => f.key === key)
  if (!field || field.kind !== 'options') {
    throw new Error(`expected an options field for ${key}`)
  }
  return field
}

describe('ui/admin/posts/deriveStatusFields', () => {
  it('maps all to the normal (unfiltered) flags', () => {
    expect(deriveStatusFields('all')).toEqual({ deletedStatus: 'normal' })
  })

  it('maps published to published + visible', () => {
    expect(deriveStatusFields('published')).toEqual({ deletedStatus: 'normal', published: true, visible: true })
  })

  it('maps draft to unpublished', () => {
    expect(deriveStatusFields('draft')).toEqual({ deletedStatus: 'normal', published: false })
  })

  it('maps unlisted to published + visible=false', () => {
    expect(deriveStatusFields('unlisted')).toEqual({ deletedStatus: 'normal', published: true, visible: false })
  })

  it('maps deleted to the deleted flag only', () => {
    expect(deriveStatusFields('deleted')).toEqual({ deletedStatus: 'deleted' })
  })
})

describe('ui/admin/posts/buildPostFilterFields — toQuery projections', () => {
  it('projects every status value onto the list query input', () => {
    const status = fieldSpec('status')
    expect(status.toQuery('published')).toEqual({ deletedStatus: 'normal', published: true, visible: true })
    expect(status.toQuery('draft')).toEqual({ deletedStatus: 'normal', published: false })
    // The posts-only unlisted leg.
    expect(status.toQuery('unlisted')).toEqual({ deletedStatus: 'normal', published: true, visible: false })
    expect(status.toQuery('deleted')).toEqual({ deletedStatus: 'deleted' })
  })

  it('keeps the unlisted leg among the status options', () => {
    const status = fieldSpec('status')
    expect(status.options.map((o) => [o.value, o.label])).toEqual([
      ['published', '已发布'],
      ['draft', '草稿'],
      ['unlisted', '不列出'],
      ['deleted', '已删除'],
    ])
  })

  it('projects the category pill onto categoryId', () => {
    const category = fieldSpec('category')
    expect(category.options).toEqual([{ value: 'c-1', label: '前端' }])
    expect(category.toQuery('c-1')).toEqual({ categoryId: 'c-1' })
  })

  it('projects the tag pill onto tag', () => {
    const tag = fieldSpec('tag')
    expect(tag.options).toEqual([{ value: 'react', label: 'react' }])
    expect(tag.toQuery('react')).toEqual({ tag: 'react' })
  })

  it('projects the author pill onto authorId', () => {
    const author = fieldSpec('author')
    expect(author.options).toEqual([{ value: 'u-1', label: '雨帆' }])
    expect(author.toQuery('u-1')).toEqual({ authorId: 'u-1' })
  })
})

describe('ui/admin/posts/postFiltersFromSearch', () => {
  it('seeds no pills from an empty search', () => {
    expect(postFiltersFromSearch('')).toEqual([])
  })

  it('seeds status, category and tag pills from the URL', () => {
    expect(postFiltersFromSearch('?status=published&category=c-1&tag=react')).toEqual([
      { field: 'status', value: 'published', label: '已发布' },
      { field: 'category', value: 'c-1', label: 'c-1' },
      { field: 'tag', value: 'react', label: 'react' },
    ])
  })

  it.each(['published', 'draft', 'unlisted', 'deleted'])('accepts the %s status from the URL', (value) => {
    const pills = postFiltersFromSearch(`?status=${value}`)
    expect(pills).toHaveLength(1)
    expect(pills[0]).toMatchObject({ field: 'status', value })
  })

  it('maps the pre-rename hidden status to unlisted (fix-review)', () => {
    expect(postFiltersFromSearch('?status=hidden')).toEqual([{ field: 'status', value: 'unlisted', label: '不列出' }])
  })

  it('ignores unknown and all statuses', () => {
    expect(postFiltersFromSearch('?status=unknown')).toEqual([])
    expect(postFiltersFromSearch('?status=all')).toEqual([])
  })
})

describe('ui/admin/posts/syncPostFiltersFromUrl', () => {
  const authorPill: ActiveFilter<PostFilterFieldKey> = { field: 'author', value: 'u-1', label: '雨帆' }

  it('adds URL-backed pills that are not active yet', () => {
    const dispatch = vi.fn<(action: FilterPillsAction<PostFilterFieldKey>) => void>()
    syncPostFiltersFromUrl([], dispatch, '?status=draft&tag=react')
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledWith({ type: 'addFilter', field: 'status', value: 'draft', label: '草稿' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'addFilter', field: 'tag', value: 'react', label: 'react' })
  })

  it('removes URL-backed pills the URL no longer carries', () => {
    const dispatch = vi.fn<(action: FilterPillsAction<PostFilterFieldKey>) => void>()
    const current: ActiveFilter<PostFilterFieldKey>[] = [
      { field: 'status', value: 'draft', label: '草稿' },
      { field: 'category', value: 'c-1', label: 'c-1' },
    ]
    syncPostFiltersFromUrl(current, dispatch, '?tag=react')
    expect(dispatch).toHaveBeenCalledTimes(3)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeFilter', field: 'status' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeFilter', field: 'category' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'addFilter', field: 'tag', value: 'react', label: 'react' })
  })

  it('leaves matching pills and user-added pills untouched', () => {
    const dispatch = vi.fn<(action: FilterPillsAction<PostFilterFieldKey>) => void>()
    const current: ActiveFilter<PostFilterFieldKey>[] = [
      { field: 'status', value: 'published', label: '已发布' },
      authorPill,
    ]
    syncPostFiltersFromUrl(current, dispatch, '?status=published')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
