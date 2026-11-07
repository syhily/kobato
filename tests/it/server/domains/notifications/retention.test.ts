import { count, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Role } from '@/shared/utils/roles'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { markRead, recallMessage, sendBroadcast, sendDirectMessage } from '@/server/domains/notifications/service'
import { runDbMaintenance } from '@/server/infra/db/maintenance'
import { NOTIFICATION_RETENTION_DAYS, pruneNotifications } from '@/server/infra/db/operations/notification'
import { notification, notificationRecipient } from '@/server/infra/db/schema/notification'
import { user } from '@/server/infra/db/schema/user'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

const db = getTestDb()

// Fixed clock: the prune takes `now`, so the window never depends on when the
// suite runs. Backdating is a raw UPDATE — the send path has no created-at
// override (same idiom as the job-run retention test).
const NOW = new Date('2026-11-07T00:00:00.000Z')
const DAY_MS = 86_400_000
const OLD_DAYS = NOTIFICATION_RETENTION_DAYS + 20
const INSIDE_DAYS = NOTIFICATION_RETENTION_DAYS - 80

let seq = 0
async function seedUser(role: Role, name: string): Promise<number> {
  seq += 1
  const rows = await db
    .insert(user)
    .values({ name, email: `${name}-${seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return rows[0]!.id
}

function backdateMessage(id: number, days: number): void {
  db.update(notification)
    .set({ createdAt: new Date(NOW.getTime() - days * DAY_MS) })
    .where(eq(notification.id, id))
    .run()
}

function dropRecipients(notificationId: number): void {
  db.delete(notificationRecipient).where(eq(notificationRecipient.notificationId, notificationId)).run()
}

function messageExists(id: number): boolean {
  return db.select({ id: notification.id }).from(notification).where(eq(notification.id, id)).all().length > 0
}

function recipientRows(notificationId: number) {
  return db
    .select({ userId: notificationRecipient.userId, readAt: notificationRecipient.readAt })
    .from(notificationRecipient)
    .where(eq(notificationRecipient.notificationId, notificationId))
    .all()
}

function recipientTableCount(): number {
  return db.select({ value: count() }).from(notificationRecipient).all()[0]!.value
}

function messageTableCount(): number {
  return db.select({ value: count() }).from(notification).all()[0]!.value
}

beforeEach(async () => {
  await clearAllTables(db)
  __clearLogCaptureForTests()
})

describe('notifications / retention prune (ADR-0010)', () => {
  it('never prunes unread rows, however old the message', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const row = sendDirectMessage(db, adminId, visitorId, { title: '旧消息', body: '没人读过' })
    backdateMessage(row.id, 400)

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 0, notificationsPruned: 0 })
    expect(messageExists(row.id)).toBe(true)
    expect(recipientRows(row.id)).toEqual([{ userId: visitorId, readAt: null }])
  })

  it('prunes read rows past the message window and keeps read rows inside it', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const aged = sendDirectMessage(db, adminId, visitorId, { title: '旧消息', body: '已读' })
    const fresh = sendDirectMessage(db, adminId, visitorId, { title: '新消息', body: '已读' })
    backdateMessage(aged.id, OLD_DAYS)
    backdateMessage(fresh.id, INSIDE_DAYS)
    markRead(db, visitorId)

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 1, notificationsPruned: 1 })
    expect(messageExists(aged.id)).toBe(false)
    expect(messageExists(fresh.id)).toBe(true)
    expect(recipientRows(fresh.id)).toEqual([{ userId: visitorId, readAt: expect.any(Date) }])
  })

  it('prunes a message read after the window elapsed (age keys on the message)', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const row = sendDirectMessage(db, adminId, visitorId, { title: '旧消息', body: '很久之后才读' })
    backdateMessage(row.id, OLD_DAYS + 60)
    // readAt is "now" in real time — recent by every measure; the message is not.
    markRead(db, visitorId, [row.id])

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 1, notificationsPruned: 1 })
    expect(messageExists(row.id)).toBe(false)
  })

  it('reclaims a recalled message with no recipient rows, regardless of age', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')
    const row = sendBroadcast(db, adminId, { title: '已撤回', body: '无人可见', replyable: false })
    recallMessage(db, row.id)
    dropRecipients(row.id)

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 0, notificationsPruned: 1 })
    expect(messageExists(row.id)).toBe(false)
  })

  it('reclaims an aged message with no recipient rows', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const row = sendDirectMessage(db, adminId, visitorId, { title: '旧消息', body: '收件人没了' })
    backdateMessage(row.id, OLD_DAYS)
    dropRecipients(row.id)

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 0, notificationsPruned: 1 })
    expect(messageExists(row.id)).toBe(false)
  })

  it('keeps a root that still has any recipient row', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    // The broadcast author's self-row is pre-marked read; the visitor's is not.
    const row = sendBroadcast(db, adminId, { title: '公告', body: '一半已读', replyable: false })
    backdateMessage(row.id, OLD_DAYS)

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 1, notificationsPruned: 0 })
    expect(messageExists(row.id)).toBe(true)
    expect(recipientRows(row.id)).toEqual([{ userId: visitorId, readAt: null }])
  })

  it('reports counts that match the actual deletions', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const agedRead = sendDirectMessage(db, adminId, visitorId, { title: 'a', body: 'b' })
    const agedUnread = sendDirectMessage(db, adminId, visitorId, { title: 'c', body: 'd' })
    const broadcast = sendBroadcast(db, adminId, { title: 'e', body: 'f', replyable: false })
    backdateMessage(agedRead.id, OLD_DAYS)
    backdateMessage(agedUnread.id, OLD_DAYS)
    backdateMessage(broadcast.id, OLD_DAYS)
    markRead(db, visitorId, [agedRead.id])

    const recipientsBefore = recipientTableCount()
    const messagesBefore = messageTableCount()
    const counts = pruneNotifications(db, NOW)

    // agedRead: recipient + root; broadcast: the author's read self-row only
    // (the visitor's unread row keeps the root alive); agedUnread: nothing.
    expect(counts).toEqual({ recipientsPruned: 2, notificationsPruned: 1 })
    expect(recipientTableCount()).toBe(recipientsBefore - counts.recipientsPruned)
    expect(messageTableCount()).toBe(messagesBefore - counts.notificationsPruned)
  })

  it('is idempotent across two consecutive runs', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const row = sendDirectMessage(db, adminId, visitorId, { title: 'a', body: 'b' })
    backdateMessage(row.id, OLD_DAYS)
    markRead(db, visitorId, [row.id])

    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 1, notificationsPruned: 1 })
    expect(pruneNotifications(db, NOW)).toEqual({ recipientsPruned: 0, notificationsPruned: 0 })
  })

  it('carries both counts on the existing maintenance info line', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const row = sendDirectMessage(db, adminId, visitorId, { title: 'a', body: 'b' })
    backdateMessage(row.id, OLD_DAYS)
    markRead(db, visitorId, [row.id])

    runDbMaintenance(getDatabaseHandle())

    expect(messageExists(row.id)).toBe(false)
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'database maintenance completed',
        ctx: expect.objectContaining({ notificationRecipientsPruned: 1, notificationsPruned: 1 }),
      }),
    )
  })
})
