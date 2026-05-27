import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { EntityTarget, EntityType } from '@/server/infra/db/target'

import {
  commentWithUser,
  targetSlugTitleSubquery,
  whereTarget,
  type EntitySlugTitle,
  type ParentCommentRow,
  type PendingCommentRow,
} from '@/server/domains/comments/repos/shared'
import { comment } from '@/server/infra/db/schema/comment'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { idFromString } from '@/shared/utils/id'

export async function pendingComments(db: NodePgDatabase, limit: number): Promise<PendingCommentRow[]> {
  const entity = targetSlugTitleSubquery(db)
  const rows = await db
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(eq(comment.isPending, true))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as bigint,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

export async function adminUserIds(db: NodePgDatabase): Promise<bigint[]> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
  return rows.map((r) => r.id)
}

export async function latestDistinctCommentIds(
  db: NodePgDatabase,
  adminIds: bigint[],
  limit: number,
): Promise<bigint[]> {
  const userFilter = adminIds.length > 0 ? sql`${comment.userId} NOT IN (${sql.join(adminIds, sql`, `)})` : sql`1 = 1`
  const query = sql`SELECT    id
  FROM      (
            SELECT    id,
                      user_id,
                      created_at,
                      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
            FROM      ${comment}
            WHERE     is_pending = false
                AND   deleted_at IS NULL
                AND   ${userFilter}
            )         t
  WHERE     rn = 1
  ORDER BY  created_at DESC
  LIMIT     ${limit}`
  const result = await db.execute(query)
  return result.rows.map((row) => idFromString(String((row as { id: unknown }).id)))
}

export async function commentsByIds(db: NodePgDatabase, ids: bigint[], limit: number): Promise<PendingCommentRow[]> {
  if (ids.length === 0) {
    return []
  }
  const entity = targetSlugTitleSubquery(db)
  const rows = await db
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(inArray(comment.id, ids))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as bigint,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

// Computes both totals in a single round-trip using a filtered aggregate so
// loaders don't issue two near-identical queries on every comment render.
export async function countCommentsAndRoots(
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  currentUserId?: bigint,
): Promise<{ total: number; roots: number }> {
  const baseConditions = [
    whereTarget(target),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  const rows = await db
    .select({
      total: count(),
      roots: sql<number>`COUNT(*) FILTER (WHERE ${comment.rootId} = 0)`,
    })
    .from(comment)
    .where(and(...baseConditions))
  const row = rows[0]
  return { total: Number(row.total), roots: Number(row.roots) }
}

export async function findRootComments(
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  offset: number,
  limit: number,
  currentUserId?: bigint,
) {
  const baseConditions = [
    whereTarget(target),
    eq(comment.rootId, 0n),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
    .limit(limit)
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .offset(offset)
}

export async function findChildComments(
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  rootIds: bigint[],
  currentUserId?: bigint,
) {
  if (rootIds.length === 0) {
    return []
  }
  const baseConditions = [
    whereTarget(target),
    inArray(comment.rootId, rootIds),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
}

export async function findCommentRootId(db: NodePgDatabase, id: bigint): Promise<bigint | null> {
  const rows = await db.select({ rootId: comment.rootId }).from(comment).where(eq(comment.id, id)).limit(1)
  return rows[0]?.rootId ?? null
}

export async function countApprovedCommentsByUser(db: NodePgDatabase, userId: bigint): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.userId, userId), eq(comment.isPending, false)))
  return rows.length > 0 ? rows[0].count : 0
}

export async function recentCommentsForUserDedupe(db: NodePgDatabase, userId: bigint, since: Date, limit: number) {
  return db
    .select({ content: comment.content })
    .from(comment)
    .where(and(eq(comment.userId, userId), gte(comment.createdAt, since)))
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .limit(limit)
}

export async function findCommentWithUserById(db: NodePgDatabase, id: bigint) {
  const rows = await db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findCommentsByIds(db: NodePgDatabase, ids: bigint[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
}

export async function findCommentWithSourceUser(db: NodePgDatabase, id: bigint) {
  const rows = await db
    .select()
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findParentCommentsByIds(
  db: NodePgDatabase,
  ids: bigint[],
): Promise<Map<string, ParentCommentRow>> {
  const out = new Map<string, ParentCommentRow>()
  if (ids.length === 0) {
    return out
  }
  const rows = await db
    .select({
      id: comment.id,
      userId: comment.userId,
      name: user.name,
      content: comment.content,
      deletedAt: comment.deletedAt,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
  for (const r of rows) {
    out.set(String(r.id), {
      id: r.id,
      userId: r.userId,
      name: r.name,
      content: r.content ?? '',
      deletedAt: r.deletedAt ?? null,
    })
  }
  return out
}

export async function resolveEntitiesForComments(
  db: NodePgDatabase,
  pairs: ReadonlyArray<{ type: EntityType; ownerId: bigint }>,
): Promise<Map<string, EntitySlugTitle>> {
  const out = new Map<string, EntitySlugTitle>()
  if (pairs.length === 0) {
    return out
  }
  const postIds: bigint[] = []
  const pageIds: bigint[] = []
  const seen = new Set<string>()
  for (const p of pairs) {
    const key = `${p.type}:${p.ownerId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    if (p.type === 'post') {
      postIds.push(p.ownerId)
    } else if (p.type === 'page') {
      pageIds.push(p.ownerId)
    }
  }
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: post.id, slug: post.slug, title: post.title })
      .from(post)
      .where(inArray(post.id, postIds))
    for (const r of rows) {
      out.set(`post:${r.id}`, { type: 'post', slug: r.slug, title: r.title })
    }
  }
  if (pageIds.length > 0) {
    const rows = await db
      .select({ id: page.id, slug: page.slug, title: page.title })
      .from(page)
      .where(inArray(page.id, pageIds))
    for (const r of rows) {
      out.set(`page:${r.id}`, { type: 'page', slug: r.slug, title: r.title })
    }
  }
  return out
}
