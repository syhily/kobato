import type { Database } from '@kobato/db/database'
import type { MyCommentEntity, MyCommentsFilters } from '@kobato/db/operations/comment'
import type { EntityType } from '@kobato/db/target'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import {
  countMyComments as countMyCommentsOp,
  findParentCommentsByIds,
  listMyCommentEntities as listMyCommentEntitiesOp,
  listMyComments,
  mineSoftDeleteCutoff,
} from '@kobato/db/operations/comment'
import { resolveEntitiesForComments } from '@kobato/db/operations/entity-asset'
import { entityPermalink } from '@kobato/server/domains/content/urls'

export interface MineCommentItem {
  id: string
  body: CommentEditorState
  content: string | null
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
      content: c.content ?? null,
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
  return listMyCommentEntitiesOp(db, userId, options)
}

export async function countMyComments(
  db: Database,
  userId: number,
  filters: MyCommentsFilters = {},
  cutoff: Date = mineSoftDeleteCutoff(),
): Promise<{ total: number; pending: number; deleteRequested: number; deleted: number }> {
  return countMyCommentsOp(db, userId, filters, cutoff)
}
