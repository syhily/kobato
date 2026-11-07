import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { user } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

const db = getTestDb()

let seq = 0
async function seedUser(role: 'admin' | 'visitor', name: string): Promise<number> {
  seq += 1
  const rows = await db
    .insert(user)
    .values({ name, email: `${name}-${seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return rows[0]!.id
}

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
})

async function callJson(path: string, input: unknown, ctx: Parameters<typeof callRpc>[2]) {
  const res = await callRpc(path, input, ctx)
  return { status: res.status, json: (await res.json()) as { json: unknown } }
}

describe('integration / notifications controller', () => {
  it('requires auth for the inbox procedures', async () => {
    const res = await callRpc('/notifications/list', { tab: 'all', limit: 20 }, makePublicCtx({ db }))
    expect(res.status).toBe(401)
  })

  it('sendDirect delivers to the recipient inbox and the reply flows back', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    const sent = await callJson(
      '/admin/notifications/sendDirect',
      { userId: String(visitorId), title: 'Hi', body: 'hello' },
      adminCtx,
    )
    expect(sent.status).toBe(200)

    const inbox = await callJson('/notifications/list', { tab: 'direct', limit: 20 }, visitorCtx)
    const items = (inbox.json.json as { items: Array<{ title: string; threadId: string }> }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('Hi')

    const unread = await callJson('/notifications/unreadCount', {}, visitorCtx)
    expect((unread.json.json as { count: number }).count).toBe(1)

    const reply = await callJson('/notifications/reply', { threadId: items[0]!.threadId, body: '你好' }, visitorCtx)
    expect(reply.status).toBe(200)

    const adminInbox = await callJson('/notifications/list', { tab: 'direct', limit: 20 }, adminCtx)
    expect((adminInbox.json.json as { items: unknown[] }).items).toHaveLength(1)
  })

  it('sendBroadcast is admin-only', async () => {
    const visitorId = await seedUser('visitor', 'visitor')
    const res = await callRpc(
      '/admin/notifications/sendBroadcast',
      { title: 't', body: 'b', replyable: false },
      makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db }),
    )
    expect(res.status).toBe(403)
  })

  it('markRead without ids clears the whole badge', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    await callJson('/admin/notifications/sendBroadcast', { title: 'a', body: 'b', replyable: false }, adminCtx)
    await callJson('/admin/notifications/sendBroadcast', { title: 'c', body: 'd', replyable: false }, adminCtx)

    const cleared = await callJson('/notifications/markRead', {}, visitorCtx)
    expect(cleared.status).toBe(200)
    expect((cleared.json.json as { count: number }).count).toBe(0)
  })
})
