import type { MyCommentEntityOption, MyCommentsStatus } from '@kobato/shared/types/comments'

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { listMyCommentEntities } from '@kobato/server/domains/comments/services/mine-comments'
import { resolveEntitiesForComments } from '@kobato/server/domains/content/entities/slug-title'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { parseCommentEntity, serializeCommentEntity } from '@kobato/shared/utils/comments'
import { idFromString } from '@kobato/shared/utils/id'
import { MyCommentsView } from '@kobato/ui/admin/my/MyCommentsView'
import { data, useOutletContext } from 'react-router'

import type { Route } from './+types/comments'

export const meta = titleMeta('我的评论')

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
  const rc = getRequestContext({ request, context })
  const ctx = { user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // Self-service path — any logged-in role can see their own comments.
  requireRole(ctx, 'visitor')
  const userId = idFromString(ctx.user.id)
  const url = new URL(request.url)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseCommentEntity(url.searchParams.get('entity'))
  const entityValue = entity ? serializeCommentEntity(entity) : null

  const entityOptionsRaw = await listMyCommentEntities(rc.db, userId)
  const entityOptions: MyCommentEntityOption[] = entityOptionsRaw.map((e) => ({
    value: serializeCommentEntity({ type: e.type, ownerId: e.ownerId }),
    label: e.title,
  }))

  // If the URL pins an entity that isn't in the result set, do a
  // follow-up lookup so the trigger can render the human-readable title.
  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await resolveEntitiesForComments(rc.db, [entity])
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
