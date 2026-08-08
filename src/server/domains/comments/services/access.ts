import type { Database } from '@/server/infra/db/database'
import type { CommentTokenCookie } from '@/shared/utils/comment-token'

import { findCommentWithUserById } from '@/server/domains/comments/services/lookup'
import { verifyCommentOwnership } from '@/server/domains/comments/services/token'
import { idFromString } from '@/shared/utils/id'

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
