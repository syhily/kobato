import type { CommentReq } from '@kobato/shared/types/comments.ts'

import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { asCommentItemWire, asCommentItemsWire } from '@kobato/server/domains/comments/projection.ts'
import { commentReplySchema, commentRidSchema } from '@kobato/server/domains/comments/schema.ts'
import { verifyCommentAccess } from '@kobato/server/domains/comments/services/access.ts'
import { findCommentWithUserById } from '@kobato/server/domains/comments/services/lookup.ts'
import { applyOwnCommentEdit } from '@kobato/server/domains/comments/services/moderate.ts'
import { createComment } from '@kobato/server/domains/comments/services/mutate.ts'
import { loadComments, parseComments } from '@kobato/server/domains/comments/services/public-query.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { appendCommentToken, issueCommentToken } from '@kobato/server/domains/comments/services/token.ts'
import {
  commentTokenCookie,
  commentPostRateLimit,
  localizedOrpcError,
  publicProc,
  resourceRateLimit,
} from '@kobato/server/http/orpc-base.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { tryCommentPostRateLimitByEmail } from '@kobato/server/infra/rate-limit.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { commentItemDto, ownCommentMutationDto } from '@kobato/shared/contracts/comments.ts'
import { commentEditorStateSchema } from '@kobato/shared/lexical/comment-schema.ts'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@kobato/shared/utils/comment-token.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'
import { z } from 'zod'

const replyComment = publicProc
  .route({ method: 'POST', path: '/comments/reply' })
  // Before `.input(...)`: oRPC validates the (potentially multi-megabyte)
  // Lexical body at the input-validation index, so the bucket check must
  // sit in an earlier middleware slot.
  .use(commentPostRateLimit)
  .input(commentReplySchema)
  .output(z.object({ comment: commentItemDto }))
  .handler(async ({ input, context }) => {
    const { requestFacts, clientAddress, session, responseHeaders } = context
    const isAdmin = context.viewer?.role === 'admin'
    if (!isAdmin) {
      const byEmail = await tryCommentPostRateLimitByEmail(input.email)
      if (byEmail.exceeded) {
        throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
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
        // Token issuance failed — the comment is already persisted; don't fail the request.
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
      throw localizedOrpcError(context, 'BAD_GATEWAY', 'comments.error.serverUnavailable')
    }
    const items = await parseComments(comments.comments)
    const next = requireBlogSettingsSection('comments').comments.size + input.offset < comments.roots_count
    return { comments: asCommentItemsWire(items), next }
  })

const getRaw = publicProc
  .route({ method: 'GET', path: '/comments/get-raw' })
  .input(commentRidSchema)
  .output(z.object({ body: commentEditorStateSchema }))
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    const sessionUser = context.viewer ?? undefined
    const { ok, cleaned } = await verifyCommentAccess(context.db, context.commentTokens.cookie, input.rid, sessionUser)
    if (!ok) {
      throw localizedOrpcError(context, 'FORBIDDEN', 'comments.error.viewForbidden')
    }
    context.commentTokens.refreshed = cleaned
    const comment = await findCommentWithUserById(context.db, idFromString(input.rid))
    if (!comment) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'comments.error.notFound')
    }
    return { body: comment.body }
  })

// Owner-authorized edit (comment token or session ownership). Runs the SAME
// own-edit policy as `/comments/update-own`: in-grace edits rewrite in place,
// out-of-grace edits re-enter the moderation queue, and the delete-request +
// approved-replies fences apply. Moderator edits live on `/comment-admin/edit`.
const edit = publicProc
  .route({ method: 'POST', path: '/comments/edit' })
  // Limiter before `.input(...)` — oRPC validates the body at the
  // input-validation index, which precedes later middlewares.
  .use(resourceRateLimit)
  .input(commentRidSchema.extend({ body: commentEditorStateSchema }))
  .output(ownCommentMutationDto)
  .use(commentTokenCookie)
  .handler(async ({ input, context }) => {
    const sessionUser = context.viewer ?? undefined
    const { ok, cleaned } = await verifyCommentAccess(context.db, context.commentTokens.cookie, input.rid, sessionUser)
    if (!ok) {
      throw localizedOrpcError(context, 'FORBIDDEN', 'comments.error.editForbidden')
    }
    context.commentTokens.refreshed = cleaned
    const updated = await applyOwnCommentEdit(context.db, input.rid, input.body)
    recordAuditEventFromContext(context, {
      action: 'comment_own_updated',
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
