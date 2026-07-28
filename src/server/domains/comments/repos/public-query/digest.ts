import { and, desc, eq, inArray, sql } from 'drizzle-orm'

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
  const rows = db.all(query)
  return rows.map((row) => {
    const id = isRecord(row) ? row.id : undefined
    return idFromString(String(id))
  })
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
