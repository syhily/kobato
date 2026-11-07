import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { notifyAdmins } from '@/server/domains/notifications/service'
import { auditLog } from '@/server/infra/db/schema/config'
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
  // Land buffered audit events from a previous case before the wipe, so the
  // next flush cannot repopulate the table with stale rows.
  await flushAuditLog()
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
    // An inline direct reply stays in the thread it was sent to.
    expect((reply.json.json as { threadId: string }).threadId).toBe(items[0]!.threadId)

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

  it('markUnread returns a message to the unread pile', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    await callJson('/admin/notifications/sendBroadcast', { title: 'a', body: 'b', replyable: false }, adminCtx)
    const inbox = await callJson('/notifications/list', { tab: 'all', limit: 20 }, visitorCtx)
    const item = (inbox.json.json as { items: Array<{ id: string }> }).items[0]!

    await callJson('/notifications/markRead', {}, visitorCtx)
    const restored = await callJson('/notifications/markUnread', { ids: [item.id] }, visitorCtx)
    expect(restored.status).toBe(200)
    expect((restored.json.json as { count: number }).count).toBe(1)

    const unread = await callJson('/notifications/unreadCount', {}, visitorCtx)
    expect((unread.json.json as { count: number }).count).toBe(1)
  })

  it('forks a broadcast reply into a private thread visible to both sides', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    await callJson('/admin/notifications/sendBroadcast', { title: '公告', body: '欢迎反馈', replyable: true }, adminCtx)
    const broadcastInbox = await callJson('/notifications/list', { tab: 'announce', limit: 20 }, visitorCtx)
    const broadcast = (broadcastInbox.json.json as { items: Array<{ threadId: string }> }).items[0]!

    const reply = await callJson('/notifications/reply', { threadId: broadcast.threadId, body: '赞' }, visitorCtx)
    expect(reply.status).toBe(200)
    // The reply names its own (forked) thread, not the broadcast root.
    const replyThreadId = (reply.json.json as { threadId: string }).threadId
    expect(replyThreadId).not.toBe(broadcast.threadId)

    // The replier sees their own fork thread, pre-read, under a new thread id.
    const visitorDirect = await callJson('/notifications/list', { tab: 'direct', limit: 20 }, visitorCtx)
    const fork = (visitorDirect.json.json as { items: Array<{ threadId: string; read: boolean }> }).items[0]!
    expect(fork.threadId).not.toBe(broadcast.threadId)
    expect(replyThreadId).toBe(fork.threadId)
    expect(fork.read).toBe(true)

    // The admin sees the reply in their direct tab.
    const adminDirect = await callJson('/notifications/list', { tab: 'direct', limit: 20 }, adminCtx)
    expect((adminDirect.json.json as { items: unknown[] }).items).toHaveLength(1)
  })

  it('recalls a broadcast end to end and audits it exactly once', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    await callJson('/admin/notifications/sendBroadcast', { title: '发早了', body: 'b', replyable: true }, adminCtx)

    const inbox = await callJson('/notifications/list', { tab: 'announce', limit: 20 }, visitorCtx)
    const item = (inbox.json.json as { items: Array<{ id: string; threadId: string }> }).items[0]!
    const unreadBefore = await callJson('/notifications/unreadCount', {}, visitorCtx)
    expect((unreadBefore.json.json as { count: number }).count).toBe(1)

    const recalled = await callJson('/admin/notifications/recall', { id: item.id }, adminCtx)
    expect(recalled.status).toBe(200)
    expect((recalled.json.json as { id: string }).id).toBe(item.id)
    expect((recalled.json.json as { recalledAt: string }).recalledAt).toBeTruthy()

    // Gone from the recipient's inbox and badge, and the thread now 404s.
    const afterInbox = await callJson('/notifications/list', { tab: 'all', limit: 20 }, visitorCtx)
    expect((afterInbox.json.json as { items: unknown[] }).items).toHaveLength(0)
    const unreadAfter = await callJson('/notifications/unreadCount', {}, visitorCtx)
    expect((unreadAfter.json.json as { count: number }).count).toBe(0)
    const thread = await callRpc('/notifications/thread', { threadId: item.threadId }, visitorCtx)
    expect(thread.status).toBe(404)

    // Idempotent: a second call succeeds with the SAME timestamp, and no
    // second audit row is written (ADR-0007 recommended policy).
    const again = await callJson('/admin/notifications/recall', { id: item.id }, adminCtx)
    expect(again.status).toBe(200)
    expect((again.json.json as { recalledAt: string }).recalledAt).toBe(
      (recalled.json.json as { recalledAt: string }).recalledAt,
    )

    await flushAuditLog()
    const auditRows = db.select().from(auditLog).where(eq(auditLog.action, 'notification_broadcast_recalled')).all()
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]!.resourceId).toBe(item.id)
  })

  it('recalls an admin-kind system alert under its own audit verb', async () => {
    const adminId = await seedUser('admin', 'admin')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const row = notifyAdmins(db, { title: 'Zeabur 下线', body: '请重新配置邮件' })!

    const recalled = await callJson('/admin/notifications/recall', { id: String(row.id) }, adminCtx)
    expect(recalled.status).toBe(200)

    await flushAuditLog()
    const rows = db.select().from(auditLog).where(eq(auditLog.action, 'notification_admin_recalled')).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceId).toBe(String(row.id))
  })

  it('refuses recall to non-admins', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
    const visitorCtx = makeAuthedCtx({ userId: String(visitorId), role: 'visitor', db })

    const sent = await callJson('/admin/notifications/sendBroadcast', { title: 'a', body: 'b' }, adminCtx)
    const id = (sent.json.json as { id: string }).id

    const res = await callRpc('/admin/notifications/recall', { id }, visitorCtx)
    expect(res.status).toBe(403)
  })

  it('refuses to recall a direct message', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const adminCtx = makeAuthedCtx({ userId: String(adminId), role: 'admin', db })

    const sent = await callJson(
      '/admin/notifications/sendDirect',
      { userId: String(visitorId), title: 'Hi', body: 'hello' },
      adminCtx,
    )
    const id = (sent.json.json as { id: string }).id

    const res = await callRpc('/admin/notifications/recall', { id }, adminCtx)
    expect(res.status).toBe(400)
  })
})
