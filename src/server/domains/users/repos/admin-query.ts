import { and, count, desc, eq, inArray, isNull, max, or, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { LoginMethod } from '@/shared/contracts/users'

import { likeEscape } from '@/server/infra/db/like-escape'
import { comment } from '@/server/infra/db/schema/comment'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

export type UserRoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'

export interface AdminUsersListFilters {
  q?: string
  role?: UserRoleFilter
  includeDeleted?: boolean
  hasPosts?: boolean
  hasPages?: boolean
}

export interface AdminUserRow {
  id: number
  name: string
  email: string
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  role: 'admin' | 'author' | 'visitor' | null
  isMuted: boolean
  emailVerified: boolean
  createdAt: Date
  deletedAt: Date | null
  commentCount: number
  pendingCount: number
  lastCommentAt: Date | null
  passkeyCount: number
  loginMethod: LoginMethod
}

function buildAdminUsersConditions(filters: AdminUsersListFilters) {
  const conditions = []
  if (!filters.includeDeleted) {
    conditions.push(isNull(user.deletedAt))
  }
  if (filters.role === 'admin') {
    conditions.push(eq(user.role, 'admin'))
  } else if (filters.role === 'author') {
    conditions.push(eq(user.role, 'author'))
  } else if (filters.role === 'visitor') {
    conditions.push(eq(user.role, 'visitor'))
  } else if (filters.role === 'normal') {
    // Non-admin users: author, visitor, or role-less anonymous.
    conditions.push(or(eq(user.role, 'author'), eq(user.role, 'visitor'), isNull(user.role)))
  }
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    conditions.push(or(likeEscape(user.name, q), likeEscape(user.email, q)))
  }
  if (filters.hasPosts) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ${post} WHERE ${eq(post.authorId, user.id)})`)
  }
  if (filters.hasPages) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ${page} WHERE ${eq(page.authorId, user.id)})`)
  }
  return conditions
}

export async function countAdminUsers(db: Database, filters: AdminUsersListFilters): Promise<number> {
  const conditions = buildAdminUsersConditions(filters)
  const rows = await db
    .select({ counts: count() })
    .from(user)
    .where(conditions.length ? and(...conditions) : undefined)
  return rows[0]?.counts ?? 0
}

export type AdminUsersSortOrder = 'recent' | 'commentCount'

function lastCommentAtAggregate() {
  return max(comment.createdAt).mapWith((value: Date | string) => (value instanceof Date ? value : new Date(value)))
}

interface CommentStats {
  commentCount: number
  pendingCount: number
  lastCommentAt: Date | null
}

const EMPTY_COMMENT_STATS: CommentStats = { commentCount: 0, pendingCount: 0, lastCommentAt: null }

// One grouped scan over just these users' comments (audit P1-13). `lastCommentAt`
// intentionally counts soft-deleted comments.
async function aggregateCommentStats(db: Database, userIds: readonly number[]): Promise<Map<number, CommentStats>> {
  const stats = new Map<number, CommentStats>()
  if (userIds.length === 0) {
    return stats
  }
  const rows = await db
    .select({
      userId: comment.userId,
      commentCount: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL)`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE)`,
      lastCommentAt: lastCommentAtAggregate(),
    })
    .from(comment)
    .where(inArray(comment.userId, [...userIds]))
    .groupBy(comment.userId)
  for (const row of rows) {
    stats.set(row.userId, {
      commentCount: Number(row.commentCount ?? 0),
      pendingCount: Number(row.pendingCount ?? 0),
      lastCommentAt: row.lastCommentAt ?? null,
    })
  }
  return stats
}

export async function listAdminUsers(
  db: Database,
  offset: number,
  limit: number,
  filters: AdminUsersListFilters,
  sortBy: AdminUsersSortOrder = 'recent',
): Promise<AdminUserRow[]> {
  const conditions = buildAdminUsersConditions(filters)

  // commentCount sort needs the full aggregate, so it LEFT JOINs before LIMIT.
  if (sortBy === 'commentCount') {
    const commentCountSql = sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL)`
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        link: user.link,
        badgeName: user.badgeName,
        badgeColor: user.badgeColor,
        badgeTextColor: user.badgeTextColor,
        role: user.role,
        isMuted: user.isMuted,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        deletedAt: user.deletedAt,
        commentCount: commentCountSql,
        pendingCount: sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE)`,
        lastCommentAt: lastCommentAtAggregate(),
        passkeyCount: sql<number>`(SELECT COUNT(*) FROM passkey_credential WHERE passkey_credential.user_id = ${user.id})`,
        loginMethod: user.loginMethod,
      })
      .from(user)
      .leftJoin(comment, eq(comment.userId, user.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(user.id)
      .orderBy(desc(commentCountSql), desc(user.id))
      .limit(limit)
      .offset(offset)

    return rows.map((row) => ({
      ...row,
      role: row.role ?? null,
      commentCount: Number(row.commentCount ?? 0),
      pendingCount: Number(row.pendingCount ?? 0),
      passkeyCount: Number(row.passkeyCount ?? 0),
    }))
  }

  // Default recency order: aggregate comments only for this page after LIMIT.
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      link: user.link,
      badgeName: user.badgeName,
      badgeColor: user.badgeColor,
      badgeTextColor: user.badgeTextColor,
      role: user.role,
      isMuted: user.isMuted,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      passkeyCount: sql<number>`(SELECT COUNT(*) FROM passkey_credential WHERE passkey_credential.user_id = ${user.id})`,
      loginMethod: user.loginMethod,
    })
    .from(user)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(limit)
    .offset(offset)
  const stats = await aggregateCommentStats(
    db,
    rows.map((row) => row.id),
  )

  return rows.map((row) => {
    const stat = stats.get(row.id) ?? EMPTY_COMMENT_STATS
    return {
      ...row,
      role: row.role ?? null,
      commentCount: stat.commentCount,
      pendingCount: stat.pendingCount,
      lastCommentAt: stat.lastCommentAt,
      passkeyCount: Number(row.passkeyCount ?? 0),
    }
  })
}

export async function findAdminUserById(db: Database, id: number): Promise<AdminUserRow | null> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      link: user.link,
      badgeName: user.badgeName,
      badgeColor: user.badgeColor,
      badgeTextColor: user.badgeTextColor,
      role: user.role,
      isMuted: user.isMuted,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      passkeyCount: sql<number>`(SELECT COUNT(*) FROM passkey_credential WHERE passkey_credential.user_id = ${user.id})`,
      loginMethod: user.loginMethod,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return null
  }
  const stats = await aggregateCommentStats(db, [id])
  const stat = stats.get(id) ?? EMPTY_COMMENT_STATS
  return {
    ...row,
    role: row.role ?? null,
    commentCount: stat.commentCount,
    pendingCount: stat.pendingCount,
    lastCommentAt: stat.lastCommentAt,
    passkeyCount: Number(row.passkeyCount ?? 0),
  }
}
