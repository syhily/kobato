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

// `SessionUser` carries the canonical `role`. The public reply form
// only cares about the admin vs. non-admin distinction (admins bypass
// rate limits, render moderator badges, etc.), so project through
// `CommentFormUser` to keep future session fields out of the SSR DOM.
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

// Comments split out so the loader can stream them via React Router's
// `<Await>` while the rest of the detail (likes, sidebar, post body)
// renders immediately. PT bodies are stored pre-rendered, so the
// per-row work in `parseComments` is now just projection — but the
// network/DB round-trip is still worth deferring.
async function loadCommentsAndItems(
  db: Database,
  session: BlogSession,
  target: EntityTarget,
): Promise<DetailPageComments> {
  const commentData = await loadComments(db, session, target, 0, { ensurePage: false })
  const commentItems = commentData && commentData.comments.length > 0 ? await parseComments(commentData.comments) : []
  return { commentData, commentItems: asCommentItemsWire(commentItems) }
}

// "Critical" detail data: everything the page needs to paint above the fold
// (post body, likes, sidebar, current-user identity for the reply form).
// Comments are intentionally excluded so the loader can stream them
// alongside the SSR HTML.
async function loadDetailPageCritical(db: Database, session: BlogSession, target: EntityTarget) {
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

// Detail data with the comments promise split out, ready to stream through
// React Router's `defer`-style return + `<Await>` consumer.
export async function loadDetailPageStreaming(db: Database, session: BlogSession, target: EntityTarget) {
  const comments = loadCommentsAndItems(db, session, target)
  const critical = await loadDetailPageCritical(db, session, target)
  return { critical, comments }
}
