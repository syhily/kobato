import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { CommentReq } from '@/shared/types/comments'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { userSession } from '@/server/domains/auth/primitives'
import { isCommentOwner } from '@/server/domains/auth/rbac'
import { decreaseLikes, increaseLikes, queryLikes, validateLikeToken } from '@/server/domains/comments/likes'
import {
  createComment,
  loadComments,
  parseComments,
  resolveMetricTarget,
  safeResolveMetricTarget,
} from '@/server/domains/comments/loader'
import { getCommentById, updateComment, updateOwnComment } from '@/server/domains/comments/moderation'
import { asCommentItemWire, asCommentItemsWire } from '@/server/domains/comments/projection'
import {
  clearDeleteRequest,
  countApprovedRepliesOfComment,
  countMyComments,
  findCommentWithUserById,
  findCommentsByIds,
  listMyComments,
  requestDeleteComment,
} from '@/server/domains/comments/repo'
import {
  appendCommentToken,
  cleanupExpiredTokens,
  issueCommentToken,
  revokeCommentToken,
  verifyCommentOwnership,
} from '@/server/domains/comments/token'
import { authedProc, publicProc } from '@/server/http/orpc-base'
import { findUserIdByEmail } from '@/server/infra/db/operations/user'
import {
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryLikeIncreaseRateLimit,
} from '@/server/infra/rate-limit'
import { AvatarStatus, cacheAvatar } from '@/server/render/avatar/cache'
import { fetchQQAvatarImage, isQQEmail } from '@/server/render/avatar/fetch'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { commentItemDto } from '@/shared/contracts/comments'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@/shared/utils/comment-token'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'
import { encodedEmail } from '@/shared/utils/security'
import { joinUrl } from '@/shared/utils/urls'

const COMMENT_HONEYPOT_MAX_LEN = 240

const successOutput = z.object({ success: z.boolean() })

// Likes

const increaseLike = publicProc
  .route({ method: 'POST', path: '/comments/increase-like' })
  .input(z.object({ key: z.string() }))
  .output(
    z.object({
      key: z.string(),
      likes: z.number().int().nonnegative(),
      token: z.string().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const limit = await tryLikeIncreaseRateLimit(context.clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '点赞过于频繁，请稍后再试。' })
    }
    const target = await resolveMetricTarget(input.key)
    return { ...(await increaseLikes(target)), key: input.key }
  })

const decreaseLike = publicProc
  .route({ method: 'POST', path: '/comments/decrease-like' })
  .input(z.object({ key: z.string(), token: z.string() }))
  .output(z.object({ key: z.string(), likes: z.number().int().nonnegative() }))
  .handler(async ({ input }) => {
    const target = await resolveMetricTarget(input.key)
    await decreaseLikes(target, input.token)
    return { key: input.key, likes: await queryLikes(target) }
  })

const validateLike = publicProc
  .route({ method: 'GET', path: '/comments/validate-like' })
  .input(z.object({ key: z.string(), token: z.string() }))
  .output(z.object({ key: z.string(), valid: z.boolean() }))
  .handler(async ({ input }) => {
    const target = await safeResolveMetricTarget(input.key)
    if (target === null) {
      return { key: input.key, valid: false }
    }
    return { key: input.key, valid: await validateLikeToken(target, input.token) }
  })

// Avatar

const findAvatar = publicProc
  .route({ method: 'GET', path: '/comments/find-avatar' })
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .handler(async ({ input }) => {
    const id = await findUserIdByEmail(input.email)
    const hash = id === null ? await encodedEmail(input.email) : id
    if (isQQEmail(input.email)) {
      const canonicalHash = await encodedEmail(input.email)
      const buffer = await fetchQQAvatarImage(input.email)
      if (buffer !== null) {
        await cacheAvatar({ email: canonicalHash, status: AvatarStatus.HAVE_AVATAR, buffer })
      } else {
        await cacheAvatar({ email: canonicalHash, status: AvatarStatus.NO_AVATAR })
      }
    }
    return {
      avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, 'images/avatar', `${hash}.png`),
    }
  })

// Replies / listing / getRaw / edit (anonymous-friendly with token gating)

const replyInput = z
  .object({
    page_key: z.string(),
    name: z.string(),
    email: z.email(),
    link: httpUrlOrEmptyStringSchema.optional(),
    body: commentBodySchema,
    rid: z.number().optional(),
    subtitle: z.string().max(COMMENT_HONEYPOT_MAX_LEN).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.subtitle.trim().length > 0) {
      ctx.addIssue({ code: 'custom', message: '输入数据无效。', path: ['subtitle'] })
    }
  })

const replyComment = publicProc
  .route({ method: 'POST', path: '/comments/reply' })
  .input(replyInput)
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
    const comment = await createComment(commentPayload, request, clientAddress, session)
    recordAuditEventFromContext(context, {
      action: 'comment_created',
      resourceType: 'comment',
      resourceId: String(comment.id),
      details: { pageKey: input.page_key, isAdmin, isPending: !isAdmin && comment.isPending === true },
    })
    if (!isAdmin) {
      const ttl = requireBlogSettingsSection('comments').comments.tokenTtlSeconds
      const token = await issueCommentToken(comment.id, comment.userId, input.page_key, ttl)
      const existing = parseCommentTokensCookie(request.headers.get('Cookie'))
      const next = appendCommentToken(existing, input.page_key, token, ttl)
      responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(next))
    }
    return { comment: asCommentItemWire(comment) }
  })

