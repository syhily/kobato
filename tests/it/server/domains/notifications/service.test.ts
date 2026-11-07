import { beforeEach, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Role } from '@/shared/utils/roles'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  getThread,
  listInbox,
  markRead,
  notifyAdmins,
  notifyAllUsers,
  replyToThread,
  sendBroadcast,
  sendDirectMessage,
  unreadCount,
} from '@/server/domains/notifications/service'
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
})

describe('notifications / threads & replies', () => {
  it('round-trips a direct thread between admin and user', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendDirectMessage(db, adminId, visitorId, { title: '合作', body: '有兴趣吗' })

    const reply = await replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: '有！' })
    expect(reply.mine).toBe(true)
    expect(unreadCount(db, adminId)).toBe(1)

    const thread = await getThread(db, viewer(adminId, 'admin'), root.threadId)
    expect(thread.messages).toHaveLength(2)
    expect(thread.canReply).toBe(true)
    expect(thread.messages[0]!.sender?.id).toBe(String(adminId))
    expect(thread.messages[1]!.mine).toBe(false)
  })

  it('routes a broadcast reply to ALL admins, and keeps the thread going', async () => {
    const adminA = await seedUser('admin', 'adminA')
    const adminB = await seedUser('admin', 'adminB')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendBroadcast(db, adminA, { title: '新功能', body: '欢迎反馈', replyable: true })

    await replyToThread(db, viewer(visitorId, 'visitor'), { threadId: root.threadId, body: '赞' })
    // The reply reached every admin — not only the broadcast's creator
    // (adminB's count also includes the broadcast itself; the creator never
    // receives their own broadcast).
    expect(unreadCount(db, adminA)).toBe(1)
    expect(unreadCount(db, adminB)).toBe(2)

    // An admin's follow-up reaches the user (thread participants minus self);
    // the count also includes the still-unread original broadcast.
    await replyToThread(db, viewer(adminB, 'admin', 'adminB'), { threadId: root.threadId, body: '谢谢反馈' })
    expect(unreadCount(db, visitorId)).toBe(2)
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
