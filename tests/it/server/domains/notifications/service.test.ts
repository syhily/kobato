import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Role } from '@/shared/utils/roles'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import {
  getThread,
  listInbox,
  markRead,
  markUnread,
  notifyAdmins,
  recallMessage,
  replyToThread,
  sendBroadcast,
  sendDirectMessage,
  unreadCount,
} from '@/server/domains/notifications/service'
import {
  createNotificationWithRecipients,
  listThreadParticipantIds,
  notificationInboxQuery,
} from '@/server/infra/db/operations/notification'
import { notification, notificationRecipient } from '@/server/infra/db/schema/notification'
import { user } from '@/server/infra/db/schema/user'
import { DomainError } from '@/server/infra/http/errors'

const db = getTestDb()

/** Real system message used wherever a test just needs an admin-kind row. */
const SYSTEM_NOTICE = {
  titleKey: 'notification.mail.zeaburCleanup.title',
  bodyKey: 'notification.mail.zeaburCleanup.body',
  source: 'zeabur-mail-cleanup',
} as const

let seq = 0
async function seedUser(role: Role, name: string): Promise<number> {
  seq += 1
  const rows = await db
    .insert(user)
    .values({ name, email: `${name}-${seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return rows[0]!.id
}

function viewer(id: number, role: Role, name = 'user'): SessionUser {
  return { id: String(id), name, email: `${name}@example.com`, website: null, role }
}

/** `fn` is synchronous (node:sqlite), so a rejecting-promise capture would not see the throw. */
function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

beforeEach(async () => {
  await clearAllTables(db)
})

describe('notifications / producers', () => {
  it('notifyAdmins fans out to admins only and returns null pre-install', async () => {
    // Pre-install: no users at all — nothing to deliver, honestly skipped.
    expect(notifyAdmins(db, SYSTEM_NOTICE)).toBeNull()

    const adminId = await seedUser('admin', 'admin')
    const authorId = await seedUser('author', 'author')

    const row = notifyAdmins(db, SYSTEM_NOTICE)
    expect(row).not.toBeNull()
    expect(row!.kind).toBe('admin')
    expect(row!.senderId).toBeNull()
    expect(row!.replyable).toBe(false)

    expect(unreadCount(db, adminId)).toBe(1)
    expect(unreadCount(db, authorId)).toBe(0)
  })

  it('sendDirectMessage rejects an unknown recipient', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendDirectMessage(db, adminId, 9999, { title: 't', body: 'b' })).toThrow(DomainError)
  })

  it('sendDirectMessage probes the active-user predicate, not the whole user list', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')

    // Soft-delete the target: the probe must apply the SAME predicate
    // `listRecipientUserIds` does (deleted_at IS NULL AND role IS NOT NULL).
    db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, visitorId)).run()
    for (const targetId of [9999, visitorId]) {
      const error = captureError(() => sendDirectMessage(db, adminId, targetId, { title: 't', body: 'b' }))
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('NOT_FOUND')
      expect((error as DomainError).descriptor).toMatchObject({ messageKey: 'notifications.error.targetNotFound' })
    }
  })

  it('chunks the broadcast fan-out across statements inside one transaction', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorIds: number[] = []
    for (let i = 0; i < 1_200; i += 1) {
      visitorIds.push(await seedUser('visitor', `v${i}`))
    }

    const row = sendBroadcast(db, adminId, { title: '清缓存公告', body: '请刷新页面', replyable: false })

    const rows = db
      .select({ userId: notificationRecipient.userId, readAt: notificationRecipient.readAt })
      .from(notificationRecipient)
      .where(eq(notificationRecipient.notificationId, row.id))
      .all()
    // 1 200 visitors + the author's pre-read self-row — 500/500/201 rows in
    // three INSERTs, still ONE transaction.
    expect(rows).toHaveLength(1_201)
    expect(new Set(rows.map((recipient) => recipient.userId)).size).toBe(1_201)
    expect(rows.find((recipient) => recipient.userId === adminId)?.readAt).not.toBeNull()
    expect(rows.find((recipient) => recipient.userId !== adminId)?.readAt).toBeNull()
    expect(unreadCount(db, visitorIds[0]!)).toBe(1)
    expect(unreadCount(db, adminId)).toBe(0)
  })

  it('does not deliver a historical broadcast to a later registrant', async () => {
    const adminId = await seedUser('admin', 'admin')
    const earlyId = await seedUser('visitor', 'early')
    sendBroadcast(db, adminId, { title: '清缓存公告', body: '请刷新页面', replyable: false })

    // The audience is snapshotted at send time: a user registered after the
    // send has no row, no unread badge, and nothing in any tab.
    const lateId = await seedUser('visitor', 'late')
    expect(unreadCount(db, lateId)).toBe(0)
    expect((await listInbox(db, lateId, { tab: 'all', limit: 10 })).items).toHaveLength(0)
    expect((await listInbox(db, lateId, { tab: 'announce', limit: 10 })).items).toHaveLength(0)

    // The pre-existing audience keeps its copy.
    expect(unreadCount(db, earlyId)).toBe(1)
  })

  it('rejects a broadcast on a single-admin site with an honest 400', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendBroadcast(db, adminId, { title: 't', body: 'b', replyable: false })).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({ messageKey: 'notifications.error.noAudience' }),
      }),
    )
  })

  it('rejects a direct message to oneself', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendDirectMessage(db, adminId, adminId, { title: 't', body: 'b' })).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({ messageKey: 'notifications.error.selfDirect' }),
      }),
    )
  })
})

describe('notifications / inbox', () => {
  it('lists by tab, paginates by cursor, and marks read', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    for (let i = 0; i < 3; i += 1) {
      sendBroadcast(db, adminId, { title: `公告${i}`, body: `b${i}`, replyable: false })
    }
    sendDirectMessage(db, adminId, visitorId, { title: '私信', body: 'hello' })

    const all = await listInbox(db, visitorId, { tab: 'all', limit: 2 })
    expect(all.items).toHaveLength(2)
    expect(all.nextCursor).not.toBeNull()

    const rest = await listInbox(db, visitorId, { tab: 'all', cursor: Number(all.nextCursor), limit: 10 })
    expect(rest.items).toHaveLength(2)
    expect(rest.nextCursor).toBeNull()

    const direct = await listInbox(db, visitorId, { tab: 'direct', limit: 10 })
    expect(direct.items).toHaveLength(1)
    expect(direct.items[0]!.title).toBe('私信')

    const announce = await listInbox(db, visitorId, { tab: 'announce', limit: 10 })
    expect(announce.items).toHaveLength(3)

    // Mark the direct message read → unread tab shrinks.
    markRead(db, visitorId, [Number(direct.items[0]!.id)])
    expect(unreadCount(db, visitorId)).toBe(3)
    const unread = await listInbox(db, visitorId, { tab: 'unread', limit: 10 })
    expect(unread.items).toHaveLength(3)
    expect(unread.items.every((item) => !item.read)).toBe(true)

    // Mark-all empties the badge.
    markRead(db, visitorId)
    expect(unreadCount(db, visitorId)).toBe(0)
  })

  it('caps the list-row body as a preview while the thread keeps the full body', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const fullBody = 'a'.repeat(300)
    const root = sendDirectMessage(db, adminId, visitorId, { title: '长文', body: fullBody })

    const inbox = await listInbox(db, visitorId, { tab: 'direct', limit: 10 })
    expect(inbox.items[0]!.body).toBe(fullBody.slice(0, 200))
    expect(inbox.items[0]!.body).toHaveLength(200)

    const thread = await getThread(db, viewer(visitorId, 'visitor'), root.threadId)
    expect(thread.messages[0]!.body).toBe(fullBody)
    expect(thread.messages[0]!.body).toHaveLength(300)
  })

  it("marks only the caller's rows read when ids are given", async () => {
    const adminId = await seedUser('admin', 'admin')
    const aId = await seedUser('visitor', 'a')
    const bId = await seedUser('visitor', 'b')
    sendBroadcast(db, adminId, { title: '一', body: 'b1', replyable: false })
    const second = sendBroadcast(db, adminId, { title: '二', body: 'b2', replyable: false })

    const touched = markRead(db, aId, [second.id])
    expect(touched).toBe(1)
    expect(unreadCount(db, aId)).toBe(1)
    expect(unreadCount(db, bId)).toBe(2)
  })

  it('marks a read message unread again, scoped to the caller', async () => {
    const adminId = await seedUser('admin', 'admin')
    const aId = await seedUser('visitor', 'a')
    const bId = await seedUser('visitor', 'b')
    const row = sendBroadcast(db, adminId, { title: '一', body: 'b1', replyable: false })

    markRead(db, aId, [row.id])
    markRead(db, bId, [row.id])
    expect(unreadCount(db, aId)).toBe(0)

    // Back to unread — idempotent on a double click…
    expect(markUnread(db, aId, [row.id])).toBe(1)
    expect(markUnread(db, aId, [row.id])).toBe(0)
    expect(unreadCount(db, aId)).toBe(1)
    // …and scoped to the caller: b's row stays read.
    expect(unreadCount(db, bId)).toBe(0)
  })

  it('renders a vanished sender as null', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    sendDirectMessage(db, adminId, visitorId, { title: '私信', body: 'hello' })
    await db.delete(user).where(eq(user.id, adminId))

    const inbox = await listInbox(db, visitorId, { tab: 'all', limit: 10 })
    expect(inbox.items[0]!.sender).toBeNull()
  })

  it('pins the inbox access path: index-fed ordering, no temp B-tree', () => {
    // Every inbox page (all / unread / cursor / kind-filtered) must walk
    // `idx_notification_recipient_user_nid` backwards. Losing the index (or
    // ordering by the joined table) reintroduces a temp B-tree over the
    // user's whole recipient history. The raw client is used because
    // `EXPLAIN QUERY PLAN` needs the statement's bound values, which the
    // drizzle `all` surface does not accept.
    const client = getDatabaseHandle().client
    const cases = [
      { label: 'all', filters: { limit: 20 } },
      { label: 'unread', filters: { unreadOnly: true, limit: 20 } },
      { label: 'cursor', filters: { cursorId: 500, limit: 20 } },
      { label: 'kinds', filters: { kinds: ['direct'] as const, limit: 20 } },
    ]
    for (const { label, filters } of cases) {
      const query = notificationInboxQuery(db, 1, filters).toSQL()
      const plan = client
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...(query.params as number[]))
        .map((row) => String(row.detail))
      expect(plan, label).toContain(
        'SEARCH notification_recipient USING INDEX idx_notification_recipient_user_nid (user_id=?)',
      )
      expect(
        plan.filter((detail) => detail.includes('TEMP B-TREE')),
        label,
      ).toEqual([])
    }
  })
})

describe('notifications / threads & replies', () => {
  it('round-trips a direct thread between admin and user', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendDirectMessage(db, adminId, visitorId, { title: '合作', body: '有兴趣吗' })

    const reply = await replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: '有！' })
    expect(reply.message.mine).toBe(true)
    expect(reply.threadId).toBe(root.threadId)
    expect(unreadCount(db, adminId)).toBe(1)

    const thread = await getThread(db, viewer(adminId, 'admin'), root.threadId)
    expect(thread.messages).toHaveLength(2)
    expect(thread.canReply).toBe(true)
    expect(thread.messages[0]!.sender?.id).toBe(String(adminId))
    expect(thread.messages[1]!.mine).toBe(false)
  })

  it('skips soft-deleted participants when routing a reply', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendDirectMessage(db, adminId, visitorId, { title: '合作', body: '有兴趣吗' })

    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, visitorId))

    // The deleted counterpart drops out of the routing base…
    expect(listThreadParticipantIds(db, root.threadId)).toEqual([adminId])
    // …so the admin's reply has genuinely nobody to reach — an honest 400,
    // not a silent send into the void.
    await expect(
      replyToThread(db, viewer(adminId, 'admin'), { threadId: root.threadId, body: '还在吗' }),
    ).rejects.toMatchObject({ descriptor: { messageKey: 'notifications.error.noThreadRecipients' } })
    expect(unreadCount(db, visitorId)).toBe(1)
  })

  it('forks a broadcast reply into a private thread with the admin team', async () => {
    const adminA = await seedUser('admin', 'adminA')
    const adminB = await seedUser('admin', 'adminB')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminA, { title: '新功能', body: '欢迎反馈', replyable: true })

    const reply = await replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: '赞' })
    expect(reply.message.mine).toBe(true)
    // The reply reached every admin — the creator's own broadcast row is
    // pre-read, so adminA's count is the reply alone; adminB also has the
    // broadcast itself.
    expect(unreadCount(db, adminA)).toBe(1)
    expect(unreadCount(db, adminB)).toBe(2)

    // …in a NEW forked thread, not the broadcast thread.
    const adminInbox = await listInbox(db, adminA, { tab: 'direct', limit: 10 })
    expect(adminInbox.items).toHaveLength(1)
    const forkThreadId = Number(adminInbox.items[0]!.threadId)
    expect(forkThreadId).not.toBe(root.threadId)
    expect(reply.threadId).toBe(forkThreadId)

    // The broadcast thread itself still holds only the announcement.
    const rootThread = await getThread(db, viewer(adminA, 'admin'), root.threadId)
    expect(rootThread.messages).toHaveLength(1)

    // An admin's follow-up inside the fork reaches the replier.
    await replyToThread(db, viewer(adminB, 'admin', 'adminB'), { threadId: forkThreadId, body: '谢谢反馈' })
    expect(unreadCount(db, visitorId)).toBe(2)

    const fork = await getThread(db, viewer(visitorId, 'visitor'), forkThreadId)
    expect(fork.messages.map((message) => message.body)).toEqual(['赞', '谢谢反馈'])
    expect(fork.canReply).toBe(true)
  })

  it("keeps a broadcast reply out of other users' inboxes", async () => {
    const adminId = await seedUser('admin', 'admin')
    const v1 = await seedUser('visitor', 'v1')
    const v2 = await seedUser('visitor', 'v2')
    const root = sendBroadcast(db, adminId, { title: '新功能', body: '欢迎反馈', replyable: true })

    await replyToThread(db, viewer(v1, 'visitor', 'v1'), { threadId: root.threadId, body: '赞' })

    expect(unreadCount(db, v2)).toBe(1)
    const v2Direct = await listInbox(db, v2, { tab: 'direct', limit: 10 })
    expect(v2Direct.items).toHaveLength(0)
  })

  it('shows only the root message to broadcast recipients', async () => {
    const adminId = await seedUser('admin', 'admin')
    const v1 = await seedUser('visitor', 'v1')
    const v2 = await seedUser('visitor', 'v2')
    const root = sendBroadcast(db, adminId, { title: '新功能', body: '欢迎反馈', replyable: true })
    await replyToThread(db, viewer(v1, 'visitor', 'v1'), { threadId: root.threadId, body: '私密反馈内容' })

    const thread = await getThread(db, viewer(v2, 'visitor', 'v2'), root.threadId)
    expect(thread.messages.map((message) => message.body)).toEqual(['欢迎反馈'])
  })

  it('lets the replier see their fork thread pre-read', async () => {
    const adminId = await seedUser('admin', 'admin')
    const v1 = await seedUser('visitor', 'v1')
    const root = sendBroadcast(db, adminId, { title: '新功能', body: '欢迎反馈', replyable: true })

    await replyToThread(db, viewer(v1, 'visitor', 'v1'), { threadId: root.threadId, body: '赞' })

    const inbox = await listInbox(db, v1, { tab: 'direct', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.read).toBe(true)
    expect(inbox.items[0]!.title).toBe('新功能')
    const fork = await getThread(db, viewer(v1, 'visitor', 'v1'), Number(inbox.items[0]!.threadId))
    expect(fork.messages[0]!.mine).toBe(true)
    expect(fork.canReply).toBe(true)
    // Only the broadcast itself stays unread for the replier.
    expect(unreadCount(db, v1)).toBe(1)
  })

  it('rejects an admin reply in the broadcast root thread', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })
    await expect(replyToThread(db, viewer(adminId, 'admin'), { threadId: root.threadId, body: 'x' })).rejects.toThrow(
      DomainError,
    )
  })

  it('projects canReply=false for the broadcast creator', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })

    const thread = await getThread(db, viewer(adminId, 'admin'), root.threadId)
    expect(thread.canReply).toBe(false)
  })

  it('rejects a broadcast reply when no admin can receive it', async () => {
    const adminId = await seedUser('admin', 'admin')
    const v1 = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })
    // The broadcast's creator was the only admin; demote them so the fork
    // would have no recipients at all.
    await db.update(user).set({ role: 'visitor' }).where(eq(user.id, adminId))
    await expect(
      replyToThread(db, viewer(v1, 'visitor', 'v1'), { threadId: root.threadId, body: 'x' }),
    ).rejects.toThrow(DomainError)
  })

  it('rejects replies on system messages and non-replyable broadcasts', async () => {
    const adminId = await seedUser('admin', 'admin')
    const systemRow = notifyAdmins(db, SYSTEM_NOTICE)!
    await expect(
      replyToThread(db, viewer(adminId, 'admin'), { threadId: systemRow.threadId, body: 'x' }),
    ).rejects.toThrow(DomainError)

    const visitorId = await seedUser('visitor', 'visitor')
    const silent = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: false })
    await expect(
      replyToThread(db, viewer(visitorId, 'visitor'), { threadId: silent.threadId, body: 'x' }),
    ).rejects.toThrow(DomainError)
  })

  it('hides threads from non-participants', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const outsiderId = await seedUser('visitor', 'outsider')
    const root = sendDirectMessage(db, adminId, visitorId, { title: 't', body: 'b' })

    await expect(getThread(db, viewer(outsiderId, 'visitor'), root.threadId)).rejects.toThrow(DomainError)
    await expect(
      replyToThread(db, viewer(outsiderId, 'visitor'), { threadId: root.threadId, body: 'x' }),
    ).rejects.toThrow(DomainError)
  })
})

describe('notifications / recall (ADR-0007)', () => {
  it('hides a recalled broadcast from every tab and drops the badge for every recipient', async () => {
    const adminId = await seedUser('admin', 'admin')
    const aId = await seedUser('visitor', 'a')
    const bId = await seedUser('visitor', 'b')
    const root = sendBroadcast(db, adminId, { title: '发早了', body: 'b', replyable: true })

    expect(unreadCount(db, aId)).toBe(1)
    expect(unreadCount(db, bId)).toBe(1)

    const result = recallMessage(db, root.id)
    expect(result.newlyRecalled).toBe(true)
    expect(result.kind).toBe('broadcast')

    for (const userId of [aId, bId, adminId]) {
      expect(unreadCount(db, userId)).toBe(0)
      for (const tab of ['all', 'unread', 'announce'] as const) {
        const page = await listInbox(db, userId, { tab, limit: 10 })
        expect(page.items).toHaveLength(0)
      }
    }
  })

  it('answers NOT_FOUND for a recalled thread to recipients and admins alike', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })

    recallMessage(db, root.id)

    await expect(getThread(db, viewer(visitorId, 'visitor'), root.threadId)).rejects.toMatchObject({
      descriptor: { messageKey: 'notifications.error.messageNotFound' },
    })
    await expect(getThread(db, viewer(adminId, 'admin'), root.threadId)).rejects.toMatchObject({
      descriptor: { messageKey: 'notifications.error.messageNotFound' },
    })
  })

  it('refuses new replies on a recalled replyable broadcast', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })

    recallMessage(db, root.id)

    await expect(
      replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: 'x' }),
    ).rejects.toMatchObject({ descriptor: { messageKey: 'notifications.error.notReplyable' } })
  })

  it('leaves existing fork threads readable and replyable after the root is recalled', async () => {
    const adminA = await seedUser('admin', 'adminA')
    const adminB = await seedUser('admin', 'adminB')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminA, { title: '新功能', body: '欢迎反馈', replyable: true })

    await replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: '反馈' })
    const directBefore = await listInbox(db, adminA, { tab: 'direct', limit: 10 })
    const forkThreadId = Number(directBefore.items[0]!.threadId)

    recallMessage(db, root.id)

    // The fork is an independent direct thread — untouched by the recall.
    const fork = await getThread(db, viewer(visitorId, 'visitor'), forkThreadId)
    expect(fork.messages.map((message) => message.body)).toEqual(['反馈'])
    expect(fork.canReply).toBe(true)
    const followUp = await replyToThread(db, viewer(adminB, 'admin', 'adminB'), {
      threadId: forkThreadId,
      body: '谢谢反馈',
    })
    expect(followUp.message.mine).toBe(true)
    expect(followUp.threadId).toBe(forkThreadId)
    expect((await getThread(db, viewer(visitorId, 'visitor'), forkThreadId)).messages).toHaveLength(2)
  })

  it('gives the creator a pre-read self-row and lets them recall from it', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '我已发出', body: 'b', replyable: true })

    // The author's own copy: visible, pre-read, badge untouched.
    expect(unreadCount(db, adminId)).toBe(0)
    const inbox = await listInbox(db, adminId, { tab: 'announce', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.id).toBe(String(root.id))
    expect(inbox.items[0]!.read).toBe(true)

    const recalled = recallMessage(db, Number(inbox.items[0]!.id))
    expect(recalled.newlyRecalled).toBe(true)
    expect((await listInbox(db, adminId, { tab: 'announce', limit: 10 })).items).toHaveLength(0)
  })

  it('is idempotent — a second recall is a no-op keeping the first timestamp', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: false })

    const first = recallMessage(db, root.id)
    const second = recallMessage(db, root.id)
    expect(first.newlyRecalled).toBe(true)
    expect(second.newlyRecalled).toBe(false)
    expect(second.recalledAt.getTime()).toBe(first.recalledAt.getTime())
  })

  it('recalls an admin-kind system alert', async () => {
    const adminId = await seedUser('admin', 'admin')
    const row = notifyAdmins(db, SYSTEM_NOTICE)!
    expect(unreadCount(db, adminId)).toBe(1)

    const recalled = recallMessage(db, row.id)
    expect(recalled.kind).toBe('admin')
    expect(unreadCount(db, adminId)).toBe(0)
    expect(recalled.newlyRecalled).toBe(true)
  })

  it('refuses to recall a direct message and leaves it visible', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const direct = sendDirectMessage(db, adminId, visitorId, { title: '私信', body: 'hello' })

    expect(() => recallMessage(db, direct.id)).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({ messageKey: 'notifications.error.recallDirect' }),
      }),
    )
    const inbox = await listInbox(db, visitorId, { tab: 'direct', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.title).toBe('私信')
  })

  it('rejects recalling a missing message', async () => {
    expect(() => recallMessage(db, 9999)).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({ messageKey: 'notifications.error.messageNotFound' }),
      }),
    )
  })

  it('refuses a broadcast when the author is the only user, creating no rows', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendBroadcast(db, adminId, { title: 't', body: 'b', replyable: false })).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({ messageKey: 'notifications.error.noAudience' }),
      }),
    )
    expect((await listInbox(db, adminId, { tab: 'all', limit: 10 })).items).toHaveLength(0)
    expect(unreadCount(db, adminId)).toBe(0)
  })
})

describe('notifications / localized system messages (5b-ii)', () => {
  const JOB_TITLE = { taskKey: 'backup' }
  const JOB_BODY = { taskKey: 'backup', hasError: 'no', error: '' }

  function postSystemNotice(): number {
    const row = notifyAdmins(db, {
      titleKey: 'notification.job.failed.title',
      titleParams: JOB_TITLE,
      bodyKey: 'notification.job.failed.body',
      bodyParams: JOB_BODY,
      source: 'job-run',
      actionUrl: '/admin/tasks',
    })
    return row!.id
  }

  it('stores the English fallback plus the descriptor columns', async () => {
    const adminId = await seedUser('admin', 'admin')
    const id = postSystemNotice()

    const stored = db.select().from(notification).where(eq(notification.id, id)).all()[0]!
    expect(stored.title).toBe('Background task failed: backup')
    expect(stored.body).toBe('Task backup failed on its most recent run. Open the Tasks page for details.')
    expect(stored.titleKey).toBe('notification.job.failed.title')
    expect(JSON.parse(stored.titleParams!)).toEqual(JOB_TITLE)
    expect(stored.bodyKey).toBe('notification.job.failed.body')
    expect(JSON.parse(stored.bodyParams!)).toEqual(JOB_BODY)
    expect(adminId).toBeGreaterThan(0)
  })

  it('translates the inbox row in every locale', async () => {
    const adminId = await seedUser('admin', 'admin')
    postSystemNotice()

    const expected = {
      'en-US': {
        title: 'Background task failed: backup',
        body: 'Task backup failed on its most recent run. Open the Tasks page for details.',
      },
      'zh-CN': {
        title: '后台任务失败：backup',
        body: '任务「backup」最近一次执行失败。请到「任务」页面查看详情。',
      },
      'zh-TW': {
        title: '後台任務失敗：backup',
        body: '任務「backup」最近一次執行失敗。請到「任務」頁面檢視詳情。',
      },
      'zh-HK': {
        title: '後台任務失敗：backup',
        body: '任務「backup」最近一次執行失敗。請到「任務」頁面檢視詳情。',
      },
    } as const

    for (const [locale, text] of Object.entries(expected)) {
      const inbox = await listInbox(db, adminId, {
        tab: 'all',
        limit: 10,
        locale: locale as keyof typeof expected,
      })
      expect(inbox.items[0]!.title).toBe(text.title)
      expect(inbox.items[0]!.body).toBe(text.body)
    }
  })

  it('translates the thread detail in the reader locale', async () => {
    const adminId = await seedUser('admin', 'admin')
    const id = postSystemNotice()
    const stored = db.select().from(notification).where(eq(notification.id, id)).all()[0]!

    const zh = await getThread(db, viewer(adminId, 'admin'), stored.threadId, 'zh-CN')
    expect(zh.messages[0]!.body).toBe('任务「backup」最近一次执行失败。请到「任务」页面查看详情。')

    const en = await getThread(db, viewer(adminId, 'admin'), stored.threadId, 'en-US')
    expect(en.messages[0]!.body).toBe('Task backup failed on its most recent run. Open the Tasks page for details.')
  })

  it('truncates the SAME translated body for the preview; the thread keeps it whole', async () => {
    const adminId = await seedUser('admin', 'admin')
    const error = 'x'.repeat(300)
    const row = notifyAdmins(db, {
      titleKey: 'notification.job.failed.title',
      titleParams: { taskKey: 'backup' },
      bodyKey: 'notification.job.failed.body',
      bodyParams: { taskKey: 'backup', hasError: 'yes', error },
    })!

    const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10, locale: 'zh-CN' })
    const full = (await getThread(db, viewer(adminId, 'admin'), row.threadId, 'zh-CN')).messages[0]!.body

    expect(full).toContain(error)
    expect(full.length).toBeGreaterThan(200)
    expect(inbox.items[0]!.body).toBe(full.slice(0, 200))
    expect(inbox.items[0]!.body).toHaveLength(200)
    expect(full.startsWith(inbox.items[0]!.body)).toBe(true)
  })

  it('keeps direct and broadcast text raw with null descriptors', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const direct = sendDirectMessage(db, adminId, visitorId, { title: '私信', body: '用户原文' })
    const broadcast = sendBroadcast(db, adminId, { title: '公告', body: '广播原文', replyable: false })

    for (const id of [direct.id, broadcast.id]) {
      const stored = db.select().from(notification).where(eq(notification.id, id)).all()[0]!
      expect(stored.titleKey).toBeNull()
      expect(stored.bodyKey).toBeNull()
      expect(stored.titleParams).toBeNull()
      expect(stored.bodyParams).toBeNull()
    }

    const inbox = await listInbox(db, visitorId, { tab: 'all', limit: 10, locale: 'en-US' })
    expect(inbox.items.map((item) => item.title)).toEqual(['公告', '私信'])
    const thread = await getThread(db, viewer(visitorId, 'visitor'), direct.threadId, 'en-US')
    expect(thread.messages[0]!.body).toBe('用户原文')
  })

  it('shows a legacy row (no descriptor) unchanged in every locale', async () => {
    const adminId = await seedUser('admin', 'admin')
    createNotificationWithRecipients(
      db,
      { kind: 'admin', senderId: null, title: '旧通知', body: '旧正文', replyable: false },
      [adminId],
    )

    for (const locale of ['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const) {
      const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10, locale })
      expect(inbox.items[0]!.title).toBe('旧通知')
      expect(inbox.items[0]!.body).toBe('旧正文')
    }
  })

  it('falls back to the stored English text when the key is no longer registered', async () => {
    const adminId = await seedUser('admin', 'admin')
    createNotificationWithRecipients(
      db,
      {
        kind: 'admin',
        senderId: null,
        title: 'Removed system notice',
        body: 'This row outlived its catalog key.',
        titleKey: 'notification.removed.key',
        bodyKey: 'notification.removed.key',
        replyable: false,
      },
      [adminId],
    )

    const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10, locale: 'zh-TW' })
    expect(inbox.items[0]!.title).toBe('Removed system notice')
    expect(inbox.items[0]!.body).toBe('This row outlived its catalog key.')
  })
})
