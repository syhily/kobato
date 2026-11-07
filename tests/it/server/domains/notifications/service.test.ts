import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Role } from '@/shared/utils/roles'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  getThread,
  listInbox,
  markRead,
  markUnread,
  notifyAdmins,
  notifyAllUsers,
  recallMessage,
  replyToThread,
  sendBroadcast,
  sendDirectMessage,
  unreadCount,
} from '@/server/domains/notifications/service'
import { listThreadParticipantIds } from '@/server/infra/db/operations/notification'
import { user } from '@/server/infra/db/schema/user'
import { DomainError } from '@/server/infra/http/errors'

const db = getTestDb()

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

beforeEach(async () => {
  await clearAllTables(db)
})

describe('notifications / producers', () => {
  it('notifyAdmins fans out to admins only and returns null pre-install', async () => {
    // Pre-install: no users at all — nothing to deliver, honestly skipped.
    expect(notifyAdmins(db, { title: 't', body: 'b' })).toBeNull()

    const adminId = await seedUser('admin', 'admin')
    const authorId = await seedUser('author', 'author')

    const row = notifyAdmins(db, { title: 'Zeabur 下线', body: '请重新配置邮件', source: 'zeabur-mail-cleanup' })
    expect(row).not.toBeNull()
    expect(row!.kind).toBe('admin')
    expect(row!.senderId).toBeNull()
    expect(row!.replyable).toBe(false)

    expect(unreadCount(db, adminId)).toBe(1)
    expect(unreadCount(db, authorId)).toBe(0)
  })

  it('notifyAllUsers broadcasts to every active user', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')

    const row = notifyAllUsers(db, { title: '维护通知', body: '今晚维护' })
    expect(row!.kind).toBe('broadcast')
    expect(row!.replyable).toBe(false)
    expect(unreadCount(db, adminId)).toBe(1)
    expect(unreadCount(db, visitorId)).toBe(1)
  })

  it('sendDirectMessage rejects an unknown recipient', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendDirectMessage(db, adminId, 9999, { title: 't', body: 'b' })).toThrow(DomainError)
  })

  it('rejects a broadcast on a single-admin site with an honest 400', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendBroadcast(db, adminId, { title: 't', body: 'b', replyable: false })).toThrow(
      '站点内还没有其他用户，公告无人可接收',
    )
  })

  it('rejects a direct message to oneself', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendDirectMessage(db, adminId, adminId, { title: 't', body: 'b' })).toThrow('不能给自己发送私信')
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
    expect(all.unreadCount).toBe(4)

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
    ).rejects.toThrow('该线程没有可接收回复的对象')
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
    const systemRow = notifyAdmins(db, { title: 'sys', body: 'b' })!
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

    await expect(getThread(db, viewer(visitorId, 'visitor'), root.threadId)).rejects.toThrow('消息不存在')
    await expect(getThread(db, viewer(adminId, 'admin'), root.threadId)).rejects.toThrow('消息不存在')
  })

  it('refuses new replies on a recalled replyable broadcast', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminId, { title: '公告', body: 'b', replyable: true })

    recallMessage(db, root.id)

    await expect(
      replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: 'x' }),
    ).rejects.toThrow('该消息不支持回复')
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
    const row = notifyAdmins(db, { title: 'Zeabur 下线', body: '请重新配置邮件' })!
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

    expect(() => recallMessage(db, direct.id)).toThrow('私信不支持撤回')
    const inbox = await listInbox(db, visitorId, { tab: 'direct', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.title).toBe('私信')
  })

  it('rejects recalling a missing message', async () => {
    expect(() => recallMessage(db, 9999)).toThrow('消息不存在')
  })

  it('refuses a broadcast when the author is the only user, creating no rows', async () => {
    const adminId = await seedUser('admin', 'admin')
    expect(() => sendBroadcast(db, adminId, { title: 't', body: 'b', replyable: false })).toThrow(
      '站点内还没有其他用户，公告无人可接收',
    )
    expect((await listInbox(db, adminId, { tab: 'all', limit: 10 })).items).toHaveLength(0)
    expect(unreadCount(db, adminId)).toBe(0)
  })
})
