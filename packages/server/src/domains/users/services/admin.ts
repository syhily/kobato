import type { LoginMethod } from '@kobato/api/contracts/account/self'
import type { Database } from '@kobato/db/sqlite/database'
import type { User } from '@kobato/db/sqlite/types'

import {
  countUsers as countUsersOp,
  findUserByEmail,
  setUserMuted,
  softDeleteUserById,
} from '@kobato/db/sqlite/operations/identity/user'
import {
  type AdminUserRow,
  type AdminUsersListFilters,
  type AdminUsersSortOrder,
  countAdminUsers,
  findAdminUserById,
  listAdminUsers,
} from '@kobato/db/sqlite/operations/identity/user-admin'
import {
  changeUserRoleGuarded,
  inviteAuthorWithVerification,
  softDeleteUserGuarded,
} from '@kobato/db/sqlite/operations/identity/user-workflow'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions'
import { issueResetToken, mintSetupTokenValues } from '@kobato/server/domains/auth/verification-tokens'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@kobato/server/infra/email/sender'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { tryPasswordResetByTargetRateLimit } from '@kobato/server/infra/rate-limit'

const log = getLogger('users.admin')

export type UserSortOrder = AdminUsersSortOrder

export type { AdminUserRow, AdminUsersListFilters }

export async function countUsers(db: Database): Promise<number> {
  return countUsersOp(db)
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
  const outcome = changeUserRoleGuarded(db, targetId, newRole)
  if (outcome.outcome === 'not-found') {
    throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
  }
  if (outcome.outcome === 'sole-admin') {
    throw new DomainError('CONFLICT', descriptorFor('users.error.cannotDemoteSoleAdmin'))
  }
  await revokeAllSessionsOfUser(db, targetId)
  return { user: outcome.user, previousRole: outcome.previousRole }
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

  const verification = mintSetupTokenValues()
  const invited = inviteAuthorWithVerification(db, { name, email, verification })
  if (invited === null) {
    throw new DomainError('INTERNAL', descriptorFor('users.error.createAuthorFailed'))
  }
  const { user } = invited

  const link = `${origin}/admin/signin?action=accept-invite&token=${encodeURIComponent(verification.raw)}`
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
  const outcome = softDeleteUserGuarded(db, targetId)
  if (outcome.outcome === 'not-found') {
    throw new DomainError('NOT_FOUND', descriptorFor('users.error.notFound'))
  }
  if (outcome.outcome === 'sole-admin') {
    throw new DomainError('CONFLICT', descriptorFor('users.error.cannotDeleteSoleAdmin'))
  }
  await revokeAllSessionsOfUser(db, targetId)
  return { previousRole: outcome.previousRole }
}
