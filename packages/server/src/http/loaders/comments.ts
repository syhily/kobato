import type { CommentFormUser } from '@kobato/catalog/model.ts'
import type { DetailPageComments } from '@kobato/contracts/comments.ts'
import type { Database } from '@kobato/db/database.ts'
import type { EntityTarget } from '@kobato/db/target.ts'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { userSession } from '@kobato/server/domains/auth/primitives.ts'
import { asCommentItemsWire } from '@kobato/server/domains/comments/projection.ts'
import { queryLikes } from '@kobato/server/domains/comments/services/likes.ts'
import {
  commentThreadFingerprint,
  loadComments,
  parseComments,
} from '@kobato/server/domains/comments/services/public-query.ts'
import { ensureCommentPage } from '@kobato/server/domains/comments/services/shared.ts'
import { loadSidebarData } from '@kobato/server/http/loaders/sidebar.ts'

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

export async function loadCommentsAndItems(
  db: Database,
  session: BlogSession,
  target: EntityTarget,
): Promise<DetailPageComments> {
  const commentData = await loadComments(db, session, target, 0, { ensurePage: false })
  const commentItems = commentData && commentData.comments.length > 0 ? await parseComments(commentData.comments) : []
  return { commentData, commentItems: asCommentItemsWire(commentItems) }
}

export async function loadDetailPageCritical(
  db: Database,
  session: BlogSession,
  target: EntityTarget,
  settings: BlogSettingsBundle | null,
) {
  const user = userSession(session)
  const currentUser = toCommentFormUser(user)

  const [metricRow, likes, sidebar, commentsFingerprint] = await Promise.all([
    ensureCommentPage(db, target),
    queryLikes(db, target),
    loadSidebarData(db, session, settings),
    commentThreadFingerprint(db, target),
  ])

  return {
    commentKey: metricRow.publicId,
    likes,
    currentUser,
    commentsFingerprint,
    ...sidebar,
  }
}
