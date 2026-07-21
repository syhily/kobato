import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { UserSortOrder } from '@/server/domains/users/schema'
import type { User } from '@/server/infra/db/types'

import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { issueResetToken, issueSetupToken } from '@/server/domains/auth/verification-tokens'
import { bulkApprovePendingByUser, bulkSoftDeleteCommentsByUser } from '@/server/domains/comments/repos/moderation'
import {
  type AdminUserRow,
  type AdminUsersListFilters,
  countAdminUsers,
  findAdminUserById,
  listAdminUsers,
} from '@/server/domains/users/repos/admin-query'
import {
  countAdmins,
  findEmailById,
  findFirstAdminUser,
  findUserByEmail,
  findUserById,
  hasAdmin,
  insertAuthor,
  restoreUserById,
  setUserMuted,
  softDeleteUserById,
  updateUserById,
  updateUserRole,
} from '@/server/infra/db/operations/user'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { tryPasswordResetByTargetRateLimit } from '@/server/infra/rate-limit'

const log = getLogger('users.admin')

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
  passkeyForce: boolean
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
    passkeyForce: row.passkeyForce,
  }
}

// `setUserMuted` returns the raw `user` row (no aggregation); refetch
// the aggregated view so the client always gets the same DTO shape.
export async function fetchAdminUserDto(db: NodePgDatabase, id: bigint): Promise<AdminUserDto | null> {
  const row = await findAdminUserById(db, id)
  return row ? toAdminUserDto(row) : null
}

export interface ListAdminUsersResult {
  users: AdminUserRow[]
  total: number
  hasMore: boolean
}

export async function listUsersForAdmin(
  db: NodePgDatabase,
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

export async function getAdminUser(db: NodePgDatabase, id: bigint): Promise<AdminUserRow | null> {
  return findAdminUserById(db, id)
}

export async function softDeleteAdminUser(db: NodePgDatabase, id: bigint): Promise<boolean> {
  return softDeleteUserById(db, id)
}

export async function restoreAdminUser(db: NodePgDatabase, id: bigint): Promise<boolean> {
  return restoreUserById(db, id)
}

export async function muteAdminUser(db: NodePgDatabase, id: bigint, muted: boolean) {
  return setUserMuted(db, id, muted)
}

export async function bulkApproveCommentsForUser(db: NodePgDatabase, userId: bigint): Promise<{ approved: number }> {
  const approved = await bulkApprovePendingByUser(db, userId)
  return { approved }
}

export async function bulkDeleteCommentsForUser(db: NodePgDatabase, userId: bigint): Promise<{ deleted: number }> {
  const deleted = await bulkSoftDeleteCommentsByUser(db, userId)
  return { deleted }
}

// Role update with guard

export async function updateUserRoleWithGuard(
  db: NodePgDatabase,
  targetId: bigint,
  newRole: 'admin' | 'author' | 'visitor' | null,
  actorId: string,
): Promise<User | null> {
  if (actorId === String(targetId)) {
    throw new DomainError('FORBIDDEN', '不能修改自己的角色。')
  }
  const target = await findUserById(db, targetId)
  if (!target) {
    throw new DomainError('NOT_FOUND', '用户不存在。')
  }
  if (target.role === 'admin' && newRole !== 'admin') {
    const adminCount = await countAdmins(db)
    if (adminCount <= 1) {
      throw new DomainError('CONFLICT', '不能降级唯一的管理员。')
    }
  }
  const updated = await updateUserRole(db, targetId, newRole)
  if (updated) {
    await revokeAllSessionsOfUser(targetId)
  }
  return updated
}

// Invite author with rollback on email failure

export interface InviteAuthorResult {
  success: true
  userId: bigint
}

export async function inviteAuthorWithRollback(
  db: NodePgDatabase,
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

  // Phase 1: atomic DB writes. `insertAuthor` + `issueSetupToken` are
  // enrolled in a single transaction so a failure in either rolls both
  // back — no orphaned user rows or setup tokens can survive.
  const { user, token } = await db.transaction(async (tx) => {
    const [inserted] = await insertAuthor(tx, name, email)
    if (!inserted) {
      throw new DomainError('INTERNAL', '创建作者账户失败。')
    }
    const { token } = await issueSetupToken(tx, inserted.id)
    return { user: inserted, token }
  })

  // Phase 2: external side effect AFTER commit. If the email send fails
  // the only compensation needed is to soft-delete the user row — the
  // setup token was never committed, so there is nothing to revoke.
  const link = `${origin}/admin/signin?action=accept-invite&token=${encodeURIComponent(token)}`
  const sendResult = await sendAuthorInvite(user, link, inviterName, inviterEmail)
  if (!sendResult.ok) {
    try {
      await softDeleteUserById(db, user.id)
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

// Send password reset

export async function sendPasswordResetToUser(
  db: NodePgDatabase,
  email: string,
  origin: string,
): Promise<{ userId: bigint }> {
  const user = await findUserByEmail(db, email)
  if (!user || user.deletedAt) {
    throw new DomainError('NOT_FOUND', '用户不存在')
  }
  const limit = await tryPasswordResetByTargetRateLimit(user.id)
  if (limit.exceeded) {
    throw new DomainError('RATE_LIMITED', '该用户的重置邮件发送过于频繁，请稍后再试。')
  }
  const { token } = await issueResetToken(db, user.id)
  const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
  await sendPasswordResetEmail(user, link)
  return { userId: user.id }
}

// Update user by ID (admin patch)

export interface AdminUserPatch {
  name?: string
  email?: string
  link?: string
  badgeName?: string
  badgeColor?: string
  badgeTextColor?: string | null
}

export async function updateUserByIdWithGuard(
  db: NodePgDatabase,
  targetId: bigint,
  patch: AdminUserPatch,
): Promise<User | null> {
  const dbPatch: Parameters<typeof updateUserById>[2] = {}
  if (patch.name !== undefined) {
    dbPatch.name = patch.name
  }
  if (patch.email !== undefined) {
    dbPatch.email = patch.email
  }
  if (patch.link !== undefined) {
    dbPatch.link = patch.link
  }
  if (patch.badgeName !== undefined) {
    dbPatch.badgeName = patch.badgeName
  }
  if (patch.badgeColor !== undefined) {
    dbPatch.badgeColor = patch.badgeColor
  }
  if (patch.badgeTextColor !== undefined) {
    dbPatch.badgeTextColor = patch.badgeTextColor
  }
  return updateUserById(db, targetId, dbPatch)
}

// Soft delete user with guard

export async function softDeleteUserWithGuard(
  db: NodePgDatabase,
  targetId: bigint,
  actorId: string,
): Promise<{ previousRole: 'admin' | 'author' | 'visitor' | null }> {
  if (actorId === String(targetId)) {
    throw new DomainError('FORBIDDEN', '不能删除自己。')
  }
  const target = await findUserById(db, targetId)
  if (!target) {
    throw new DomainError('NOT_FOUND', '用户不存在')
  }
  if (target.role === 'admin') {
    const adminCount = await countAdmins(db)
    if (adminCount <= 1) {
      throw new DomainError('CONFLICT', '不能删除唯一的管理员。')
    }
  }
  const ok = await softDeleteUserById(db, targetId)
  if (!ok) {
    throw new DomainError('NOT_FOUND', '用户不存在或已被删除')
  }
  await revokeAllSessionsOfUser(targetId)
  return { previousRole: target.role }
}

export { findEmailById, findFirstAdminUser, findUserById, hasAdmin }
