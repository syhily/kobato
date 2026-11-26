import type { MyCommentsStatus } from '@kobato/api/contracts/account/comments'

import { orpc } from '@kobato/api/browser/client'
import { parseCommentEntity, serializeCommentEntity } from '@kobato/api/contracts/public/comments'
import { data, useOutletContext } from 'react-router'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { MyCommentsView } from '@/ui/account/MyCommentsView'

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

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'visitor', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseCommentEntity(url.searchParams.get('entity'))
  const entityValue = entity ? serializeCommentEntity(entity) : null

  const { entities } = await orpc.account.comments.searchMineEntities({})
  const entityOptions = [...entities]

  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await orpc.account.comments.resolveEntity({ entity: entityValue! })
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
