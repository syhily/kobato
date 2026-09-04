import { data, useOutletContext } from 'react-router'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { MyCommentsStatus } from '@/shared/types/comments'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { parseCommentEntity, serializeCommentEntity } from '@/shared/utils/comments'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'

import type { Route } from './+types/comments'

export const meta = titleMeta('我的评论')

export interface MyCommentItem {
  id: string
  body: CommentEditorState
  createdAtIso: string
  deletedAtIso: string | null
  deleteRequestedAtIso: string | null
  isPending: boolean
  /** Post / page the comment was posted under; null means the row was deleted. */
  entity: { title: string; permalink: string } | null
  /** Reply parent; when soft-deleted, `isDeleted` is true and name/excerpt are blank. */
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
  const { caller, viewer } = createSsrCaller({ request, context })
  // Self-service path — any logged-in role can see their own comments.
  requireRole(viewer ?? undefined, 'visitor')
  const url = new URL(request.url)
  const status = parseStatus(url.searchParams.get('status'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = parseCommentEntity(url.searchParams.get('entity'))
  const entityValue = entity ? serializeCommentEntity(entity) : null

  const { entities } = await caller.comments.searchMineEntities({})
  const entityOptions = [...entities]

  // The URL may pin an entity outside the result set — resolve it so the
  // trigger can render the human-readable title.
  if (entity && !entityOptions.some((o) => o.value === entityValue)) {
    const resolved = await caller.comments.resolveEntity({ entity: entityValue! })
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
