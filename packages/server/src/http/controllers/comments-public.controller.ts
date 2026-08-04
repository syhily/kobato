import type { CommentReq } from '@kobato/shared/types/comments'

import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { asCommentItemWire, asCommentItemsWire } from '@kobato/server/domains/comments/projection'
import { commentReplySchema, commentRidSchema } from '@kobato/server/domains/comments/schema'
import { verifyCommentAccess } from '@kobato/server/domains/comments/services/access'
import { findCommentWithUserById } from '@kobato/server/domains/comments/services/lookup'
import { updateComment } from '@kobato/server/domains/comments/services/moderate'
import { createComment } from '@kobato/server/domains/comments/services/mutate'
import { loadComments, parseComments } from '@kobato/server/domains/comments/services/public-query'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { appendCommentToken, issueCommentToken } from '@kobato/server/domains/comments/services/token'
import { commentTokenCookie, frontendKeyAuth, publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { getLogger } from '@kobato/server/infra/logger'
import { tryCommentPostRateLimit, tryCommentPostRateLimitByEmail } from '@kobato/server/infra/rate-limit'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { commentItemDto } from '@kobato/shared/contracts/comments'
import { lexicalCommentBodySchema } from '@kobato/shared/lexical/comment-schema'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@kobato/shared/utils/comment-token'
import { idFromString } from '@kobato/shared/utils/id'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'

const replyComment = publicProc
  .route({ method: 'POST', path: '/content/v1/comments/reply' })
  .input(commentReplySchema)
  .output(z.object({ comment: commentItemDto }))
  .use(frontendKeyAuth)
  .handler(async ({ input, context }) => {
    const { requestFacts, clientAddress, session, responseHeaders } = context
    const isAdmin = context.viewer?.role === 'admin'
    if (!isAdmin) {
      const byIp = await tryCommentPostRateLimit(clientAddress)
      if (byIp.exceeded) {
        throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
      }
      const byEmail = await tryCommentPostRateLimitByEmail(input.email)
      if (byEmail.exceeded) {
        throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
      }
    }
    const commentPayload: CommentReq = {
      page_key: input.page_key,
      name: input.name,
      email: input.email,
      link: input.link,
      body: input.body,
      rid: input.rid,
    }
    const comment = await createComment(context.db, commentPayload, requestFacts, clientAddress, session)
    recordAuditEventFromContext(context, {
      action: 'comment_created',
      resourceType: 'comment',
      resourceId: String(comment.id),
      details: { pageKey: input.page_key, isAdmin, isPending: !isAdmin && comment.isPending === true },
    })
    if (!isAdmin) {
      try {
        const ttl = requireBlogSettingsSection('comments').comments.tokenTtlSeconds
        const token = await issueCommentToken(context.db, comment.id, comment.userId, input.page_key, ttl)
        const existing = parseCommentTokensCookie(requestFacts.cookie)
        const next = appendCommentToken(existing, input.page_key, token, ttl)
        responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(next))
      } catch (err) {
        // Token issuance failed (e.g. database hiccup). The comment is
        // already persisted; failing the whole request would leave the
        // user without any indication their comment was saved.
        getLogger('comments.token').warn('comment token issuance failed', {
          commentId: comment.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return { comment: asCommentItemWire(comment) }
  })

const list = publicProc
  .route({ method: 'GET', path: '/content/v1/comments/list' })
  // `z.coerce.number()` — REST query params arrive as strings; the RPC
  // wire delivers JSON numbers. Both must validate (same pattern as
  // `comments/load-mine`).
  .input(z.object({ page_key: z.string(), offset: z.coerce.number() }))
  .output(z.object({ comments: z.array(commentItemDto), next: z.boolean() }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.page_key)
    const comments = await loadComments(context.db, context.session, target, input.offset)
    if (comments === null) {
      throw new ORPCError('BAD_GATEWAY', { message: '无法连接到评论服务器' })
    }
    const items = await parseComments(comments.comments)
    const next = requireBlogSettingsSection('comments').comments.size + input.offset < comments.roots_count
    return { comments: asCommentItemsWire(items), next }
  })

const getRaw = publicProc
  .route({ method: 'GET', path: '/content/v1/comments/get-raw' })
  .input(commentRidSchema)
  .output(z.object({ body: lexicalCommentBodySchema }))
  .use(frontendKeyAuth)
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    const sessionUser = context.viewer ?? undefined
    const { ok, cleaned } = await verifyCommentAccess(context.db, context.commentTokens.cookie, input.rid, sessionUser)
    if (!ok) {
      throw new ORPCError('FORBIDDEN', { message: '无权查看该评论' })
    }
    context.commentTokens.refreshed = cleaned
    const comment = await findCommentWithUserById(context.db, idFromString(input.rid))
    if (!comment) {
      throw new ORPCError('NOT_FOUND', { message: '评论不存在' })
    }
    return { body: comment.body }
  })

const edit = publicProc
  .route({ method: 'POST', path: '/content/v1/comments/edit' })
  .input(commentRidSchema.extend({ body: lexicalCommentBodySchema }))
  .output(z.object({ comment: commentItemDto }))
  // `frontendKeyAuth` first so the proxy-chain jar merge in
  // `commentTokenCookie` can see the verified `frontendAuth`, and the
  // resource rate limit buckets the visitor IP behind a valid key.
  .use(frontendKeyAuth)
  .use(resourceRateLimit)
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    const sessionUser = context.viewer ?? undefined
    const { ok, cleaned } = await verifyCommentAccess(context.db, context.commentTokens.cookie, input.rid, sessionUser)
    if (!ok) {
      throw new ORPCError('FORBIDDEN', { message: '无权编辑该评论' })
    }
    context.commentTokens.refreshed = cleaned
    const updated = await updateComment(context.db, input.rid, input.body)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: '更新评论失败' })
    }
    recordAuditEventFromContext(context, {
      action: 'comment_updated',
      resourceType: 'comment',
      resourceId: input.rid,
    })
    return { comment: asCommentItemWire(updated) }
  })

export const commentsPublicRouter = {
  replyComment,
  loadComments: list,
  getRaw,
  edit,
}
