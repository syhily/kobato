import type { CommentTokenCookie } from '@kobato/shared/utils/comment-token.ts'

import { idFromString } from '@kobato/shared/utils/id.ts'

import type { Database } from '../../../infra/db/database'

import { findCommentWithUserById } from './lookup'
import { verifyCommentOwnership } from './token'

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
