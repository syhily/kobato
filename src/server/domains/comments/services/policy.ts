// Pure comment-policy decisions — no I/O, no clock; services pass facts in.
// Each gate returns `null` to allow or a `GateFailure`. Codes and messages
// are part of the wire contract — do not reword.

import type { DomainErrorCode } from '@/server/infra/http/errors'

export interface GateFailure {
  code: DomainErrorCode
  message: string
}

export const OWN_EDIT_GRACE_MS = 30 * 60 * 1000

export type OwnEditDecision = 'silent-edit' | 're-pend'

/** In-grace edits rewrite in place (moderation state untouched, admin not
 *  notified); outside the window the comment re-enters the queue. */
export function decideOwnEdit(existing: { createAt: Date }, now: number): OwnEditDecision {
  return now - existing.createAt.getTime() < OWN_EDIT_GRACE_MS ? 'silent-edit' : 're-pend'
}

export const MAX_COMMENT_LENGTH = 10_000
export const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const DEDUPE_SAMPLE_LIMIT = 20

/**
 * Registered-account fence (before commenter-row insert): an anonymous
 * submission under an already-registered email must log in first.
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

/** Length cap for everyone; dedupe (same hash within DEDUPE_WINDOW_MS) skips
 *  admins. Length is checked first, so over-long duplicates report the length error. */
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
