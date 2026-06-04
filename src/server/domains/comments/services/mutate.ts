import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { MetricTarget } from '@/server/domains/comments/services/shared'
import type { CommentAndUser, CommentReq } from '@/server/domains/comments/types'
import type { NewComment } from '@/server/infra/db/types'

import { userSession } from '@/server/domains/auth/primitives'
import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import { clearLatestCommentsCache } from '@/server/domains/comments/cache'
import { insertComment } from '@/server/domains/comments/repos/mutate'
import {
  countApprovedCommentsByUser,
  findCommentWithSourceUser,
  recentCommentsForUserDedupe,
} from '@/server/domains/comments/repos/public-query/by-id'
import { findCommentRootId } from '@/server/domains/comments/repos/public-query/threads'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { sendNewComment, sendNewReply } from '@/server/domains/comments/services/email'
import { safeResolveMetricTarget } from '@/server/domains/comments/services/shared'
import { hasRegisteredAccount, insertCommentUser, updateLastLogin } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('comments.loader')

// --- Step 1: Validate -------------------------------------------------------

interface ValidatedSubmission {
  target: MetricTarget
  user: NonNullable<Awaited<ReturnType<typeof insertCommentUser>>>
  canonicalBody: NewComment['body']
  markdownSnapshot: string
  rootId: bigint
}

async function validateSubmission(
  db: NodePgDatabase,
  commentReq: CommentReq,
  req: Request,
  clientAddress: string,
  session: BlogSession,
): Promise<ValidatedSubmission> {
  const target = await safeResolveMetricTarget(db, commentReq.page_key)
  if (target === null) {
    throw new DomainError('NOT_FOUND', '系统错误，评论的目标页面不存在。')
  }

  const loginUser = userSession(session)
  if (loginUser === undefined && (await hasRegisteredAccount(db, commentReq.email))) {
    throw new DomainError('UNAUTHORIZED', '该邮箱已经注册，请登录后再进行评论留言。')
  }

  const u = await insertCommentUser(db, commentReq.name, commentReq.email, commentReq.link || '')
  if (u === null) {
    throw new DomainError('INTERNAL', '系统错误，用户创建失败。')
  }

  if (u.role === 'admin') {
    if (loginUser === undefined) {
      throw new DomainError('UNAUTHORIZED', '管理员账号需要登陆才能评论。')
    }
  } else if (loginUser !== undefined && loginUser.email !== u.email) {
    throw new DomainError('FORBIDDEN', '评论邮箱与登陆账号不相符。')
  }

  if (u.isMuted) {
    throw new DomainError('FORBIDDEN', '您的评论功能已被管理员禁用，如有疑问请联系站长。')
  }

  const { body: canonicalBody, content: markdownSnapshot } = await canonicalizeCommentBody(commentReq.body)

  const MAX_COMMENT_LENGTH = 10_000
  if (markdownSnapshot.length > MAX_COMMENT_LENGTH) {
    throw new DomainError('BAD_REQUEST', `评论内容过长，最多 ${MAX_COMMENT_LENGTH} 个字符。`)
  }

  if (u.role !== 'admin') {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recent = await recentCommentsForUserDedupe(db, u.id, since, 20)
    if (recent.some((c) => c.content === markdownSnapshot)) {
      throw new DomainError('CONFLICT', '重复评论，你已经有了相同的留言，如果在页面看不到，说明它正在等待站长审核。')
    }
  }

  await updateLastLogin(db, u.id, clientAddress, req.headers.get('User-Agent'))

  let rootId = 0n
  if (commentReq.rid !== undefined && commentReq.rid !== 0) {
    const ridBig = idFromString(commentReq.rid)
    const parentRoot = await findCommentRootId(db, ridBig)
    rootId = parentRoot !== null && parentRoot !== 0n ? parentRoot : ridBig
  }

  return { target, user: u, canonicalBody, markdownSnapshot, rootId }
}

// --- Step 2: Persist --------------------------------------------------------

async function persistComment(
  db: NodePgDatabase,
  commentReq: CommentReq,
  sub: ValidatedSubmission,
  ua: string | null,
  ip: string,
): Promise<CommentAndUser> {
  // Transactional with advisory lock: two concurrent comment creations
  // from the same user cannot both read count=0 and bypass moderation.
  // The lock key is a 64-bit hash of the string 'comment_approval:<userId>'.
  const lockKey = `comment_approval:${sub.user.id}`
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

    const approvedCount = await countApprovedCommentsByUser(tx, sub.user.id)
    const isPending = approvedCount === 0

    const newComment: NewComment = {
      content: sub.markdownSnapshot,
      body: sub.canonicalBody,
      type: sub.target.type,
      ownerId: sub.target.ownerId,
      userId: sub.user.id,
      isVerified: sub.user.emailVerified,
      ua,
      ip,
      rid: commentReq.rid || 0,
      isCollapsed: false,
      isPending,
      isPinned: false,
      voteUp: 0,
      voteDown: 0,
      rootId: sub.rootId,
    }
    const cr = await insertComment(tx, newComment)
    if (cr === null) {
      throw new DomainError('INTERNAL', '系统错误，评论创建失败。')
    }

    const { createdAt, deletedAt, ...commentRest } = cr
    return withCommentBadgeTextColor({
      ...commentRest,
      createAt: createdAt,
      deleteAt: deletedAt,
      name: sub.user.name,
      email: sub.user.email,
      emailVerified: sub.user.emailVerified,
      link: sub.user.link,
      badgeName: sub.user.badgeName,
      badgeColor: sub.user.badgeColor,
      badgeTextColor: sub.user.badgeTextColor,
    })
  })
}

// --- Step 3: Notify ---------------------------------------------------------

async function notifyCommentCreated(db: NodePgDatabase, info: CommentAndUser, target: MetricTarget): Promise<void> {
  if (info.email !== requireBlogSettingsSection('siteIdentity').author.email) {
    void sendNewComment(db, info, target).catch((error) => {
      log.error('failed to send new comment email', { error })
    })
  }
  if (info.rid !== 0) {
    const source = await findCommentWithSourceUser(db, idFromString(info.rid))
    if (source) {
      void sendNewReply(db, source.user, source.comment, info, target).catch((error) => {
        log.error('failed to send new reply email', { error })
      })
    }
  }
}

// --- Public entry point -----------------------------------------------------

export async function createComment(
  db: NodePgDatabase,
  commentReq: CommentReq,
  req: Request,
  clientAddress: string,
  session: BlogSession,
): Promise<CommentAndUser> {
  const sub = await validateSubmission(db, commentReq, req, clientAddress, session)
  const info = await persistComment(db, commentReq, sub, req.headers.get('User-Agent'), clientAddress)
  await notifyCommentCreated(db, info, sub.target)
  await clearLatestCommentsCache()
  return info
}
