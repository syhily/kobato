import { count } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { User } from '@/server/infra/db/types'
import type { LoginMethod } from '@/shared/contracts/users'
import type { UserSortOrder } from '@/shared/types/users'

import { revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import { issueResetToken, issueSetupToken } from '@/server/domains/auth/verification-tokens'
import {
  type AdminUserRow,
  type AdminUsersListFilters,
  countAdminUsers,
  findAdminUserById,
  listAdminUsers,
} from '@/server/domains/users/repos/admin-query'
import {
  countAdmins,
  findUserByEmail,
  findUserByIdForUpdate,
  insertAuthor,
  setUserMuted,
  softDeleteUserById,
  updateUserRole,
} from '@/server/infra/db/operations/user'
import { user } from '@/server/infra/db/schema/user'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { tryPasswordResetByTargetRateLimit } from '@/server/infra/rate-limit'

const log = getLogger('users.admin')

// Total user rows (deleted included) for the admin shell's user-count
// badge. Promoted from `infra/db/operations/user` — the admin shell was
// its only consumer, so the capability lives on the users surface.
export async function countUsers(db: Database): Promise<number> {
  const rows = await db.select({ count: count() }).from(user)
  return rows[0]?.count ?? 0
}

// Wire-format DTO returned by every admin user-management endpoint.
// Bigints are stringified so `BigInt` plumbing never reaches the client.
export interface AdminUserDto {
  id: string
  name: string
  email: string
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  role: 'admin' | 'author' | 'visitor' | null
  isMuted: boolean
  emailVerified: boolean
  createdAt: string
  deletedAt: string | null
  commentCount: number
  pendingCount: number
  lastCommentAt: string | null
  passkeyCount: number
  loginMethod: LoginMethod
}

export function toAdminUserDto(row: AdminUserRow): AdminUserDto {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    link: row.link,
    badgeName: row.badgeName,
    badgeColor: row.badgeColor,
    badgeTextColor: row.badgeTextColor,
    role: row.role,
    isMuted: row.isMuted,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    commentCount: row.commentCount,
    pendingCount: row.pendingCount,
    lastCommentAt: row.lastCommentAt ? row.lastCommentAt.toISOString() : null,
    passkeyCount: row.passkeyCount,
    loginMethod: row.loginMethod,
  }
}

// `setUserMuted` returns the raw `user` row (no aggregation); refetch
// the aggregated view so the client always gets the same DTO shape.
export async function fetchAdminUserDto(db: Database, id: number): Promise<AdminUserDto | null> {
  const row = await findAdminUserById(db, id)
  return row ? toAdminUserDto(row) : null
}

// Mute/unmute an account and return the aggregated admin DTO. The
// "admins cannot be muted" guard lives inside `setUserMuted`'s WHERE
// clause, so a null write covers both "no such user" and "target is an
// admin" — same wire contract the controller used to inline.
export async function muteUser(db: Database, id: number, muted: boolean): Promise<AdminUserDto> {
  const updated = await setUserMuted(db, id, muted)
  if (!updated) {
    throw new DomainError('NOT_FOUND', '用户不存在或为管理员（管理员不可禁言）')
  }
  const dto = await fetchAdminUserDto(db, updated.id)
  if (!dto) {
    throw new DomainError('NOT_FOUND', '用户不存在')
  }
  return dto
}

export interface ListAdminUsersResult {
  users: AdminUserRow[]
  total: number
  hasMore: boolean
}

export async function listUsersForAdmin(
  db: Database,
  offset: number,
  limit: number,
  filters: AdminUsersListFilters,
  sortBy: UserSortOrder = 'recent',
): Promise<ListAdminUsersResult> {
  const [total, users] = await Promise.all([
    countAdminUsers(db, filters),
    listAdminUsers(db, offset, limit, filters, sortBy),
  ])
  return { users, total, hasMore: offset + users.length < total }
}

