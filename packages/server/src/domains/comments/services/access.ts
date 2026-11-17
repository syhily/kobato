import type { Database } from '@kobato/db/database.ts'
import type { CommentTokenCookie } from '@kobato/server/domains/comments/services/comment-token.ts'

import { findCommentWithUserById } from '@kobato/server/domains/comments/services/lookup.ts'
import { verifyCommentOwnership } from '@kobato/server/domains/comments/services/token.ts'
import { idFromString } from '@kobato/utils/id.ts'

/** Access in precedence order: admin bypass, comment-token ownership, then
 *  session ownership. Also returns the cookie with dead entries dropped. */
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
