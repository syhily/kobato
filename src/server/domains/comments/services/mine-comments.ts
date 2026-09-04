import { and, count, eq, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityType } from '@/server/infra/db/target'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { listMyComments } from '@/server/domains/comments/repos/admin-query'
import { findParentCommentsByIds } from '@/server/domains/comments/repos/public-query/by-id'
import {
  mineSoftDeleteCutoff,
  mineVisibleClause,
  mineWhere,
  targetSlugTitleSubquery,
  MY_COMMENT_ENTITY_LIMIT,
  type MyCommentEntity,
  type MyCommentsFilters,
} from '@/server/domains/comments/repos/shared'
import { resolveEntitiesForComments } from '@/server/domains/content/entities/slug-title'
import { likeEscape } from '@/server/infra/db/like-escape'
import { comment } from '@/server/infra/db/schema/comment'
import { entityPermalink } from '@/shared/utils/paths'

export interface MineCommentItem {
  id: string
  body: CommentEditorState
  createdAtIso: string
  deletedAtIso: string | null
  deleteRequestedAtIso: string | null
  isPending: boolean
  entity: { title: string; permalink: string } | null
  parent: { name: string; excerpt: string; isDeleted: boolean } | null
}

export interface LoadMineCommentsResult {
  items: MineCommentItem[]
  total: number
  hasMore: boolean
}

const EXCERPT_LIMIT = 80

function makeExcerpt(raw: string): string {
  // R12: `content` is now degraded HTML, not markdown — strip tags first.
  const trimmed = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (trimmed === '') {
    return ''
  }
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, EXCERPT_LIMIT).join('')}…`
}

export async function loadMineCommentsPage(
  db: Database,
  userId: number,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
): Promise<LoadMineCommentsResult> {
  // Compute the cutoff once so the parallel list/count queries see the same visible set.
  const cutoff = mineSoftDeleteCutoff()
  const [rows, counts] = await Promise.all([
    listMyComments(db, userId, offset, limit, filters, cutoff),
    countMyComments(db, userId, filters, cutoff),
  ])

  const entityPairs = rows
    .filter((c): c is typeof c & { type: EntityType; ownerId: number } => c.type !== null && c.ownerId !== null)
    .map((c) => ({ type: c.type, ownerId: c.ownerId }))

  const parentIds = Array.from(
    new Set(rows.map((c) => c.rid).filter((rid): rid is number => typeof rid === 'number' && rid !== 0)),
  )

  const [entityMap, parentMap] = await Promise.all([
    resolveEntitiesForComments(db, entityPairs),
    parentIds.length > 0
      ? findParentCommentsByIds(db, parentIds)
      : Promise.resolve(new Map<string, { name: string; content: string; deletedAt: Date | null }>()),
  ])

  const items: MineCommentItem[] = rows.map((c) => {
    const entity = c.type && c.ownerId !== null ? (entityMap.get(`${c.type}:${c.ownerId}`) ?? null) : null
    const parentRaw = typeof c.rid === 'number' && c.rid !== 0 ? (parentMap.get(String(c.rid)) ?? null) : null
    const parent = parentRaw
      ? parentRaw.deletedAt !== null
        ? { name: '', excerpt: '', isDeleted: true as const }
        : {
            name: parentRaw.name,
            excerpt: makeExcerpt(parentRaw.content),
            isDeleted: false as const,
          }
      : null

    return {
      id: String(c.id),
      body: c.body,
      createdAtIso: c.createAt ? new Date(c.createAt).toISOString() : '',
      deletedAtIso: c.deleteAt ? new Date(c.deleteAt).toISOString() : null,
      deleteRequestedAtIso: c.deleteRequestedAt ? new Date(c.deleteRequestedAt).toISOString() : null,
      isPending: c.isPending === true,
      entity: entity ? { title: entity.title, permalink: entityPermalink(entity.type, entity.slug) } : null,
      parent,
    }
  })

  return {
    items,
    total: counts.total,
    hasMore: offset + rows.length < counts.total,
  }
}

export async function listMyCommentEntities(
  db: Database,
  userId: number,
  options: { q?: string; cutoff?: Date } = {},
): Promise<MyCommentEntity[]> {
  const q = options.q?.trim() ?? ''
  const entity = targetSlugTitleSubquery(db)
  const conditions = [mineVisibleClause(userId, options.cutoff ?? mineSoftDeleteCutoff())]
  if (q !== '') {
    conditions.push(likeEscape(entity.title, q))
  }
  const rows = await db
    .selectDistinct({
      type: entity.type,
      ownerId: entity.ownerId,
      slug: entity.slug,
      title: entity.title,
    })
    .from(comment)
    .innerJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(and(...conditions))
    .orderBy(entity.title)
    .limit(MY_COMMENT_ENTITY_LIMIT)
  return rows.map((row) => ({
    type: row.type,
    ownerId: row.ownerId,
    slug: row.slug ?? '',
    title: row.title ?? '',
  }))
}

export async function countMyComments(
  db: Database,
  userId: number,
  filters: MyCommentsFilters = {},
  cutoff: Date = mineSoftDeleteCutoff(),
): Promise<{ total: number; pending: number; deleteRequested: number; deleted: number }> {
  const rows = await db
    .select({
      total: count(),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${comment.isPending} = TRUE)`,
      deleteRequested: sql<number>`COUNT(*) FILTER (WHERE ${comment.deleteRequestedAt} IS NOT NULL)`,
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NOT NULL)`,
    })
    .from(comment)
    .where(mineWhere(userId, filters, cutoff))
  return {
    total: rows[0]?.total ?? 0,
    pending: rows[0]?.pending ?? 0,
    deleteRequested: rows[0]?.deleteRequested ?? 0,
    deleted: rows[0]?.deleted ?? 0,
  }
}
