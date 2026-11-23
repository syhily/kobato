import type { Database } from '@kobato/db/sqlite/database'
import type { CommentTokenCookie } from '@kobato/server/domains/comments/services/comment-token'

import { findCommentWithUserById } from '@kobato/db/sqlite/operations/engagement/comment'
import { verifyCommentOwnership } from '@kobato/server/domains/comments/services/token-store'
import { idFromString } from '@kobato/utils/id'

export async function verifyCommentAccess(
  db: Database,
  cookie: CommentTokenCookie,
  commentId: string,
  sessionUser?: { id: string; role: string },
): Promise<{ ok: boolean; cleaned: CommentTokenCookie }> {
  if (sessionUser?.role === 'admin') {
    return { ok: true, cleaned: cookie }
  }

  const { token: ownerToken, cleaned } = await verifyCommentOwnership(db, cookie, commentId)
  if (ownerToken !== null) {
    return { ok: true, cleaned }
  }

  if (sessionUser) {
    const row = await findCommentWithUserById(db, idFromString(commentId))
    if (row !== null && row.userId.toString() === sessionUser.id) {
      return { ok: true, cleaned }
    }
  }

  return { ok: false, cleaned }
}
