import { asCommentItemsWire } from '@kobato/server/domains/comments/projection'
import { findCommentsByIds } from '@kobato/server/domains/comments/services/lookup'
import { parseComments } from '@kobato/server/domains/comments/services/public-query'
import {
  cleanupExpiredTokens,
  revokeCommentToken,
  verifyCommentOwnership,
} from '@kobato/server/domains/comments/services/token'
import { commentTokenCookie, frontendKeyAuth, publicProc } from '@kobato/server/http/orpc-base'
import { commentItemDto } from '@kobato/shared/contracts/comments'
import { idFromString } from '@kobato/shared/utils/id'
import { z } from 'zod'

const successOutput = z.object({ success: z.boolean() })

const revokeToken = publicProc
  .route({ method: 'POST', path: '/comments/revoke-token' })
  .input(z.object({ rid: z.string() }))
  .output(successOutput)
  .use(frontendKeyAuth)
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    // `verifyCommentOwnership` runs the same cleanup + token-match loop;
    // the matched token is the one to revoke.
    const { cleaned, token: targetToken } = await verifyCommentOwnership(
      context.db,
      context.commentTokens.cookie,
      input.rid,
    )
    if (targetToken !== null) {
      await revokeCommentToken(context.db, targetToken)
    }
    const next: typeof cleaned = {}
    for (const [pageKey, entries] of Object.entries(cleaned)) {
      const filtered = entries.filter((e) => e.token !== targetToken)
      if (filtered.length > 0) {
        next[pageKey] = filtered
      }
    }
    context.commentTokens.refreshed = next
    return { success: true }
  })

const myComments = publicProc
  .route({ method: 'GET', path: '/comments/my-comments' })
  .input(z.object({ page_key: z.string() }))
  .output(z.object({ comments: z.array(commentItemDto), expiresAt: z.record(z.string(), z.number()) }))
  .use(frontendKeyAuth)
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    const { cleaned, validEntries } = await cleanupExpiredTokens(context.db, context.commentTokens.cookie)
    const commentIds: number[] = []
    for (const entry of validEntries) {
      if (entry.payload.pageKey === input.page_key) {
        commentIds.push(idFromString(entry.payload.commentId))
      }
    }
    const comments = await findCommentsByIds(context.db, commentIds)
    const items = await parseComments(comments)
    const expiresAt: Record<string, number> = {}
    for (const entry of validEntries) {
      expiresAt[entry.payload.commentId] = entry.expiresAt
    }
    context.commentTokens.refreshed = cleaned
    return { comments: asCommentItemsWire(items), expiresAt }
  })

export const commentsTokenRouter = {
  revokeToken,
  myComments,
}
