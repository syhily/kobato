import type { LoginMethod } from '@kobato/api/contracts/users'
import type { Database } from '@kobato/db/database'
import type { User } from '@kobato/db/types'

import {
  countAdmins,
  findUserByEmail,
  findUserByIdForUpdate,
  insertAuthor,
  setUserMuted,
  softDeleteUserById,
  updateUserRole,
} from '@kobato/db/operations/user'
import { user } from '@kobato/db/schema/user'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions'
import { issueResetToken, issueSetupToken } from '@kobato/server/domains/auth/verification-tokens'
import {
  type AdminUserRow,
  type AdminUsersListFilters,
  countAdminUsers,
  findAdminUserById,
  listAdminUsers,
} from '@kobato/server/domains/users/repos/admin-query'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@kobato/server/infra/email/sender'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { tryPasswordResetByTargetRateLimit } from '@kobato/server/infra/rate-limit'
import { count } from 'drizzle-orm'

const log = getLogger('users.admin')

export type UserSortOrder = 'recent' | 'commentCount'

export async function countUsers(db: Database): Promise<number> {
  const rows = await db.select({ count: count() }).from(user)
  return rows[0]?.count ?? 0
}

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

export async function fetchAdminUserDto(db: Database, id: number): Promise<AdminUserDto | null> {
  const row = await findAdminUserById(db, id)
  return row ? toAdminUserDto(row) : null
}

export async function muteUser(db: Database, id: number, muted: boolean): Promise<AdminUserDto> {
  const updated = await setUserMuted(db, id, muted)
  if (!updated) {
    throw new DomainError('NOT_FOUND', descriptorFor('users.error.muteTargetNotFound'))
  }
  const dto = await fetchAdminUserDto(db, updated.id)
  if (!dto) {
    throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
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

export interface RoleUpdateResult {
  user: User
  previousRole: User['role']
}

export async function updateUserRoleWithGuard(
  db: Database,
  targetId: number,
  newRole: 'admin' | 'author' | 'visitor' | null,
  actorId: string,
): Promise<RoleUpdateResult | null> {
  if (actorId === String(targetId)) {
    throw new DomainError('FORBIDDEN', descriptorFor('users.error.cannotChangeOwnRole'))
  }
  const result = db.transaction((tx) => {
    const target = findUserByIdForUpdate(tx, targetId)
    if (!target) {
      throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
    }
    if (target.role === 'admin' && newRole !== 'admin') {
      const adminCount = countAdmins(tx)
      if (adminCount <= 1) {
        throw new DomainError('CONFLICT', descriptorFor('users.error.cannotDemoteSoleAdmin'))
      }
    }
    const updated = updateUserRole(tx, targetId, newRole)
    return updated ? { user: updated, previousRole: target.role } : null
  })
  if (result) {
    await revokeAllSessionsOfUser(db, targetId)
  }
  return result
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
    throw new DomainError('CONFLICT', descriptorFor('users.error.emailTaken'))
  }

  const { user, token } = db.transaction((tx) => {
    const [inserted] = insertAuthor(tx, name, email)
    if (!inserted) {
      throw new DomainError('INTERNAL', descriptorFor('users.error.createAuthorFailed'))
    }
    const { token } = issueSetupToken(tx, inserted.id)
    return { user: inserted, token }
  })

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
      throw new DomainError('INTERNAL', descriptorFor('users.error.mailFailedCleanupFailed'))
    }
    log.error('author invite email failed — user soft-deleted', {
      email,
      reason: sendResult.reason,
      message: sendResult.message,
    })
    throw new DomainError('INTERNAL', descriptorFor('users.error.mailFailedRolledBack'))
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
    throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
  }
  const limit = await tryPasswordResetByTargetRateLimit(user.id)
  if (limit.exceeded) {
    throw new DomainError('RATE_LIMITED', descriptorFor('users.error.resetMailTooFrequent'))
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
    throw new DomainError('FORBIDDEN', descriptorFor('users.error.cannotDeleteSelf'))
  }
  const result = db.transaction((tx) => {
    const target = findUserByIdForUpdate(tx, targetId)
    if (!target) {
      throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
    }
    if (target.role === 'admin') {
      const adminCount = countAdmins(tx)
      if (adminCount <= 1) {
        throw new DomainError('CONFLICT', descriptorFor('users.error.cannotDeleteSoleAdmin'))
      }
    }
    const ok = softDeleteUserById(tx, targetId)
    if (!ok) {
      throw new DomainError('NOT_FOUND', descriptorFor('users.error.deleteNotFound'))
    }
    return { previousRole: target.role }
  })
  await revokeAllSessionsOfUser(db, targetId)
  return result
}
