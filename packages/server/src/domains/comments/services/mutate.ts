import type { CommentReq } from '@kobato/contracts/comments.ts'
import type { Database } from '@kobato/db/database.ts'
import type { NewComment } from '@kobato/db/types.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { MetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import type { CommentAndUser } from '@kobato/server/domains/comments/types.ts'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts.ts'

import { hasRegisteredAccount, insertCommentUser, updateLastLogin } from '@kobato/db/operations/user.ts'
import { userSession } from '@kobato/server/domains/auth/primitives.ts'
import { withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge.ts'
import { insertComment } from '@kobato/server/domains/comments/repos/mutate.ts'
import {
  countApprovedCommentsByUser,
  findCommentWithSourceUser,
  recentCommentsForUserDedupe,
} from '@kobato/server/domains/comments/repos/public-query/by-id.ts'
import { findCommentRootId } from '@kobato/server/domains/comments/repos/public-query/threads.ts'
import { canonicalizeCommentBody } from '@kobato/server/domains/comments/services/canonicalize.ts'
import { sendNewComment, sendNewReply } from '@kobato/server/domains/comments/services/email.ts'
import {
  DEDUPE_SAMPLE_LIMIT,
  DEDUPE_WINDOW_MS,
  decideCommenterGate,
  decideContentGate,
  decideEmailGate,
} from '@kobato/server/domains/comments/services/policy.ts'
import { safeResolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { idFromString } from '@kobato/utils/id.ts'
import { createHash } from 'node:crypto'

const log = getLogger('comments.loader')

/** sha256 hex of the `content` snapshot. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

interface ValidatedSubmission {
  target: MetricTarget
  user: NonNullable<Awaited<ReturnType<typeof insertCommentUser>>>
  canonicalBody: NewComment['body']
  contentSnapshot: string
  contentHash: string
  rootId: number
}

async function validateSubmission(
  db: Database,
  commentReq: CommentReq,
  facts: RequestFacts,
  clientAddress: string,
  session: BlogSession,
): Promise<ValidatedSubmission> {
  const target = await safeResolveMetricTarget(db, commentReq.page_key)
  if (target === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('comments.error.targetPageMissing'))
  }

  // Registered-account fence: anonymous-only, must run before `insertCommentUser`.
  const loginUser = userSession(session)
  const emailRegistered = loginUser === undefined ? await hasRegisteredAccount(db, commentReq.email) : false
  const emailFailure = decideEmailGate(loginUser, emailRegistered)
  if (emailFailure) {
    throw new DomainError(emailFailure.code, emailFailure.descriptor)
  }

  const u = await insertCommentUser(db, commentReq.name, commentReq.email, commentReq.link || '')
  if (u === null) {
    throw new DomainError('INTERNAL', descriptorFor('comments.error.userCreateFailed'))
  }

  const commenterFailure = decideCommenterGate(loginUser, u)
  if (commenterFailure) {
    throw new DomainError(commenterFailure.code, commenterFailure.descriptor)
  }

  const { body: canonicalBody, content: contentSnapshot } = await canonicalizeCommentBody(commentReq.body)
  const contentHash = hashContent(contentSnapshot)

  // Admins skip dedupe; drop null hashes (they never equal a submitted hash).
  const recentRows =
    u.role === 'admin'
      ? []
      : await recentCommentsForUserDedupe(db, u.id, new Date(Date.now() - DEDUPE_WINDOW_MS), DEDUPE_SAMPLE_LIMIT)
  const recentContentHashes = recentRows.map((c) => c.contentHash).filter((h): h is string => h !== null)
  const contentFailure = decideContentGate({
    role: u.role,
    contentLength: contentSnapshot.length,
    contentHash,
    recentContentHashes,
  })
  if (contentFailure) {
    throw new DomainError(contentFailure.code, contentFailure.descriptor)
  }

  await updateLastLogin(db, u.id, clientAddress, facts.userAgent)

  let rootId = 0
  if (commentReq.rid !== undefined && commentReq.rid !== 0) {
    const ridBig = idFromString(commentReq.rid)
    const parentRoot = await findCommentRootId(db, ridBig)
    rootId = parentRoot !== null && parentRoot !== 0 ? parentRoot : ridBig
  }

  return { target, user: u, canonicalBody, contentSnapshot, contentHash, rootId }
}

async function persistComment(
  db: Database,
  commentReq: CommentReq,
  sub: ValidatedSubmission,
  ua: string | null,
  ip: string,
): Promise<CommentAndUser> {
  // Transactional, sync (node:sqlite): the transaction serialises the
  // read+write, so two concurrent first comments can't both bypass moderation.
  return db.transaction((tx) => {
    const approvedCount = countApprovedCommentsByUser(tx, sub.user.id)
    const isPending = approvedCount === 0

    const newComment: NewComment = {
      content: sub.contentSnapshot,
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
    const cr = insertComment(tx, newComment)
    if (cr === null) {
      throw new DomainError('INTERNAL', descriptorFor('comments.error.createFailed'))
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

async function notifyCommentCreated(db: Database, info: CommentAndUser, target: MetricTarget): Promise<void> {
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

export async function createComment(
  db: Database,
  commentReq: CommentReq,
  facts: RequestFacts,
  clientAddress: string,
  session: BlogSession,
): Promise<CommentAndUser> {
  const sub = await validateSubmission(db, commentReq, facts, clientAddress, session)
  const info = await persistComment(db, commentReq, sub, facts.userAgent, clientAddress)
  await notifyCommentCreated(db, info, sub.target)
  return info
}
