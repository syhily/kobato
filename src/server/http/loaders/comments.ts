import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { CommentFormUser } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'

import { userSession } from '@/server/domains/auth/primitives'
import { asCommentItemsWire } from '@/server/domains/comments/projection'
import { queryLikes } from '@/server/domains/comments/services/likes'
import { loadComments, parseComments } from '@/server/domains/comments/services/public-query'
import { ensureCommentPage } from '@/server/domains/comments/services/shared'
import { loadSidebarData } from '@/server/http/loaders/sidebar'

// Project through `CommentFormUser` — the reply form only needs the
// admin/non-admin split, keeping future session fields out of the SSR DOM.
function toCommentFormUser(user: SessionUser | undefined): CommentFormUser | undefined {
  if (user === undefined) {
    return undefined
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    website: user.website,
    admin: user.role === 'admin',
  }
}

// The streamed comments payload (`content.comments.byKey`) — split out so
// the route streams it via `<Await>` while the rest of the detail renders.
export async function loadCommentsAndItems(
  db: Database,
  session: BlogSession,
  target: EntityTarget,
): Promise<DetailPageComments> {
  const commentData = await loadComments(db, session, target, 0, { ensurePage: false })
  const commentItems = commentData && commentData.comments.length > 0 ? await parseComments(commentData.comments) : []
  return { commentData, commentItems: asCommentItemsWire(commentItems) }
}

// Above-the-fold detail data (likes, sidebar, current user); comments are
// excluded so the route streams them alongside the SSR HTML.
export async function loadDetailPageCritical(db: Database, session: BlogSession, target: EntityTarget) {
  const user = userSession(session)
  const currentUser = toCommentFormUser(user)

  const [metricRow, likes, sidebar] = await Promise.all([
    ensureCommentPage(db, target),
    queryLikes(db, target),
    loadSidebarData(db, session),
  ])

  return {
    commentKey: metricRow.publicId,
    likes,
    currentUser,
    ...sidebar,
  }
}
