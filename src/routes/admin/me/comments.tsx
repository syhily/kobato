import { data } from 'react-router'

import type { MyCommentsStatus } from '@/server/domains/comments/repos/shared'
import type { EntityType } from '@/server/infra/db/target'
import type { PortableTextBody as PortableTextBodyType } from '@/shared/pt/schema'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments, listMyCommentEntities, listMyComments } from '@/server/domains/comments/repos/admin-query'
import { findParentCommentsByIds } from '@/server/domains/comments/repos/public-query/by-id'
import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query/entities'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'

import type { Route } from './+types/comments'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '我的评论' }, bundleFromMatches(matches))
}

export interface MyCommentEntityOption {
  /** `${type}:${ownerId}` — opaque Combobox value. */
  value: string
  /** Entity title shown in the trigger and the dropdown rows. */
  label: string
}

export interface MyCommentItem {
  id: string
  body: PortableTextBodyType
  createdAtIso: string
  deletedAtIso: string | null
  deleteRequestedAtIso: string | null
  isPending: boolean
  /**
   * Post / page the comment was posted under. Missing entry (`null`)
   * means the underlying row has been deleted.
   */
  entity: { title: string; permalink: string } | null
  /**
   * Set when the row is a reply. If the parent has been soft-deleted,
   * `isDeleted` is true and the name / excerpt are blank.
   */
  parent: { name: string; excerpt: string; isDeleted: boolean } | null
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
  // Iterate over Unicode codepoints so a CJK-heavy snippet doesn't
  // slice a surrogate pair in half.
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, EXCERPT_LIMIT).join('')}…`
}

function isMyCommentsStatus(value: string): value is MyCommentsStatus {
  return value === 'all' || value === 'pending' || value === 'deleteRequested' || value === 'deleted'
}

function parseStatus(raw: string | null): MyCommentsStatus {
  if (raw && isMyCommentsStatus(raw)) {
    return raw
  }
  return 'all'
}

// `?entity=<type>:<ownerId>` → `{ type, ownerId }`. Malformed values
// are dropped silently so a hand-edited URL renders the unfiltered list.
function parseEntityParam(raw: string | null): { type: EntityType; ownerId: bigint } | null {
  if (!raw) {
    return null
  }
  const idx = raw.indexOf(':')
  if (idx <= 0) {
    return null
  }
  const type = raw.slice(0, idx)
  if (type !== 'post' && type !== 'page') {
    return null
  }
  const rest = raw.slice(idx + 1)
  if (!/^\d+$/.test(rest)) {
    return null
  }
  try {
    return { type, ownerId: BigInt(rest) }
  } catch {
    return null
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  // Self-service path — any logged-in role can see their own comments.
  requireRole(ctx, 'visitor')
  const db = getDbFromContext({ request, context })
  const userId = BigInt(ctx.user.id)
  const url = new URL(request.url)
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10))
  const limit = Math.min(Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '10', 10)), 100)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseEntityParam(url.searchParams.get('entity'))
  const filters = { status, q: q || undefined, entity: entity ?? undefined }
  // When `entity` is unset, `totalCounts` reflects the user's entire
  // history. When `entity` is set, reuse `counts` for both.
  const [rows, counts, totalCountsRaw, entityOptionsRaw] = await Promise.all([
    listMyComments(db, userId, offset, limit, filters),
    countMyComments(db, userId, filters),
    entity ? Promise.resolve(null) : countMyComments(db, userId),
    listMyCommentEntities(db, userId),
  ])
  const totalCounts = totalCountsRaw ?? counts
  // Batch entity and parent-comment lookups so a page of N rows only
  // triggers at most two extra round-trips.
  const entityPairs = rows
    .filter((c): c is typeof c & { type: EntityType; ownerId: bigint } => c.type !== null && c.ownerId !== null)
    .map((c) => ({ type: c.type, ownerId: c.ownerId }))
  // `rid` is stored as `bigint(mode='number')`, but a real parent id may
  // exceed the safe-integer range — go through the string projection.
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
    findParentCommentsByIds(db, parentIds),
  ])
  const items: MyCommentItem[] = rows.map((c) => {
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
      body: (c.body ?? []) as PortableTextBodyType,
      createdAtIso: c.createAt ? new Date(c.createAt).toISOString() : '',
      deletedAtIso: c.deleteAt ? new Date(c.deleteAt).toISOString() : null,
      deleteRequestedAtIso: c.deleteRequestedAt ? new Date(c.deleteRequestedAt).toISOString() : null,
      isPending: c.isPending === true,
      entity: entity ? { title: entity.title, permalink: entityPermalink(entity.type, entity.slug) } : null,
      parent,
    }
  })
  // If the URL pins an entity that isn't in the result set, do a
  // follow-up lookup so the trigger can render the human-readable title.
  const entityOptions: MyCommentEntityOption[] = entityOptionsRaw.map((e) => ({
    value: `${e.type}:${e.ownerId}`,
    label: e.title,
  }))
  const entityValue = entity ? `${entity.type}:${entity.ownerId}` : null
  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await resolveEntitiesForComments(db, [entity])
    const row = resolved.get(`${entity.type}:${entity.ownerId}`)
    if (row) {
      entityOptions.unshift({ value: `${entity.type}:${entity.ownerId}`, label: row.title })
    }
  }
  return data({
    items,
    counts,
    totalCounts,
    offset,
    limit,
    status,
    q,
    entity: entityValue,
    entityOptions,
  })
}

export default function WpAdminMyCommentsRoute({ loaderData }: Route.ComponentProps) {
  return <MyCommentsView {...loaderData} />
}
