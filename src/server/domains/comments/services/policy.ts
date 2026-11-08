// Pure comment-policy decisions — no I/O, no clock; services pass facts in.
// Each gate returns `null` to allow or a `GateFailure`. The failure carries a
// typed descriptor (never prose): the transports localize it per request.

import type { DomainErrorCode } from '@/server/infra/http/errors'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

export interface GateFailure {
  code: DomainErrorCode
  descriptor: ErrorMessageDescriptor
}

function failure(code: DomainErrorCode, descriptor: ErrorMessageDescriptor): GateFailure {
  return { code, descriptor }
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
    return failure('UNAUTHORIZED', {
      messageKey: 'comments.error.emailRegistered',
      fallbackMessage: 'This email is already registered; sign in before commenting.',
    })
  }
  return null
}

export function decideCommenterGate(
  loginUser: { email: string } | undefined,
  commenter: { email: string; role: string | null; isMuted: boolean },
): GateFailure | null {
  if (commenter.role === 'admin') {
    if (loginUser === undefined) {
      return failure('UNAUTHORIZED', {
        messageKey: 'comments.error.adminLoginRequired',
        fallbackMessage: 'Administrator accounts must sign in before commenting.',
      })
    }
  } else if (loginUser !== undefined && loginUser.email !== commenter.email) {
    return failure('FORBIDDEN', {
      messageKey: 'comments.error.emailMismatch',
      fallbackMessage: 'The comment email does not match the signed-in account.',
    })
  }
  if (commenter.isMuted) {
    return failure('FORBIDDEN', {
      messageKey: 'comments.error.muted',
      fallbackMessage:
        'Your commenting has been disabled by the administrator. Contact the site owner if you have questions.',
    })
  }
  return null
}

/**
 * Length cap for everyone. Shared by the cheap pre-render text walk
 * (`canonicalizeCommentBody`) and the authoritative rendered-content gate
 * below, so both reject with the same code and message.
 */
export function decideContentLengthGate(contentLength: number): GateFailure | null {
  if (contentLength > MAX_COMMENT_LENGTH) {
    return failure('BAD_REQUEST', {
      messageKey: 'comments.error.contentTooLong',
      fallbackMessage: `The comment is too long (at most ${MAX_COMMENT_LENGTH} characters).`,
      params: { max: MAX_COMMENT_LENGTH },
    })
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
  const lengthFailure = decideContentLengthGate(input.contentLength)
  if (lengthFailure !== null) {
    return lengthFailure
  }
  if (input.role !== 'admin' && input.recentContentHashes.includes(input.contentHash)) {
    return failure('CONFLICT', {
      messageKey: 'comments.error.duplicate',
      fallbackMessage:
        'Duplicate comment: you already posted the same message. If it is not visible, it is waiting for moderation.',
    })
  }
  return null
}
