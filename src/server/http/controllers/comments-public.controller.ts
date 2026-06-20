import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { CommentReq } from '@/shared/types/comments'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { userSession } from '@/server/domains/auth/primitives'
import { asCommentItemWire, asCommentItemsWire } from '@/server/domains/comments/projection'
import { commentReplySchema, commentRidSchema } from '@/server/domains/comments/schema'
import { verifyCommentAccess } from '@/server/domains/comments/services/access'
import { getCommentById, updateComment } from '@/server/domains/comments/services/moderate'
import { createComment } from '@/server/domains/comments/services/mutate'
import { loadComments, parseComments } from '@/server/domains/comments/services/public-query'
import { resolveMetricTarget } from '@/server/domains/comments/services/shared'
import { appendCommentToken, issueCommentToken } from '@/server/domains/comments/services/token'
import { readCommentBody } from '@/server/domains/content/projection-helpers'
import { publicProc } from '@/server/http/orpc-base'
import { getLogger } from '@/server/infra/logger'
import {
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryResourceRateLimit,
} from '@/server/infra/rate-limit'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { commentItemDto } from '@/shared/contracts/comments'
import { inklingDocumentSchema } from '@/shared/inkling/schema'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@/shared/utils/comment-token'

const replyComment = publicProc
  .route({ method: 'POST', path: '/comments/reply' })
  .input(commentReplySchema)
  .output(z.object({ comment: commentItemDto }))
  .handler(async ({ input, context }) => {
    const { request, clientAddress, session, responseHeaders } = context
    const isAdmin = userSession(session)?.role === 'admin'
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
    const comment = await createComment(context.db, commentPayload, request, clientAddress, session)
    recordAuditEventFromContext(context, {
      action: 'comment_created',
      resourceType: 'comment',
      resourceId: String(comment.id),
      details: { pageKey: input.page_key, isAdmin, isPending: !isAdmin && comment.isPending === true },
    })
    if (!isAdmin) {
      try {
        const ttl = requireBlogSettingsSection('comments').comments.tokenTtlSeconds
        const token = await issueCommentToken(comment.id, comment.userId, input.page_key, ttl)
        const existing = parseCommentTokensCookie(request.headers.get('Cookie'))
        const next = appendCommentToken(existing, input.page_key, token, ttl)
        responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(next))
      } catch (err) {
        // Token issuance failed (e.g. Redis down). The comment is already
        // persisted; failing the whole request would leave the user
        // without any indication their comment was saved.
        getLogger('comments.token').warn('comment token issuance failed', {
          commentId: comment.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return { comment: asCommentItemWire(comment) }
  })

const list = publicProc
  .route({ method: 'GET', path: '/comments/list' })
  .input(z.object({ page_key: z.string(), offset: z.number() }))
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
  .route({ method: 'GET', path: '/comments/get-raw' })
  .input(commentRidSchema)
  .output(z.object({ body: inklingDocumentSchema }))
  .handler(async ({ input, context }) => {
    const { request, session, responseHeaders } = context
    const sessionUser = userSession(session)
    const cookie = parseCommentTokensCookie(request.headers.get('Cookie'))
    const { ok, cleaned } = await verifyCommentAccess(context.db, cookie, input.rid, sessionUser)
    if (!ok) {
      throw new ORPCError('FORBIDDEN', { message: '无权查看该评论' })
    }
    responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
    const comment = await getCommentById(context.db, input.rid)
    if (!comment) {
      throw new ORPCError('NOT_FOUND', { message: '评论不存在' })
    }
    // `comment.body` is raw JSONB; route it through `readCommentBody` so a
    // legacy PT-shape row (pre-inkling migration) falls back to an empty
    // document instead of failing the output-schema parse and 500ing.
    return { body: readCommentBody(comment.body) }
  })

const edit = publicProc
  .route({ method: 'POST', path: '/comments/edit' })
  .input(commentRidSchema.extend({ body: inklingDocumentSchema }))
  .output(z.object({ comment: commentItemDto }))
  .handler(async ({ input, context }) => {
    const { request, session, responseHeaders, clientAddress } = context
    const rateLimit = await tryResourceRateLimit(clientAddress)
    if (rateLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
    }
    const sessionUser = userSession(session)
    const cookie = parseCommentTokensCookie(request.headers.get('Cookie'))
    const { ok, cleaned } = await verifyCommentAccess(context.db, cookie, input.rid, sessionUser)
    if (!ok) {
      throw new ORPCError('FORBIDDEN', { message: '无权编辑该评论' })
    }
    responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
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
