import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { EntityTarget } from '@/server/infra/db/target'
import type { CommentFormUser } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'

import { bumpPageView } from '@/server/domains/analytics/repos/pv-batcher'
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

export type { DetailPageComments } from '@/shared/types/comments'

// Comments split out so the loader can stream them via React Router's
// `<Await>` while the rest of the detail (likes, sidebar, post body)
// renders immediately. PT bodies are stored pre-rendered, so the
// per-row work in `parseComments` is now just projection — but the
// network/DB round-trip is still worth deferring.
async function loadCommentsAndItems(
  db: NodePgDatabase,
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
export async function loadDetailPageCritical(
  db: NodePgDatabase,
  session: BlogSession,
  target: EntityTarget,
  options?: { trackView?: boolean },
) {
  const user = userSession(session)
  const currentUser = toCommentFormUser(user)
  const admin = user?.role === 'admin'
  const trackView = options?.trackView ?? true

  // Keep counting out of the critical path; this is fire-and-forget and
  // callers can disable it for non-navigation requests (e.g. prefetch).
  if (!admin && trackView) {
    bumpPageView(target)
  }

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
export async function loadDetailPageStreaming(
  db: NodePgDatabase,
  session: BlogSession,
  target: EntityTarget,
  options?: { trackView?: boolean },
) {
  const critical = await loadDetailPageCritical(db, session, target, options)
  const comments = loadCommentsAndItems(db, session, target)
  return { critical, comments }
}

// Backwards-compatible eager loader. Kept exported because
// `tests/service.comments-page-data.test.ts` exercises the parallel-fanout
// contract directly and the admin-comments listing path still wants the
// fully-resolved shape.
export async function loadDetailPageData(
  db: NodePgDatabase,
  session: BlogSession,
  target: EntityTarget,
  options?: { trackView?: boolean },
) {
  const commentsPromise = loadCommentsAndItems(db, session, target)
  const critical = await loadDetailPageCritical(db, session, target, options)
  const comments = await commentsPromise
  return {
    ...critical,
    commentData: comments.commentData,
    commentItems: comments.commentItems,
  }
}
