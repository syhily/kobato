import type { MyCommentsStatus } from '@kobato/api/contracts/comments'

import { parseCommentEntity, serializeCommentEntity } from '@kobato/api/contracts/comments'
import { requireRole } from '@kobato/server/domains/auth/rbac'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { MyCommentsView } from '@kobato/web-admin/ui/account/MyCommentsView'
import { data, useOutletContext } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/comments'

export const meta = titleMeta('meta.title.admin.myComments')

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
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'visitor')
  const url = new URL(request.url)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseCommentEntity(url.searchParams.get('entity'))
  const entityValue = entity ? serializeCommentEntity(entity) : null

  const { entities } = await caller.account.comments.searchMineEntities({})
  const entityOptions = [...entities]

  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await caller.account.comments.resolveEntity({ entity: entityValue! })
    if (resolved !== null) {
      entityOptions.unshift(resolved)
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
