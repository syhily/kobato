import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'

// Pins `invalidateUsersCache` (used by all users mutation paths) against a real QueryClient.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// orpcQuery options builders expose the exact query key under `.queryKey`.
function seedUsersCaches(qc: QueryClient) {
  const listKey = orpcQuery.admin.users.list.queryOptions({ input: { offset: 0, limit: 20 } }).queryKey
  const detailKey = orpcQuery.admin.users.get.queryOptions({ input: { id: 'user-1' } }).queryKey
  qc.setQueryData(listKey, { users: [], total: 0, hasMore: false })
  qc.setQueryData(detailKey, { user: null })
  return { listKey, detailKey }
}

describe('ui/admin/users/invalidateUsersCache', () => {
  it('invalidates both the users list and the user detail caches', () => {
    const qc = makeQueryClient()
    const { listKey, detailKey } = seedUsersCaches(qc)

    invalidateUsersCache(qc)

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true)
  })

  it('premise pin: a flat [admin, user(s)] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { listKey, detailKey } = seedUsersCaches(qc)

    void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'user'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(false)
  })
})
