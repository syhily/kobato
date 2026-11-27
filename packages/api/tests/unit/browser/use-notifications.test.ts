import type { MockInstance } from 'vitest'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { patchNotificationReadState } from '@kobato/api/browser/use-notifications'
import {
  cachedNotificationItems,
  cachedUnreadNotificationCount,
  makeNotificationItem,
  notificationListKey,
  seedNotificationTab,
} from '@kobato/api/tests/utils/notifications'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let client: QueryClient
let invalidate: MockInstance<QueryClient['invalidateQueries']>

beforeEach(() => {
  client = new QueryClient()
  invalidate = vi.spyOn(client, 'invalidateQueries')
})

describe('browser/use-notifications read-state cache patch', () => {
  it('leaves the unread tab untouched when the flip is to unread', () => {
    const item = makeNotificationItem()
    seedNotificationTab(client, 'unread', [item])

    patchNotificationReadState(client, [item.id], false, 1)

    expect(cachedNotificationItems(client, 'unread')).toHaveLength(1)
  })

  it('falls back to a full invalidation for a notifications key it cannot parse', () => {
    const item = makeNotificationItem()
    seedNotificationTab(client, 'all', [item])
    client.setQueryData([['public', 'notifications', 'futureProcedure'], { type: 'query' }], {
      whatever: true,
    })

    patchNotificationReadState(client, [item.id], true, 3)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.public.notifications.key() })
    expect(cachedNotificationItems(client, 'all')[0].read).toBe(true)
    expect(cachedUnreadNotificationCount(client)).toEqual({ count: 3 })
  })

  it('never throws when a cached page set has an unexpected shape', () => {
    client.setQueryData(notificationListKey('all'), 'not pages')

    expect(() => patchNotificationReadState(client, ['1'], true, 1)).not.toThrow()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.public.notifications.key() })
  })
})
