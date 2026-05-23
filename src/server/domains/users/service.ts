import type { UserSortOrder } from '@/server/domains/users/schema'
import type { User } from '@/server/infra/db/types'

import { bulkApprovePendingByUser, bulkSoftDeleteCommentsByUser } from '@/server/domains/comments/repos/moderation'
import {
  type AdminUserRow,
  type AdminUsersListFilters,
  countAdminUsers,
  findAdminUserById,
  listAdminUsers,
  restoreUserById,
  setUserMuted,
  softDeleteUserById,
} from '@/server/infra/db/operations/user'

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
  lastIp: string | null
  lastUa: string | null
  commentCount: number
  pendingCount: number
  lastCommentAt: string | null
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
    lastIp: row.lastIp,
    lastUa: row.lastUa,
    commentCount: row.commentCount,
    pendingCount: row.pendingCount,
    lastCommentAt: row.lastCommentAt ? row.lastCommentAt.toISOString() : null,
  }
}

// `setUserMuted` returns the raw `user` row (no aggregation); refetch
// the aggregated view so the client always gets the same DTO shape.
export async function fetchAdminUserDto(id: bigint): Promise<AdminUserDto | null> {
  const row = await findAdminUserById(id)
  return row ? toAdminUserDto(row) : null
}

export type { User }

export interface ListAdminUsersResult {
  users: AdminUserRow[]
  total: number
  hasMore: boolean
}

export async function listUsersForAdmin(
  offset: number,
  limit: number,
  filters: AdminUsersListFilters,
  sortBy: UserSortOrder = 'recent',
): Promise<ListAdminUsersResult> {
  const [total, users] = await Promise.all([countAdminUsers(filters), listAdminUsers(offset, limit, filters, sortBy)])
  return { users, total, hasMore: offset + users.length < total }
}

export async function getAdminUser(id: bigint): Promise<AdminUserRow | null> {
  return findAdminUserById(id)
}

export async function softDeleteAdminUser(id: bigint): Promise<boolean> {
  return softDeleteUserById(id)
}

export async function restoreAdminUser(id: bigint): Promise<boolean> {
  return restoreUserById(id)
}

export async function muteAdminUser(id: bigint, muted: boolean) {
  return setUserMuted(id, muted)
}

export async function bulkApproveCommentsForUser(userId: bigint): Promise<{ approved: number }> {
  const approved = await bulkApprovePendingByUser(userId)
  return { approved }
}

export async function bulkDeleteCommentsForUser(userId: bigint): Promise<{ deleted: number }> {
  const deleted = await bulkSoftDeleteCommentsByUser(userId)
  return { deleted }
}
