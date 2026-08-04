// Pure comment-policy decisions. No I/O and no clock of their own —
// the services load the rows and pass the facts in, so every branch
// here is unit-testable without mocks. Each gate returns `null` when
// the submission may proceed, or a `GateFailure` the service turns
// into a `DomainError` verbatim. Codes and messages are part of the
// wire contract — do not reword.

import type { DomainErrorCode } from '@kobato/server/infra/http/errors'

export interface GateFailure {
  code: DomainErrorCode
  message: string
}

// ─── Own-edit grace window ─────────────────────────────────────────────

/** Self-edits inside this window rewrite in place; outside it the edit re-pends. */
export const OWN_EDIT_GRACE_MS = 30 * 60 * 1000

export type OwnEditDecision = 'silent-edit' | 're-pend'

/**
 * Decide what an owner's edit does to their comment's moderation state:
 * inside the grace window from `createAt` the commenter is polishing a
 * just-posted reply — the body is rewritten in place, the moderation
 * state is untouched, and the admin is NOT notified. Outside it the
 * comment re-enters the moderation queue and the admin gets the
 * new-comment email.
 */
export function decideOwnEdit(existing: { createAt: Date }, now: number): OwnEditDecision {
  return now - existing.createAt.getTime() < OWN_EDIT_GRACE_MS ? 'silent-edit' : 're-pend'
}

// ─── Submission gates ──────────────────────────────────────────────────

export const MAX_COMMENT_LENGTH = 10_000
export const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const DEDUPE_SAMPLE_LIMIT = 20

/**
 * Registered-account fence, evaluated BEFORE the commenter row is
 * inserted: an anonymous submission under an email that already has a
 * registered account must log in first.
 */
export function decideEmailGate(
  loginUser: { email: string } | undefined,
  emailRegistered: boolean,
): GateFailure | null {
  if (loginUser === undefined && emailRegistered) {
    return { code: 'UNAUTHORIZED', message: '该邮箱已经注册，请登录后再进行评论留言。' }
  }
  return null
}

/**
 * Role and mute gate over the just-resolved commenter row. Admins may
 * only comment while logged in; a logged-in non-admin may only comment
 * under their own account email; a muted user cannot comment at all.
 */
export function decideCommenterGate(
  loginUser: { email: string } | undefined,
  commenter: { email: string; role: string | null; isMuted: boolean },
): GateFailure | null {
  if (commenter.role === 'admin') {
    if (loginUser === undefined) {
      return { code: 'UNAUTHORIZED', message: '管理员账号需要登陆才能评论。' }
    }
  } else if (loginUser !== undefined && loginUser.email !== commenter.email) {
    return { code: 'FORBIDDEN', message: '评论邮箱与登陆账号不相符。' }
  }
  if (commenter.isMuted) {
    return { code: 'FORBIDDEN', message: '您的评论功能已被管理员禁用，如有疑问请联系站长。' }
  }
  return null
}

/**
 * Content gate over the canonicalized markdown. The length cap applies
 * to everyone; the dedupe rule (same content hash posted by the same
 * user within {@link DEDUPE_WINDOW_MS}) skips admins. Length is checked
 * first so an over-long duplicate still reports the length error.
 */
export function decideContentGate(input: {
  role: string | null
  contentLength: number
  contentHash: string
  recentContentHashes: string[]
}): GateFailure | null {
  if (input.contentLength > MAX_COMMENT_LENGTH) {
    return { code: 'BAD_REQUEST', message: `评论内容过长，最多 ${MAX_COMMENT_LENGTH} 个字符。` }
  }
  if (input.role !== 'admin' && input.recentContentHashes.includes(input.contentHash)) {
    return {
      code: 'CONFLICT',
      message: '重复评论，你已经有了相同的留言，如果在页面看不到，说明它正在等待站长审核。',
    }
  }
  return null
}
