import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityType } from '@/server/infra/db/target'

import { targetSlugTitleSubquery, type PendingCommentRow } from '@/server/domains/comments/repos/shared'
import { comment } from '@/server/infra/db/schema/comment'
import { user } from '@/server/infra/db/schema/user'
import { idFromString } from '@/shared/utils/id'
import { isRecord } from '@/shared/utils/type-guards'

export async function pendingComments(db: Database, limit: number): Promise<PendingCommentRow[]> {
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
      ownerId: r.ownerId as number,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

export async function adminUserIds(db: Database): Promise<number[]> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
  return rows.map((r) => r.id)
}

export async function latestDistinctCommentIds(db: Database, adminIds: number[], limit: number): Promise<number[]> {
  const rows = db.all(latestDistinctCommentIdsQuery(adminIds, limit))
  return rows.map((row) => {
    const id = isRecord(row) ? row.id : undefined
    return idFromString(String(id))
  })
}

/**
 * The digest access path (audit P1-21, EXPLAIN-first): the planner resolves
 * `deleted_at IS NULL` through `idx_comment_deleted_at` and sorts the
 * survivors in a temp b-tree for the window partition. Measured against the
 * migrated schema seeded at personal-blog-plus scale (in-memory, median):
 * 10k comments ≈ 10ms, 50k ≈ 60ms, 100k ≈ 124ms uncached — and this query
 * sits behind the sidebar loader's 30s cache, so the per-render cost is
 * zero on cache hits. A partial covering index on
 * `(user_id, created_at DESC, id DESC) WHERE is_pending = false AND deleted_at IS NULL`
 * drops both temp b-trees but still scans every surviving row (the window
 * must see all users): only 124→75ms at 100k comments. Not worth a
 * speculative index at personal-blog scale — the access path is pinned by
 * `tests/it/server/domains/comments/repos.test.ts` instead.
 *
 * Trigger condition: if the comments table grows past ~50k rows AND the
 * sidebar cache-miss cost shows up in profiles, add that partial index via
 * a drizzle migration and re-pin the plan.
 */
export function latestDistinctCommentIdsQuery(adminIds: number[], limit: number): SQL {
  const userFilter = adminIds.length > 0 ? sql`${comment.userId} NOT IN (${sql.join(adminIds, sql`, `)})` : sql`1 = 1`
  return sql`SELECT    id
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
}

export async function commentsByIds(db: Database, ids: number[], limit: number): Promise<PendingCommentRow[]> {
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
      ownerId: r.ownerId as number,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}
