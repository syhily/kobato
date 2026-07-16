import { describe, expect, it } from 'vitest'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderHook } from '#/_helpers/hook'
import { usePostsReducer } from '@/ui/admin/posts/usePostsReducer'

describe('ui/admin/posts/usePostsReducer', () => {
  it('derives an empty search into the default state', () => {
    const { state } = renderHook(usePostsReducer)
    expect(state.status).toBe('all')
    expect(state.deletedStatus).toBe('normal')
    expect(state.published).toBeUndefined()
    expect(state.visible).toBeUndefined()
    expect(state.category).toBe('')
    expect(state.tag).toBe('')
    expect(state.q).toBe('')
    expect(state.authorId).toBe('')
    expect(state.sortBy).toBe('publishedAt')
    expect(state.sortOrder).toBe('desc')
    expect(state.pageSize).toBe(10)
  })

  it('reads status, category and tag from the URL', () => {
    const { state } = renderHook(usePostsReducer, {
      initialPath: '/?status=published&category=tech&tag=react',
    })
    expect(state.status).toBe('published')
    expect(state.published).toBe(true)
    expect(state.visible).toBe(true)
    expect(state.deletedStatus).toBe('normal')
    expect(state.category).toBe('tech')
    expect(state.tag).toBe('react')
  })

  it('derives draft status', () => {
    const { state } = renderHook(usePostsReducer, { initialPath: '/?status=draft' })
    expect(state.status).toBe('draft')
    expect(state.published).toBe(false)
    expect(state.visible).toBeUndefined()
  })

  it('derives hidden status', () => {
    const { state } = renderHook(usePostsReducer, { initialPath: '/?status=hidden' })
    expect(state.status).toBe('hidden')
    expect(state.published).toBe(true)
    expect(state.visible).toBe(false)
  })

  it('derives deleted status', () => {
    const { state } = renderHook(usePostsReducer, { initialPath: '/?status=deleted' })
    expect(state.status).toBe('deleted')
    expect(state.deletedStatus).toBe('deleted')
    expect(state.published).toBeUndefined()
    expect(state.visible).toBeUndefined()
  })

  it('ignores unknown status values', () => {
    const { state } = renderHook(usePostsReducer, { initialPath: '/?status=unknown' })
    expect(state.status).toBe('all')
  })

  it('loads rows and total', () => {
    const rows = [makeAdminPost(), makeAdminPost()]
    const { state } = renderHook(usePostsReducer, {
      actions: [(r) => r.dispatch({ type: 'loaded', rows, total: 5 })],
    })
    expect(state.rows).toEqual(rows)
    expect(state.total).toBe(5)
  })

  it('updates search query', () => {
    const { state } = renderHook(usePostsReducer, {
      actions: [(r) => r.dispatch({ type: 'setQ', value: 'hello' })],
    })
    expect(state.q).toBe('hello')
  })

  it('updates status and derived fields', () => {
    const { state } = renderHook(usePostsReducer, {
      actions: [(r) => r.dispatch({ type: 'setStatus', value: 'draft' })],
    })
    expect(state.status).toBe('draft')
    expect(state.published).toBe(false)
    expect(state.deletedStatus).toBe('normal')
  })

  it('updates category and tag filters', () => {
    const { state } = renderHook(usePostsReducer, {
      actions: [
        (r) => r.dispatch({ type: 'setCategory', value: 'life' }),
        (r) => r.dispatch({ type: 'setTag', value: 'vue' }),
        (r) => r.dispatch({ type: 'setAuthorId', value: 'user-1' }),
      ],
    })
    expect(state.category).toBe('life')
    expect(state.tag).toBe('vue')
    expect(state.authorId).toBe('user-1')
  })

  it('updates sort options', () => {
    const { state } = renderHook(usePostsReducer, {
      actions: [
        (r) => r.dispatch({ type: 'setSortBy', value: 'updatedAt' }),
        (r) => r.dispatch({ type: 'setSortOrder', value: 'asc' }),
      ],
    })
    expect(state.sortBy).toBe('updatedAt')
    expect(state.sortOrder).toBe('asc')
  })

  it('patches a post in place', () => {
    const post = makeAdminPost({ title: 'Original' })
    const { state } = renderHook(usePostsReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [post], total: 1 }),
        (r) => r.dispatch({ type: 'patchPost', post: { ...post, title: 'Updated' } }),
      ],
    })
    expect(state.rows[0]!.title).toBe('Updated')
    expect(state.total).toBe(1)
  })

  it('removes a post and decrements total', () => {
    const a = makeAdminPost()
    const b = makeAdminPost()
    const { state } = renderHook(usePostsReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [a, b], total: 2 }),
        (r) => r.dispatch({ type: 'removePost', id: a.id }),
      ],
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe(b.id)
    expect(state.total).toBe(1)
  })

  it('prepends a post and increments total', () => {
    const existing = makeAdminPost()
    const fresh = makeAdminPost()
    const { state } = renderHook(usePostsReducer, {
      actions: [
        (r) => r.dispatch({ type: 'loaded', rows: [existing], total: 1 }),
        (r) => r.dispatch({ type: 'prependPost', post: fresh }),
      ],
    })
    expect(state.rows[0]!.id).toBe(fresh.id)
    expect(state.rows[1]!.id).toBe(existing.id)
    expect(state.total).toBe(2)
  })
})
