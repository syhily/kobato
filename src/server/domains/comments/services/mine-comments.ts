import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { MyCommentsFilters } from '@/server/domains/comments/repos/shared'
import type { EntityType } from '@/server/infra/db/target'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { countMyComments, listMyComments } from '@/server/domains/comments/repos/admin-query'
import { findParentCommentsByIds } from '@/server/domains/comments/repos/public-query/by-id'
import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query/entities'
import { mineSoftDeleteCutoff } from '@/server/domains/comments/repos/shared'

export interface MineCommentItem {
  id: string
  body: CommentBody
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

function entityPermalink(type: EntityType, slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

function makeExcerpt(raw: string): string {
  const trimmed = raw.trim()
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
  db: NodePgDatabase,
  userId: bigint,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
): Promise<LoadMineCommentsResult> {
  // Compute the soft-delete cutoff once so the parallel list/count
  // queries see the same set of visible comments.
  const cutoff = mineSoftDeleteCutoff()
  const [rows, counts] = await Promise.all([
    listMyComments(db, userId, offset, limit, filters, cutoff),
    countMyComments(db, userId, filters, cutoff),
  ])

  const entityPairs = rows
    .filter((c): c is typeof c & { type: EntityType; ownerId: bigint } => c.type !== null && c.ownerId !== null)
    .map((c) => ({ type: c.type, ownerId: c.ownerId }))

  const parentIds = Array.from(
    new Set(
      rows
        .map((c) => c.rid)
        .filter((rid): rid is number => typeof rid === 'number' && rid !== 0)
        .map((rid) => String(rid)),
    ),
  ).map((id) => BigInt(id))

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
      body: (c.body ?? []) as CommentBody,
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
