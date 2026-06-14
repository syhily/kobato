import { data, useOutletContext } from 'react-router'

import type { MyCommentsStatus } from '@/server/domains/comments/repos/shared'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { listMyCommentEntities } from '@/server/domains/comments/repos/admin-query'
import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query/entities'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { parseCommentEntity, serializeCommentEntity } from '@/shared/utils/comments'
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
  body: CommentBody
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

function isMyCommentsStatus(value: string): value is MyCommentsStatus {
  return value === 'all' || value === 'pending' || value === 'deleteRequested' || value === 'deleted'
}

function parseStatus(raw: string | null): MyCommentsStatus {
  if (raw && isMyCommentsStatus(raw)) {
    return raw
  }
  return 'all'
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  // Self-service path — any logged-in role can see their own comments.
  requireRole(ctx, 'visitor')
  const db = getDbFromContext({ request, context })
  const userId = BigInt(ctx.user.id)
  const url = new URL(request.url)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseCommentEntity(url.searchParams.get('entity'))
  const entityValue = entity ? serializeCommentEntity(entity) : null

  const entityOptionsRaw = await listMyCommentEntities(db, userId)
  const entityOptions: MyCommentEntityOption[] = entityOptionsRaw.map((e) => ({
    value: serializeCommentEntity({ type: e.type, ownerId: e.ownerId }),
    label: e.title,
  }))

  // If the URL pins an entity that isn't in the result set, do a
  // follow-up lookup so the trigger can render the human-readable title.
  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await resolveEntitiesForComments(db, [entity])
    const row = resolved.get(serializeCommentEntity(entity))
    if (row) {
      entityOptions.unshift({ value: serializeCommentEntity(entity), label: row.title })
    }
  }

  return data({
    status,
    q,
    entity: entityValue,
    entityOptions,
  })
}

export default function WpAdminMyCommentsRoute({ loaderData }: Route.ComponentProps) {
  const { currentUser } = useOutletContext<{ currentUser: { id: string; name: string; email: string } }>()
  return <MyCommentsView {...loaderData} currentUser={currentUser} />
}
