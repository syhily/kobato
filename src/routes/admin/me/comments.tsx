import { data } from 'react-router'

import type { MyCommentsStatus } from '@/server/domains/comments/repos/shared'
import type { EntityType } from '@/server/infra/db/target'
import type { PortableTextBody as PortableTextBodyType } from '@/shared/pt/schema'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments, listMyCommentEntities, listMyComments } from '@/server/domains/comments/repos/admin-query'
import { findParentCommentsByIds, resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query'
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
   * Post / page the comment was posted under. Mirrors the moderation
   * widget projection: missing entry (`null`) means the underlying
   * `post` / `page` row has been deleted and the link target is gone.
   */
  entity: { title: string; permalink: string } | null
  /**
   * Set when the row is a reply (`comment.rid !== 0`). The parent's
   * author name and an 80-codepoint excerpt of the markdown snapshot.
   * If the parent has been soft-deleted, `isDeleted` is true and the
   * name / excerpt are blank so the UI can render the「已删除」
   * placeholder.
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
  // Iterate over Unicode codepoints (via `Array.from`, which uses the
  // string's `@@iterator` and splits per code point) so a CJK-heavy
  // snippet doesn't slice a surrogate pair in half. We intentionally
  // accept code-point — not grapheme — granularity here: an 80-cp
  // excerpt is a moderation hint, not a typographically perfect
  // shortening, and pulling in `Intl.Segmenter` for that would be
  // overkill.
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, EXCERPT_LIMIT).join('')}…`
}

const STATUS_VALUES: ReadonlySet<MyCommentsStatus> = new Set(['all', 'pending', 'deleteRequested', 'deleted'])

function parseStatus(raw: string | null): MyCommentsStatus {
  if (raw && (STATUS_VALUES as Set<string>).has(raw)) {
    return raw as MyCommentsStatus
  }
  return 'all'
}

// `?entity=<type>:<ownerId>` → `{ type, ownerId }`. Malformed values
// are dropped silently so a hand-edited URL just renders the unfiltered
// list rather than a 4xx page.
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
  // Self-service path — any logged-in role (admin/author/visitor) can
  // see their own comments. The admin layout already enforces a
  // `visitor` floor; keep the per-route guard explicit so future
  // refactors of the layout cannot accidentally widen access.
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
  // Status-counts policy:
  //   - When `entity` is unset, `totalCounts` reflects the user's
  //     entire history (so a "pending · 3" pill is visible even if
  //     they're currently on the "deleted" tab).
  //   - When `entity` is set, the tab pills should describe the
  //     entity-scoped view ("show me how many pending comments I left
  //     under THIS post"), so we reuse the filtered `counts` for both.
  const [rows, counts, totalCountsRaw, entityOptionsRaw] = await Promise.all([
    listMyComments(db, userId, offset, limit, filters),
    countMyComments(db, userId, filters),
    // When an entity filter is active, the tab pills should describe
    // the entity-scoped view, so skip the second roundtrip and reuse
    // `counts` below. We still issue a placeholder promise here so the
    // Promise.all shape stays static.
    entity ? Promise.resolve(null) : countMyComments(db, userId),
    listMyCommentEntities(db, userId),
  ])
  const totalCounts = totalCountsRaw ?? counts
  // Batch entity and parent-comment lookups so a page of N rows only
  // triggers at most two extra round-trips, not 2N.
  const entityPairs = rows
    .filter((c): c is typeof c & { type: EntityType; ownerId: bigint } => c.type !== null && c.ownerId !== null)
    .map((c) => ({ type: c.type, ownerId: c.ownerId }))
  // `rid` is stored as `bigint(mode='number')`, but a real parent id may
  // exceed the safe-integer range under heavy load — go through the
  // string projection to round-trip safely.
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
  // Build the Combobox option list. If the URL pins an entity that
  // isn't in the (capped, title-search-filtered) result set above, do
  // a single follow-up `resolveEntitiesForComments` lookup so the
  // trigger can render the human-readable title instead of the
  // opaque "post:42" value on direct-URL navigation.
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
