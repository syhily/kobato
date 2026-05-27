import { z } from 'zod'

import { asCommentItemsWire } from '@/server/domains/comments/projection'
import { findCommentsByIds } from '@/server/domains/comments/repos/public-query'
import { parseComments } from '@/server/domains/comments/services/public-query'
import { cleanupExpiredTokens, revokeCommentToken } from '@/server/domains/comments/token'
import { publicProc } from '@/server/http/orpc-base'
import { commentItemDto } from '@/shared/contracts/comments'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@/shared/utils/comment-token'
import { idFromString } from '@/shared/utils/id'

const successOutput = z.object({ success: z.boolean() })

const revokeToken = publicProc
  .route({ method: 'POST', path: '/comments/revoke-token' })
  .input(z.object({ rid: z.string() }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const cookie = parseCommentTokensCookie(context.request.headers.get('Cookie'))
    const { cleaned, validEntries } = await cleanupExpiredTokens(cookie)
    let targetToken: string | null = null
    for (const entry of validEntries) {
      if (entry.payload.commentId === input.rid) {
        targetToken = entry.token
        break
      }
    }
    if (targetToken) {
      await revokeCommentToken(targetToken)
    }
    const next: typeof cleaned = {}
    for (const [pageKey, entries] of Object.entries(cleaned)) {
      const filtered = entries.filter((e) => e.token !== targetToken)
      if (filtered.length > 0) {
        next[pageKey] = filtered
      }
    }
    context.responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(next))
    return { success: true }
  })

const myComments = publicProc
  .route({ method: 'GET', path: '/comments/my-comments' })
  .input(z.object({ page_key: z.string() }))
  .output(z.object({ comments: z.array(commentItemDto), expiresAt: z.record(z.string(), z.number()) }))
  .handler(async ({ input, context }) => {
    const cookie = parseCommentTokensCookie(context.request.headers.get('Cookie'))
    const { cleaned, validEntries } = await cleanupExpiredTokens(cookie)
    const commentIds: bigint[] = []
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
    context.responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
    return { comments: asCommentItemsWire(items), expiresAt }
  })

export const commentsTokenRouter = {
  revokeToken,
  myComments,
}