const list = publicProc
  .route({ method: 'GET', path: '/comments/list' })
  .input(z.object({ page_key: z.string(), offset: z.number() }))
  .output(z.object({ comments: z.array(commentItemDto), next: z.boolean() }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(input.page_key)
    const comments = await loadComments(context.session, target, input.offset)
    if (comments === null) {
      throw new ORPCError('BAD_GATEWAY', { message: '无法连接到评论服务器' })
    }
    const items = await parseComments(comments.comments)
    const next = requireBlogSettingsSection('comments').comments.size + input.offset < comments.roots_count
    return { comments: asCommentItemsWire(items), next }
  })

const getRaw = publicProc
  .route({ method: 'GET', path: '/comments/get-raw' })
  .input(z.object({ rid: z.string() }))
  .output(z.object({ body: commentBodySchema }))
  .handler(async ({ input, context }) => {
    const { request, session, responseHeaders } = context
    const admin = userSession(session)?.role === 'admin'
    if (!admin) {
      const cookie = parseCommentTokensCookie(request.headers.get('Cookie'))
      const { ok, cleaned } = await verifyCommentOwnership(cookie, input.rid)
      if (!ok) {
        throw new ORPCError('FORBIDDEN', { message: '无权查看该评论' })
      }
      responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
    }
    const comment = await getCommentById(input.rid)
    if (!comment) {
      throw new ORPCError('NOT_FOUND', { message: '评论不存在' })
    }
    return { body: comment.body }
  })

const edit = publicProc
  .route({ method: 'POST', path: '/comments/edit' })
  .input(z.object({ rid: z.string(), body: commentBodySchema }))
  .output(z.object({ comment: commentItemDto }))
  .handler(async ({ input, context }) => {
    const { request, session, responseHeaders } = context
    const sessionUser = userSession(session)
    const isAdmin = sessionUser?.role === 'admin'
    if (!isAdmin) {
      const cookie = parseCommentTokensCookie(request.headers.get('Cookie'))
      const { ok: ownerByToken, cleaned } = await verifyCommentOwnership(cookie, input.rid)
      if (ownerByToken) {
        responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
      } else {
        const commentId = BigInt(input.rid)
        const row = await findCommentWithUserById(commentId)
        const ownerBySession = sessionUser !== undefined && row !== null && row.userId.toString() === sessionUser.id
        if (!ownerBySession) {
          throw new ORPCError('FORBIDDEN', { message: '无权编辑该评论' })
        }
      }
    }
    const updated = await updateComment(input.rid, input.body)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: '更新评论失败' })
    }
    return { comment: asCommentItemWire(updated) }
  })

// Self (logged-in user managing their own comments)

const updateOwn = authedProc
  .route({ method: 'POST', path: '/comments/update-own' })
  .input(z.object({ commentId: z.string(), body: commentBodySchema }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = BigInt(input.commentId ?? '0')
    if (commentId === 0n) {
      throw new ORPCError('BAD_REQUEST', { message: '缺少 commentId' })
    }
    const c = await findCommentWithUserById(commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    if (c.deleteRequestedAt !== null) {
      throw new ORPCError('CONFLICT', { message: '已申请删除，无法编辑。' })
    }
    const replyCount = await countApprovedRepliesOfComment(commentId)
    if (replyCount > 0) {
      throw new ORPCError('CONFLICT', { message: '已有回复，无法再编辑。' })
    }
    await updateOwnComment(String(commentId), input.body)
    return { success: true }
  })

const requestDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/request-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = BigInt(input.commentId)
    const c = await findCommentWithUserById(commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    if (c.deleteRequestedAt !== null) {
      return { success: true }
    }
    await requestDeleteComment(commentId, BigInt(context.viewer.userId))
    return { success: true }
  })

const cancelDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/cancel-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = BigInt(input.commentId)
    const c = await findCommentWithUserById(commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    const ok = await clearDeleteRequest(commentId, BigInt(context.viewer.userId))
    if (!ok) {
      throw new ORPCError('CONFLICT', { message: '无法撤回删除申请。' })
    }
    return { success: true }
  })

const listMine = authedProc
  .route({ method: 'GET', path: '/comments/list-mine' })
  .input(
    z.object({ offset: z.coerce.number().min(0).default(0), limit: z.coerce.number().min(1).max(100).default(20) }),
  )
  .output(
    z.object({
      comments: z.array(commentItemDto),
      total: z.number().int(),
      pending: z.number().int(),
      deleteRequested: z.number().int(),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = BigInt(context.viewer.userId)
    const offset = input.offset
    const limit = Math.min(input.limit, 100)
    const [comments, counts] = await Promise.all([listMyComments(userId, offset, limit), countMyComments(userId)])
    return {
      comments: asCommentItemsWire(comments),
      total: counts.total,
      pending: counts.pending,
      deleteRequested: counts.deleteRequested,
      hasMore: offset + comments.length < counts.total,
    }
  })

// Anonymous token revocation / cookie-scoped queries

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
        commentIds.push(BigInt(entry.payload.commentId))
      }
    }
    const comments = await findCommentsByIds(commentIds)
    const items = await parseComments(comments)
    const expiresAt: Record<string, number> = {}
    for (const entry of validEntries) {
      expiresAt[entry.payload.commentId] = entry.expiresAt
    }
    context.responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(cleaned))
    return { comments: asCommentItemsWire(items), expiresAt }
  })

export const commentsRouter = {
  // likes
  increaseLike,
  decreaseLike,
  validateLikeToken: validateLike,
  // avatar
  findAvatar,
  // public comment replies / listing / edit
  replyComment,
  loadComments: list,
  getRaw,
  edit,
  // logged-in self management
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
  listMine,
  // anonymous token operations
  revokeToken,
  myComments,
}