export async function updateUserRoleWithGuard(
  db: Database,
  targetId: number,
  newRole: 'admin' | 'author' | 'visitor' | null,
  actorId: string,
): Promise<User | null> {
  if (actorId === String(targetId)) {
    throw new DomainError('FORBIDDEN', '不能修改自己的角色。')
  }
  // Last-admin guard and the role write share ONE sync transaction
  // (node:sqlite): two concurrent demotions can no longer both pass the
  // count check and zero the admin set (check-then-act race).
  const updated = db.transaction((tx) => {
    const target = findUserByIdForUpdate(tx, targetId)
    if (!target) {
      throw new DomainError('NOT_FOUND', '用户不存在。')
    }
    if (target.role === 'admin' && newRole !== 'admin') {
      const adminCount = countAdmins(tx)
      if (adminCount <= 1) {
        throw new DomainError('CONFLICT', '不能降级唯一的管理员。')
      }
    }
    return updateUserRole(tx, targetId, newRole)
  })
  if (updated) {
    await revokeAllSessionsOfUser(db, targetId)
  }
  return updated
}

export interface InviteAuthorResult {
  success: true
  userId: number
}

export async function inviteAuthorWithRollback(
  db: Database,
  name: string,
  email: string,
  origin: string,
  inviterName: string,
  inviterEmail?: string,
): Promise<InviteAuthorResult> {
  const existing = await findUserByEmail(db, email)
  if (existing !== null) {
    throw new DomainError('CONFLICT', '该邮箱已被注册。')
  }

  // Atomic DB writes: `insertAuthor` + `issueSetupToken` in a single
  // (sync — node:sqlite) transaction so a failure rolls both back.
  const { user, token } = db.transaction((tx) => {
    const [inserted] = insertAuthor(tx, name, email)
    if (!inserted) {
      throw new DomainError('INTERNAL', '创建作者账户失败。')
    }
    const { token } = issueSetupToken(tx, inserted.id)
    return { user: inserted, token }
  })

  // External side effect AFTER commit. If the email send fails,
  // soft-delete the user row — the token was never committed.
  const link = `${origin}/admin/signin?action=accept-invite&token=${encodeURIComponent(token)}`
  const sendResult = await sendAuthorInvite(user, link, inviterName, inviterEmail)
  if (!sendResult.ok) {
    try {
      softDeleteUserById(db, user.id)
    } catch (cleanupErr) {
      log.error('author invite cleanup failed — orphaned user row', {
        userId: String(user.id),
        email,
        cleanupErr,
      })
      throw new DomainError('INTERNAL', '邮件发送失败，且账户清理失败。该邮箱已被占用，请手动处理。')
    }
    log.error('author invite email failed — user soft-deleted', {
      email,
      reason: sendResult.reason,
      message: sendResult.message,
    })
    throw new DomainError('INTERNAL', '邮件发送失败，已回滚账户创建。')
  }

  return { success: true, userId: user.id }
}

export async function sendPasswordResetToUser(
  db: Database,
  email: string,
  origin: string,
): Promise<{ userId: number }> {
  const user = await findUserByEmail(db, email)
  if (!user || user.deletedAt) {
    throw new DomainError('NOT_FOUND', '用户不存在')
  }
  const limit = await tryPasswordResetByTargetRateLimit(user.id)
  if (limit.exceeded) {
    throw new DomainError('RATE_LIMITED', '该用户的重置邮件发送过于频繁，请稍后再试。')
  }
  const { token } = issueResetToken(db, user.id)
  const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
  await sendPasswordResetEmail(user, link)
  return { userId: user.id }
}

export async function softDeleteUserWithGuard(
  db: Database,
  targetId: number,
  actorId: string,
): Promise<{ previousRole: 'admin' | 'author' | 'visitor' | null }> {
  if (actorId === String(targetId)) {
    throw new DomainError('FORBIDDEN', '不能删除自己。')
  }
  // Same transaction shape as the demote guard above: the count check
  // and the delete are atomic, so concurrent deletes can't zero the
  // admin set.
  const result = db.transaction((tx) => {
    const target = findUserByIdForUpdate(tx, targetId)
    if (!target) {
      throw new DomainError('NOT_FOUND', '用户不存在')
    }
    if (target.role === 'admin') {
      const adminCount = countAdmins(tx)
      if (adminCount <= 1) {
        throw new DomainError('CONFLICT', '不能删除唯一的管理员。')
      }
    }
    const ok = softDeleteUserById(tx, targetId)
    if (!ok) {
      throw new DomainError('NOT_FOUND', '用户不存在或已被删除')
    }
    return { previousRole: target.role }
  })
  await revokeAllSessionsOfUser(db, targetId)
  return result
}
