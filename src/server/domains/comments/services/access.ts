import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { CommentTokenCookie } from '@/shared/utils/comment-token'

import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { verifyCommentOwnership } from '@/server/domains/comments/services/token'
import { idFromString } from '@/shared/utils/id'

/**
 * Verify whether the caller may access a specific comment.
 *
 * Checks three paths in order:
 * 1. Admin bypass — admins always have access.
 * 2. Token ownership — the caller has a valid comment token.
 * 3. Session ownership — the caller is logged in and their user ID matches the comment's author.
 *
 * Returns the cleaned cookie (for Set-Cookie refresh) and a boolean.
 */
export async function verifyCommentAccess(
  db: NodePgDatabase,
  cookie: CommentTokenCookie,
  commentId: string,
  sessionUser?: { id: string; role: string },
): Promise<{ ok: boolean; cleaned: CommentTokenCookie }> {
  if (sessionUser?.role === 'admin') {
    return { ok: true, cleaned: cookie }
  }

  const { token: ownerToken, cleaned } = await verifyCommentOwnership(cookie, commentId)
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
