import type { CommentReq } from '@kobato/contracts/comments.ts'

import { commentsPublicContract } from '@kobato/api/comments.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { asCommentItemWire, asCommentItemsWire } from '@kobato/server/domains/comments/projection.ts'
import { verifyCommentAccess } from '@kobato/server/domains/comments/services/access.ts'
import {
  parseCommentTokensCookie,
  serializeCommentTokensCookie,
} from '@kobato/server/domains/comments/services/comment-token.ts'
import { findCommentWithUserById } from '@kobato/server/domains/comments/services/lookup.ts'
import { applyOwnCommentEdit } from '@kobato/server/domains/comments/services/moderate.ts'
import { createComment } from '@kobato/server/domains/comments/services/mutate.ts'
import { loadComments, parseComments } from '@kobato/server/domains/comments/services/public-query.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { appendCommentToken, issueCommentToken } from '@kobato/server/domains/comments/services/token-store.ts'
import {
  commentPostRateLimit,
  commentTokenCookie,
  localizedOrpcError,
  implementPublic,
  resourceRateLimit,
} from '@kobato/server/http/orpc-base.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { tryCommentPostRateLimitByEmail } from '@kobato/server/infra/rate-limit.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { idFromString } from '@kobato/utils/id.ts'

const impl = implementPublic(commentsPublicContract)

const replyImpl = impl.use(commentPostRateLimit)

const replyComment = replyImpl.replyComment.handler(async ({ input, context }) => {
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
      getLogger('comments.token').warn('comment token issuance failed', {
        commentId: comment.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { comment: asCommentItemWire(comment) }
})

const list = impl.loadComments.handler(async ({ input, context }) => {
  const target = await resolveMetricTarget(context.db, input.page_key)
  const comments = await loadComments(context.db, context.session, target, input.offset)
  if (comments === null) {
    throw localizedOrpcError(context, 'BAD_GATEWAY', 'comments.error.serverUnavailable')
  }
  const items = await parseComments(comments.comments)
  const next = requireBlogSettingsSection('comments').comments.size + input.offset < comments.roots_count
  return { comments: asCommentItemsWire(items), next }
})

const getRaw = impl.getRaw.use(commentTokenCookie).handler(async ({ input, context }) => {
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

const edit = impl
  .use(resourceRateLimit)
  .edit.use(commentTokenCookie)
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

export const commentsPublicRouter = impl.router({
  replyComment,
  loadComments: list,
  getRaw,
  edit,
})
