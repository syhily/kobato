import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useUsersReducer } from '@/ui/admin/users/useUsersReducer'

function makeUser(id: string): AdminUserDto {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    role: 'author',
    isMuted: false,
    emailVerified: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    commentCount: 0,
    pendingCount: 0,
    lastCommentAt: null,
    passkeyCount: 0,
    passkeyForce: false,
  }
}

import type { AdminUserDto } from '@/shared/types/users'

describe('ui/admin/users/useUsersReducer', () => {
  it('starts with the default state', () => {
    const { state } = renderHook(useUsersReducer)
    expect(state.rows).toEqual([])
    expect(state.total).toBe(0)
    expect(state.hasMore).toBe(false)
    expect(state.q).toBe('')
    expect(state.role).toBe('all')
    expect(state.sortBy).toBe('recent')
    expect(state.includeDeleted).toBe(false)
    expect(state.pageSize).toBe(20)
  })

  it('loads rows and total', () => {
    const rows = [makeUser('1'), makeUser('2')]
    const { state } = renderHook(useUsersReducer, {
      actions: [(r) => r.dispatch({ type: 'loaded', rows, total: 5, hasMore: true })],
    })
    expect(state.rows).toEqual(rows)
    expect(state.total).toBe(5)
    expect(state.hasMore).toBe(true)
  })

  it('appends rows and updates total/hasMore', () => {
    const first = makeUser('1')
    const second = makeUser('2')
    const { state } = renderHook(useUsersReducer, {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            rows: [first],
            total: 3,
            hasMore: true,
          }),
        (r) =>
          r.dispatch({
            type: 'appended',
            rows: [second],
            total: 3,
            hasMore: false,
          }),
      ],
    })
    expect(state.rows).toEqual([first, second])
    expect(state.total).toBe(3)
    expect(state.hasMore).toBe(false)
  })

  it('updates search query', () => {
    const { state } = renderHook(useUsersReducer, {
      actions: [(r) => r.dispatch({ type: 'setQ', value: 'alice' })],
    })
    expect(state.q).toBe('alice')
  })

  it('updates role filter', () => {
    const { state } = renderHook(useUsersReducer, {
      actions: [(r) => r.dispatch({ type: 'setRole', value: 'admin' })],
    })
    expect(state.role).toBe('admin')
  })

  it('updates sort options', () => {
    const { state } = renderHook(useUsersReducer, {
      actions: [
        (r) => r.dispatch({ type: 'setSortBy', value: 'commentCount' }),
        (r) => r.dispatch({ type: 'setPageSize', value: 50 }),
      ],
    })
    expect(state.sortBy).toBe('commentCount')
    expect(state.pageSize).toBe(50)
  })

  it('toggles deleted users inclusion', () => {
    const { state } = renderHook(useUsersReducer, {
      actions: [(r) => r.dispatch({ type: 'setIncludeDeleted', value: true })],
    })
    expect(state.includeDeleted).toBe(true)
  })

  it('patches a user in place', () => {
    const user = makeUser('1')
    const { state } = renderHook(useUsersReducer, {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            rows: [user],
            total: 1,
            hasMore: false,
          }),
        (r) => r.dispatch({ type: 'patchUser', user: { ...user, name: 'Updated' } }),
      ],
    })
    expect(state.rows[0]!.name).toBe('Updated')
    expect(state.total).toBe(1)
  })

  it('removes a user', () => {
    const a = makeUser('1')
    const b = makeUser('2')
    const { state } = renderHook(useUsersReducer, {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            rows: [a, b],
            total: 2,
            hasMore: false,
          }),
        (r) => r.dispatch({ type: 'removeUser', id: a.id }),
      ],
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe(b.id)
    expect(state.total).toBe(2)
  })
})
