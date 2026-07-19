import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'

// The mutation paths (UserDetailView edit/mute/restore/role/bulk/passkey,
// UsersView invite) all invalidate users data through
// `invalidateUsersCache`, so this suite pins the cache behavior directly
// against a real QueryClient.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// UsersView (and the PostsView/PagesView author pickers) cache the list,
// UserDetailView caches the detail — two procedures in the same namespace,
// two distinct cache entries. The react variant of the orpcQuery utils has
// no standalone `queryKey`; the options builders return the exact key
// under `.queryKey`.
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

    // The grammar this module replaced: TanStack's prefix matcher bails on
    // the first element-type mismatch (string vs nested path array), so the
    // flat keys silently invalidated nothing. Guards against a flat-key
    // reintroduction or an orpc major-upgrade key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'user'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(false)
  })
})
