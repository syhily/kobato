import { describe, expect, it } from 'vitest'

import type { AdminPageDto } from '@/shared/types/pages'

import { renderHook } from '#/_helpers/hook'
import { usePagesReducer } from '@/ui/admin/pages/usePagesReducer'

function makePage(id: string): AdminPageDto {
  return {
    id,
    slug: `page-${id}`,
    title: `Page ${id}`,
    summary: '',
    cover: '',
    og: null,
    published: true,
    commentsEnabled: true,
    showToc: false,
    showUpdated: false,
    showFriends: false,
    publishedAt: '2024-01-01T00:00:00.000Z',
    publishedRevisionId: 'rev-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    deletedAt: null,
    authorId: null,
    authorName: 'Author',
    commentCount: 0,
    commentPublicId: `comment-${id}`,
  }
}

describe('ui/admin/pages/usePagesReducer', () => {
  it('starts with the default state', () => {
    const { state } = renderHook(usePagesReducer)
    expect(state.rows).toEqual([])
    expect(state.total).toBe(0)
    expect(state.q).toBe('')
    expect(state.status).toBe('all')
    expect(state.deletedStatus).toBe('normal')
    expect(state.published).toBeUndefined()
    expect(state.authorId).toBe('')
  })

  it('derives published status', () => {
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setStatus', value: 'published' })],
    })
    expect(state.status).toBe('published')
    expect(state.deletedStatus).toBe('normal')
    expect(state.published).toBe(true)
  })

  it('derives draft status', () => {
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setStatus', value: 'draft' })],
    })
    expect(state.status).toBe('draft')
    expect(state.published).toBe(false)
  })

  it('derives deleted status', () => {
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setStatus', value: 'deleted' })],
    })
    expect(state.status).toBe('deleted')
    expect(state.deletedStatus).toBe('deleted')
    expect(state.published).toBeUndefined()
  })

  it('loads rows and total', () => {
    const rows = [makePage('1'), makePage('2')]
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'loaded', rows, total: 5 })],
    })
    expect(state.rows).toEqual(rows)
    expect(state.total).toBe(5)
  })

  it('updates search query', () => {
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setQ', value: 'hello' })],
    })
    expect(state.q).toBe('hello')
  })

  it('updates author filter', () => {
    const { state } = renderHook(usePagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setAuthorId', value: 'author-1' })],
    })
    expect(state.authorId).toBe('author-1')
  })

  it('patches a page in place', () => {
    const page = makePage('1')
    const { state } = renderHook(usePagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [page], total: 1 }),
        (r) =>
          r.dispatch({
            type: 'patchPage',
            page: { ...page, title: 'Updated' },
          }),
      ],
    })
    expect(state.rows[0]!.title).toBe('Updated')
    expect(state.total).toBe(1)
  })

  it('removes a page and decrements total', () => {
    const a = makePage('1')
    const b = makePage('2')
    const { state } = renderHook(usePagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [a, b], total: 2 }),
        (r) => r.dispatch({ type: 'removePage', id: a.id }),
      ],
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe(b.id)
    expect(state.total).toBe(1)
  })

  it('prepends a page and increments total', () => {
    const existing = makePage('1')
    const fresh = makePage('2')
    const { state } = renderHook(usePagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [existing], total: 1 }),
        (r) => r.dispatch({ type: 'prependPage', page: fresh }),
      ],
    })
    expect(state.rows[0]!.id).toBe(fresh.id)
    expect(state.rows[1]!.id).toBe(existing.id)
    expect(state.total).toBe(2)
  })
})
