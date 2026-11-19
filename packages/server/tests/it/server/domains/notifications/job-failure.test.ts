import type { Role } from '@kobato/auth/roles.ts'

import { user } from '@kobato/db/schema/user.ts'
import { getThread, listInbox, unreadCount } from '@kobato/server/domains/notifications/service.ts'
import { finishJobRun, startJobRun } from '@kobato/server/infra/db/job-run-recorder.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { beforeEach, describe, expect, it } from 'vitest'

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

beforeEach(async () => {
  await clearAllTables(db)
  seq = 0
})

describe('notifications / job-failure wiring', () => {
  it('turns a failed job run into one admin inbox row per admin', async () => {
    const adminId = await seedUser('admin', 'admin')
    const secondAdminId = await seedUser('admin', 'admin2')
    const authorId = await seedUser('author', 'author')

    const runId = startJobRun('backup', 'scheduled')
    expect(runId).not.toBeNull()
    finishJobRun(runId, 'failed', '磁盘已满')

    expect(unreadCount(db, adminId)).toBe(1)
    expect(unreadCount(db, secondAdminId)).toBe(1)
    expect(unreadCount(db, authorId)).toBe(0)

    const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    const row = inbox.items[0]!
    expect(row.kind).toBe('admin')
    expect(row.source).toBe('job-run')
    expect(row.actionUrl).toBe('/admin/tasks')
    expect(row.title).toContain('后台任务失败：')
    expect(row.title).toBe('后台任务失败：backup')
    expect(row.body).toContain('任务「backup」最近一次执行失败：磁盘已满')
    expect(row.replyable).toBe(false)
    expect(row.sender).toBeNull()
  })

  it('words a message-less failure without a dangling colon', async () => {
    const adminId = await seedUser('admin', 'admin')

    finishJobRun(startJobRun('geoip', 'scheduled'), 'failed')

    const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.body).toBe('任务「geoip」最近一次执行失败。请到「任务」页面查看详情。')
  })

  it('keeps an error message containing "Unexpected token \'<\'" instead of dropping the notice', async () => {
    const adminId = await seedUser('admin', 'admin')

    finishJobRun(startJobRun('audit-archive', 'scheduled'), 'failed', "Unexpected token '<'")

    expect(unreadCount(db, adminId)).toBe(1)
    const inbox = await listInbox(db, adminId, { tab: 'all', limit: 10 })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0]!.body).toContain("Unexpected token '<'")

    const thread = await getThread(
      db,
      { id: String(adminId), name: 'admin', email: 'admin@example.com', website: null, role: 'admin' },
      Number(inbox.items[0]!.threadId),
      'en-US',
    )
    expect(thread.messages[0]!.body).toContain("Unexpected token '<'")
    expect(thread.messages[0]!.body).not.toContain('&lt;')
  })
})
