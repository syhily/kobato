import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { comment } from '@/server/infra/db/schema/comment'
import { user } from '@/server/infra/db/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@/shared/lexical/comment-schema'

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

const emailMocks = vi.hoisted(() => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
}))
const { sendAuthorInvite, sendPasswordReset } = emailMocks

vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite: emailMocks.sendAuthorInvite,
  sendPasswordReset: emailMocks.sendPasswordReset,
  invalidateMailTransportCache: vi.fn(),
}))

const admin = await import('@/server/domains/users/services/admin')
const account = await import('@/server/domains/users/services/account')
const adminQuery = await import('@/server/domains/users/repos/admin-query')
const userOps = await import('@/server/infra/db/operations/user')

const db = getTestDb()

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  sendAuthorInvite.mockReset()
  sendPasswordReset.mockReset()
})

async function seedUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const rows = await db
    .insert(user)
    .values({
      name: 'Test User',
      email: `u${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      ...overrides,
    })
    .returning()
  return rows[0]
}

async function seedComment(userId: number, overrides: Partial<typeof comment.$inferInsert> = {}) {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId: 1,
      userId,
      body: EMPTY_COMMENT_EDITOR_STATE,
      isPending: overrides.isPending ?? false,
      ...overrides,
    })
    .returning()
  return rows[0]
}

describe('users/repos/admin-query — countAdminUsers', () => {
  it('returns 0 on an empty table', async () => {
    expect(await adminQuery.countAdminUsers(db, {})).toBe(0)
  })

  it('counts only non-deleted rows by default', async () => {
    await seedUser({ name: 'A', email: 'a@example.com', role: 'admin' })
    await seedUser({ name: 'B', email: 'b@example.com', role: 'author', deletedAt: new Date() })

    expect(await adminQuery.countAdminUsers(db, {})).toBe(1)
  })

  it('counts all rows when includeDeleted is true', async () => {
    await seedUser({ name: 'A', email: 'a@example.com' })
    await seedUser({ name: 'B', email: 'b@example.com', deletedAt: new Date() })

    expect(await adminQuery.countAdminUsers(db, { includeDeleted: true })).toBe(2)
  })

  it('filters by role', async () => {
    await seedUser({ name: 'A', email: 'a@example.com', role: 'admin' })
    await seedUser({ name: 'B', email: 'b@example.com', role: 'author' })
    await seedUser({ name: 'C', email: 'c@example.com', role: 'visitor' })

    expect(await adminQuery.countAdminUsers(db, { role: 'admin' })).toBe(1)
    expect(await adminQuery.countAdminUsers(db, { role: 'author' })).toBe(1)
    expect(await adminQuery.countAdminUsers(db, { role: 'normal' })).toBe(2)
  })

  it('filters by q (name or email)', async () => {
    await seedUser({ name: 'Alice', email: 'alice@example.com' })
    await seedUser({ name: 'Bob', email: 'bob@example.com' })

    expect(await adminQuery.countAdminUsers(db, { q: 'ali' })).toBe(1)
  })
})

describe('users/repos/admin-query — listAdminUsers', () => {
  it('returns empty when no users', async () => {
    const rows = await adminQuery.listAdminUsers(db, 0, 10, {})
    expect(rows).toHaveLength(0)
  })

  it('aggregates comment counts and pending counts', async () => {
    const u = await seedUser({ name: 'Commenter', email: 'c@example.com' })
    await seedComment(u.id, { isPending: false })
    await seedComment(u.id, { isPending: true })
    await seedComment(u.id, { isPending: true, deletedAt: new Date() })

    const rows = await adminQuery.listAdminUsers(db, 0, 10, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].commentCount).toBe(2)
    expect(rows[0].pendingCount).toBe(1)
  })

  it('orders by recent by default', async () => {
    // Stamp createdAt explicitly — 'recent' sorts by created_at DESC, and
    // two inserts within the same wall-clock tick must not leave the
    // ordering to chance.
    const older = await seedUser({ name: 'Older', email: 'o@example.com', createdAt: new Date('2024-01-01T00:00:00Z') })
    const newer = await seedUser({ name: 'Newer', email: 'n@example.com', createdAt: new Date('2024-01-02T00:00:00Z') })

    const rows = await adminQuery.listAdminUsers(db, 0, 10, {})
    expect(rows[0].id).toBe(newer.id)
    expect(rows[1].id).toBe(older.id)
  })

  it('respects offset and limit', async () => {
    await seedUser({ name: 'A', email: 'a@example.com' })
    await seedUser({ name: 'B', email: 'b@example.com' })
    await seedUser({ name: 'C', email: 'c@example.com' })

    const rows = await adminQuery.listAdminUsers(db, 1, 1, {})
    expect(rows).toHaveLength(1)
  })

  it('orders by comment count when sortBy is commentCount', async () => {
    const busy = await seedUser({ name: 'Busy', email: 'busy@example.com' })
    const quiet = await seedUser({ name: 'Quiet', email: 'quiet@example.com' })
    await seedComment(busy.id)
    await seedComment(busy.id)
    await seedComment(quiet.id)

    const rows = await adminQuery.listAdminUsers(db, 0, 10, {}, 'commentCount')
    expect(rows[0].id).toBe(busy.id)
    expect(rows[0].commentCount).toBe(2)
    expect(rows[1].id).toBe(quiet.id)
  })

  it('aggregates comments only for the paginated users', async () => {
    // The off-page user's comments must not leak into the page's stats —
    // recency mode paginates users before aggregating (audit P1-13).
    const offPage = await seedUser({
      name: 'OffPage',
      email: 'off@example.com',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    })
    const onPage = await seedUser({
      name: 'OnPage',
      email: 'on@example.com',
      createdAt: new Date('2024-01-02T00:00:00Z'),
    })
    await seedComment(offPage.id)
    await seedComment(offPage.id)
    const latest = await seedComment(onPage.id, { createdAt: new Date('2024-02-01T00:00:00Z') })

    const rows = await adminQuery.listAdminUsers(db, 0, 1, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(onPage.id)
    expect(rows[0].commentCount).toBe(1)
    expect(rows[0].lastCommentAt?.getTime()).toBe(latest.createdAt.getTime())
  })
})

describe('users/repos/admin-query — findAdminUserById', () => {
  it('returns null for unknown id', async () => {
    expect(await adminQuery.findAdminUserById(db, 9999)).toBeNull()
  })

  it('returns aggregated row for a known id', async () => {
    const u = await seedUser({ name: 'Known', email: 'k@example.com' })

    const row = await adminQuery.findAdminUserById(db, u.id)
    expect(row).not.toBeNull()
    expect(row!.name).toBe('Known')
    expect(row!.commentCount).toBe(0)
  })
})

describe('users/services/admin — toAdminUserDto', () => {
  it('stringifies bigint id and dates', async () => {
    const u = await seedUser({ name: 'Dto', email: 'dto@example.com' })
    const row = await adminQuery.findAdminUserById(db, u.id)
    expect(row).not.toBeNull()

    const dto = admin.toAdminUserDto(row!)
    expect(dto.id).toBe(String(u.id))
    expect(typeof dto.createdAt).toBe('string')
    expect(dto.deletedAt).toBeNull()
  })
})

describe('users/services/admin — listUsersForAdmin', () => {
  it('returns total and hasMore', async () => {
    await seedUser({ name: 'A', email: 'a@example.com' })
    await seedUser({ name: 'B', email: 'b@example.com' })

    const result = await admin.listUsersForAdmin(db, 0, 1, {}, 'recent')
    expect(result.users).toHaveLength(1)
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(true)
  })
})

describe('infra/db/operations/user — softDeleteUserById / restoreUserById', () => {
  it('soft-deletes then restores a user', async () => {
    const u = await seedUser({ name: 'Del', email: 'd@example.com' })

    expect(await userOps.softDeleteUserById(db, u.id)).toBe(true)
    const afterDelete = await db.select().from(user).where(eq(user.id, u.id)).limit(1)
    expect(afterDelete[0].deletedAt).not.toBeNull()

    expect(await userOps.restoreUserById(db, u.id)).toBe(true)
    const afterRestore = await db.select().from(user).where(eq(user.id, u.id)).limit(1)
    expect(afterRestore[0].deletedAt).toBeNull()
  })

  it('returns false when soft-deleting an already-deleted row', async () => {
    const u = await seedUser({ name: 'Del', email: 'd@example.com', deletedAt: new Date() })
    expect(await userOps.softDeleteUserById(db, u.id)).toBe(false)
  })
})

describe('infra/db/operations/user — setUserMuted', () => {
  it('flips isMuted for non-admin users', async () => {
    const u = await seedUser({ name: 'M', email: 'm@example.com', role: 'visitor' })
    const r1 = await userOps.setUserMuted(db, u.id, true)
    expect(r1?.isMuted).toBe(true)

    const r2 = await userOps.setUserMuted(db, u.id, false)
    expect(r2?.isMuted).toBe(false)
  })

  it('returns null when targeting an admin (cannot mute admins)', async () => {
    const u = await seedUser({ name: 'M', email: 'm@example.com', role: 'admin' })
    const r = await userOps.setUserMuted(db, u.id, true)
    expect(r).toBeNull()
  })
})

describe('users/services/admin — muteUser', () => {
  it('throws NOT_FOUND for an unknown target', async () => {
    await expect(admin.muteUser(db, 9999, true)).rejects.toThrow(/用户不存在或为管理员/)
  })

  it('throws NOT_FOUND when targeting an admin (admins cannot be muted)', async () => {
    const u = await seedUser({ name: 'Admin', email: 'admin-mute@example.com', role: 'admin' })
    await expect(admin.muteUser(db, u.id, true)).rejects.toThrow(/管理员不可禁言/)
  })

  it('mutes a user and returns the aggregated admin DTO', async () => {
    const u = await seedUser({ name: 'M', email: 'mute@example.com', role: 'visitor' })

    const dto = await admin.muteUser(db, u.id, true)
    expect(dto.id).toBe(String(u.id))
    expect(dto.isMuted).toBe(true)
    expect(dto.name).toBe('M')

    const unmuted = await admin.muteUser(db, u.id, false)
    expect(unmuted.isMuted).toBe(false)
  })
})

describe('users/services/admin — updateUserRoleWithGuard', () => {
  it('throws FORBIDDEN when the actor modifies their own role', async () => {
    const u = await seedUser({ name: 'Self', email: 'self@example.com', role: 'admin' })
    await expect(admin.updateUserRoleWithGuard(db, u.id, 'author', String(u.id))).rejects.toThrow(/不能修改自己的角色/)
  })

  it('throws NOT_FOUND for unknown target', async () => {
    await expect(admin.updateUserRoleWithGuard(db, 9999, 'author', '1')).rejects.toThrow(/用户不存在/)
  })

  it('throws CONFLICT when demoting the only admin', async () => {
    const u = await seedUser({ name: 'Solo', email: 'solo@example.com', role: 'admin' })
    await expect(admin.updateUserRoleWithGuard(db, u.id, 'author', 'other')).rejects.toThrow(/不能降级唯一的管理员/)
  })

  it('updates role when guard passes', async () => {
    const a = await seedUser({ name: 'A', email: 'a@example.com', role: 'admin' })
    const b = await seedUser({ name: 'B', email: 'b@example.com', role: 'author' })
    const updated = await admin.updateUserRoleWithGuard(db, b.id, 'visitor', String(a.id))
    expect(updated?.role).toBe('visitor')
  })

  it('leaves exactly one admin when the last two admins are demoted concurrently', async () => {
    const a = await seedUser({ name: 'A', email: 'race-a@example.com', role: 'admin' })
    const b = await seedUser({ name: 'B', email: 'race-b@example.com', role: 'admin' })

    const results = await Promise.allSettled([
      admin.updateUserRoleWithGuard(db, a.id, 'author', String(b.id)),
      admin.updateUserRoleWithGuard(db, b.id, 'author', String(a.id)),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(((rejected[0] as PromiseRejectedResult).reason as Error).message).toMatch(/不能降级唯一的管理员/)
    expect(userOps.countAdmins(db)).toBe(1)
  })
})

describe('users/services/admin — softDeleteUserWithGuard', () => {
  it('throws FORBIDDEN when actor deletes self', async () => {
    const u = await seedUser({ name: 'Self', email: 's@example.com' })
    await expect(admin.softDeleteUserWithGuard(db, u.id, String(u.id))).rejects.toThrow(/不能删除自己/)
  })

  it('throws CONFLICT when deleting the only admin', async () => {
    const u = await seedUser({ name: 'Solo', email: 'solo@example.com', role: 'admin' })
    await expect(admin.softDeleteUserWithGuard(db, u.id, 'other')).rejects.toThrow(/不能删除唯一的管理员/)
  })

  it('deletes a user and returns previousRole', async () => {
    const a = await seedUser({ name: 'A', email: 'a@example.com', role: 'admin' })
    const b = await seedUser({ name: 'B', email: 'b@example.com', role: 'author' })
    const result = await admin.softDeleteUserWithGuard(db, b.id, String(a.id))
    expect(result.previousRole).toBe('author')
  })

  it('leaves exactly one admin when the last two admins are deleted concurrently', async () => {
    const a = await seedUser({ name: 'A', email: 'race-a@example.com', role: 'admin' })
    const b = await seedUser({ name: 'B', email: 'race-b@example.com', role: 'admin' })

    const results = await Promise.allSettled([
      admin.softDeleteUserWithGuard(db, a.id, String(b.id)),
      admin.softDeleteUserWithGuard(db, b.id, String(a.id)),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(((rejected[0] as PromiseRejectedResult).reason as Error).message).toMatch(/不能删除唯一的管理员/)
    expect(userOps.countAdmins(db)).toBe(1)
  })
})

describe('users/services/admin — inviteAuthorWithRollback', () => {
  it('creates the author and sends the invite on the happy path', async () => {
    sendAuthorInvite.mockResolvedValueOnce({ ok: true })

    const result = await admin.inviteAuthorWithRollback(
      db,
      'Jane',
      'jane@example.com',
      'https://blog.example.com',
      'Admin',
    )
    expect(result.success).toBe(true)

    const rows = await db.select().from(user).where(eq(user.email, 'jane@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe('author')
  })

  it('throws CONFLICT when email already registered', async () => {
    await seedUser({ name: 'Existing', email: 'dup@example.com' })
    await expect(
      admin.inviteAuthorWithRollback(db, 'Jane', 'dup@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow(/已被注册/)
  })

  it('soft-deletes the author when email send fails', async () => {
    sendAuthorInvite.mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'down' })

    await expect(
      admin.inviteAuthorWithRollback(db, 'Jane', 'jane@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow(/邮件发送失败/)

    const rows = await db.select().from(user).where(eq(user.email, 'jane@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0].deletedAt).not.toBeNull()
  })
})

describe('users/services/admin — sendPasswordResetToUser', () => {
  it('throws NOT_FOUND when the user does not exist', async () => {
    await expect(admin.sendPasswordResetToUser(db, 'nobody@example.com', 'https://blog.example.com')).rejects.toThrow(
      /用户不存在/,
    )
  })

  it('throws NOT_FOUND when the user is soft-deleted', async () => {
    await seedUser({ name: 'Del', email: 'del@example.com', deletedAt: new Date() })
    await expect(admin.sendPasswordResetToUser(db, 'del@example.com', 'https://blog.example.com')).rejects.toThrow(
      /用户不存在/,
    )
  })

  it('issues a reset token and sends the email', async () => {
    await seedUser({ name: 'Reset', email: 'reset@example.com', password: 'hashed' })
    sendPasswordReset.mockResolvedValueOnce(undefined)

    const result = await admin.sendPasswordResetToUser(db, 'reset@example.com', 'https://blog.example.com')
    expect(result.userId).toBeDefined()
    expect(sendPasswordReset).toHaveBeenCalledTimes(1)
  })
})

describe('infra/db/operations/user — updateUserById', () => {
  it('applies only provided fields', async () => {
    const u = await seedUser({ name: 'Orig', email: 'orig@example.com', link: 'https://old.example.com' })
    const updated = await userOps.updateUserById(db, u.id, { name: 'New' })
    expect(updated?.name).toBe('New')
    expect(updated?.link).toBe('https://old.example.com')
  })

  it('clears badgeTextColor when null is passed', async () => {
    const u = await seedUser({
      name: 'Badge',
      email: 'b@example.com',
      badgeTextColor: '#fff',
    })
    const updated = await userOps.updateUserById(db, u.id, { badgeTextColor: null })
    expect(updated?.badgeTextColor).toBeNull()
  })
})

describe('users/services/account — updateAccountProfile', () => {
  it('throws NOT_FOUND when user does not exist', async () => {
    await expect(account.updateAccountProfile(db, 9999, {}, 'admin')).rejects.toThrow(/用户不存在/)
  })

  it('throws NOT_FOUND when user is soft-deleted', async () => {
    const u = await seedUser({ name: 'Del', email: 'd@example.com', deletedAt: new Date() })
    await expect(account.updateAccountProfile(db, u.id, {}, 'admin')).rejects.toThrow(/用户不存在/)
  })

  it('updates name and link', async () => {
    const u = await seedUser({ name: 'Orig', email: 'orig@example.com' })
    const updated = await account.updateAccountProfile(
      db,
      u.id,
      { name: 'New', link: 'https://new.example.com' },
      'admin',
    )
    expect(updated?.name).toBe('New')
    expect(updated?.link).toBe('https://new.example.com')
  })

  it('allows admins to set badge fields', async () => {
    const u = await seedUser({ name: 'Orig', email: 'orig@example.com' })
    const updated = await account.updateAccountProfile(db, u.id, { badgeName: 'MOD', badgeColor: '#000' }, 'admin')
    expect(updated?.badgeName).toBe('MOD')
    expect(updated?.badgeColor).toBe('#000')
  })

  it('ignores badge fields for visitors', async () => {
    const u = await seedUser({ name: 'Orig', email: 'orig@example.com', badgeName: 'OLD' })
    const updated = await account.updateAccountProfile(db, u.id, { name: 'NewName', badgeName: 'NEW' }, 'visitor')
    expect(updated?.name).toBe('NewName')
    expect(updated?.badgeName).toBe('OLD')
  })

  it('passes through receiveEmail toggle', async () => {
    const u = await seedUser({ name: 'Orig', email: 'orig@example.com', receiveEmail: true })
    const updated = await account.updateAccountProfile(db, u.id, { receiveEmail: false }, 'admin')
    expect(updated?.receiveEmail).toBe(false)
  })
})

describe('users/services/account — updateAccountPassword', () => {
  it('throws NOT_FOUND when user does not exist', async () => {
    await expect(account.updateAccountPassword(db, 9999, 'old', 'new')).rejects.toThrow(/用户不存在/)
  })

  it('throws FORBIDDEN when old password is wrong', async () => {
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.hash('correct', 4)
    const u = await seedUser({ name: 'P', email: 'p@example.com', password: hashed })

    await expect(account.updateAccountPassword(db, u.id, 'wrong', 'new')).rejects.toThrow(/原密码错误/)
  })

  it('updates password when old password matches', async () => {
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.hash('correct', 4)
    const u = await seedUser({ name: 'P', email: 'p@example.com', password: hashed })

    await account.updateAccountPassword(db, u.id, 'correct', 'newpass')

    const rows = await db.select({ password: user.password }).from(user).where(eq(user.id, u.id))
    expect(rows[0].password).not.toBe(hashed)
  })

  it('revokes outstanding password-reset tokens on a successful change', async () => {
    const bcrypt = await import('bcryptjs')
    const { issueResetToken, peekToken } = await import('@/server/domains/auth/verification-tokens')
    const hashed = await bcrypt.hash('correct', 4)
    const u = await seedUser({ name: 'P', email: 'p2@example.com', password: hashed })
    const { token } = issueResetToken(db, u.id)
    expect(await peekToken(db, token, 'password-reset')).not.toBeNull()

    await account.updateAccountPassword(db, u.id, 'correct', 'newpass')

    expect(await peekToken(db, token, 'password-reset')).toBeNull()
  })
})
