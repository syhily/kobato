import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { MetricTarget } from '@/server/domains/comments/services/shared'
import type { CommentAndUser, CommentReq } from '@/server/domains/comments/types'
import type { NewComment } from '@/server/infra/db/types'
import type { RequestFacts } from '@/server/infra/http/request-facts'

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
import {
  DEDUPE_SAMPLE_LIMIT,
  DEDUPE_WINDOW_MS,
  decideCommenterGate,
  decideContentGate,
  decideEmailGate,
} from '@/server/domains/comments/services/policy'
import { safeResolveMetricTarget } from '@/server/domains/comments/services/shared'
import { hasRegisteredAccount, insertCommentUser, updateLastLogin } from '@/server/infra/db/operations/user'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('comments.loader')

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

// --- Step 1: Validate -------------------------------------------------------

interface ValidatedSubmission {
  target: MetricTarget
  user: NonNullable<Awaited<ReturnType<typeof insertCommentUser>>>
  canonicalBody: NewComment['body']
  markdownSnapshot: string
  contentHash: string
  rootId: bigint
}

async function validateSubmission(
  db: NodePgDatabase,
  commentReq: CommentReq,
  facts: RequestFacts,
  clientAddress: string,
  session: BlogSession,
): Promise<ValidatedSubmission> {
  const target = await safeResolveMetricTarget(db, commentReq.page_key)
  if (target === null) {
    throw new DomainError('NOT_FOUND', '系统错误，评论的目标页面不存在。')
  }

  // The registered-account fence only applies to anonymous submissions,
  // so the lookup stays lazy for logged-in commenters. It must be
  // evaluated before `insertCommentUser` writes anything.
  const loginUser = userSession(session)
  const emailRegistered = loginUser === undefined ? await hasRegisteredAccount(db, commentReq.email) : false
  const emailFailure = decideEmailGate(loginUser, emailRegistered)
  if (emailFailure) {
    throw new DomainError(emailFailure.code, emailFailure.message)
  }

  const u = await insertCommentUser(db, commentReq.name, commentReq.email, commentReq.link || '')
  if (u === null) {
    throw new DomainError('INTERNAL', '系统错误，用户创建失败。')
  }

  const commenterFailure = decideCommenterGate(loginUser, u)
  if (commenterFailure) {
    throw new DomainError(commenterFailure.code, commenterFailure.message)
  }

  const { body: canonicalBody, content: markdownSnapshot } = await canonicalizeCommentBody(commentReq.body)
  const contentHash = hashContent(markdownSnapshot)

  // Admins skip the dedupe window — don't even run the SELECT for them.
  // Null hashes can never equal the submitted hash; drop them at the
  // boundary so the decider works on plain strings.
  const recentRows =
    u.role === 'admin'
      ? []
      : await recentCommentsForUserDedupe(db, u.id, new Date(Date.now() - DEDUPE_WINDOW_MS), DEDUPE_SAMPLE_LIMIT)
  const recentContentHashes = recentRows.map((c) => c.contentHash).filter((h): h is string => h !== null)
  const contentFailure = decideContentGate({
    role: u.role,
    contentLength: markdownSnapshot.length,
    contentHash,
    recentContentHashes,
  })
  if (contentFailure) {
    throw new DomainError(contentFailure.code, contentFailure.message)
  }

  await updateLastLogin(db, u.id, clientAddress, facts.userAgent)

  let rootId = 0n
  if (commentReq.rid !== undefined && commentReq.rid !== 0) {
    const ridBig = idFromString(commentReq.rid)
    const parentRoot = await findCommentRootId(db, ridBig)
    rootId = parentRoot !== null && parentRoot !== 0n ? parentRoot : ridBig
  }

  return { target, user: u, canonicalBody, markdownSnapshot, contentHash, rootId }
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
  // Scope is per-user (not per-post) so the gate also covers cross-post
  // first-comments. `pg_advisory_xact_lock` is released automatically when
  // the transaction commits or rolls back — no explicit unlock needed.
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
      contentHash: sub.contentHash,
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
    fireAndForgetNotify(sendNewComment(db, info, target), log, 'new comment')
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
  facts: RequestFacts,
  clientAddress: string,
  session: BlogSession,
): Promise<CommentAndUser> {
  const sub = await validateSubmission(db, commentReq, facts, clientAddress, session)
  const info = await persistComment(db, commentReq, sub, facts.userAgent, clientAddress)
  await notifyCommentCreated(db, info, sub.target)
  await clearLatestCommentsCache()
  return info
}
