import { describe, expect, it } from 'vitest'

import {
  DEDUPE_SAMPLE_LIMIT,
  DEDUPE_WINDOW_MS,
  MAX_COMMENT_LENGTH,
  OWN_EDIT_GRACE_MS,
  decideCommenterGate,
  decideContentGate,
  decideEmailGate,
  decideOwnEdit,
} from '@/server/domains/comments/services/policy'

// Pure-decider coverage for the comment policy module — no mocks, no
// DB. The services (`moderate.updateOwnComment`, `mutate.validateSubmission`)
// load the rows and act on these verdicts; the persistence-side wiring
// is pinned in `tests/it/server/domains/comments/update-own-comment.test.ts`.

describe('decideOwnEdit — 30-minute grace window', () => {
  const createAt = new Date('2026-01-01T00:00:00.000Z')

  it('returns silent-edit inside the window', () => {
    const now = createAt.getTime() + OWN_EDIT_GRACE_MS - 1
    expect(decideOwnEdit({ createAt }, now)).toBe('silent-edit')
  })

  it('returns re-pend outside the window', () => {
    const now = createAt.getTime() + OWN_EDIT_GRACE_MS + 60_000
    expect(decideOwnEdit({ createAt }, now)).toBe('re-pend')
  })

  it('returns re-pend exactly at the boundary (window is exclusive)', () => {
    expect(decideOwnEdit({ createAt }, createAt.getTime() + OWN_EDIT_GRACE_MS)).toBe('re-pend')
  })
})

describe('decideEmailGate — registered-account fence', () => {
  it('rejects an anonymous submission under a registered email', () => {
    expect(decideEmailGate(undefined, true)).toMatchObject({
      code: 'UNAUTHORIZED',
      descriptor: { messageKey: 'comments.error.emailRegistered' },
    })
  })

  it('passes an anonymous submission under an unregistered email', () => {
    expect(decideEmailGate(undefined, false)).toBeNull()
  })

  it('passes a logged-in commenter regardless of registration', () => {
    expect(decideEmailGate({ email: 'a@example.com' }, true)).toBeNull()
  })
})

describe('decideCommenterGate — role and mute checks', () => {
  it('rejects an admin commenting anonymously', () => {
    expect(decideCommenterGate(undefined, { email: 'admin@example.com', role: 'admin', isMuted: false })).toMatchObject(
      {
        code: 'UNAUTHORIZED',
        descriptor: { messageKey: 'comments.error.adminLoginRequired' },
      },
    )
  })

  it('passes a logged-in admin', () => {
    expect(
      decideCommenterGate(
        { email: 'admin@example.com' },
        { email: 'admin@example.com', role: 'admin', isMuted: false },
      ),
    ).toBeNull()
  })

  it('rejects a logged-in non-admin commenting under a different email', () => {
    expect(
      decideCommenterGate({ email: 'me@example.com' }, { email: 'other@example.com', role: 'visitor', isMuted: false }),
    ).toMatchObject({
      code: 'FORBIDDEN',
      descriptor: { messageKey: 'comments.error.emailMismatch' },
    })
  })

  it('passes a logged-in non-admin commenting under their own email', () => {
    expect(
      decideCommenterGate({ email: 'me@example.com' }, { email: 'me@example.com', role: 'visitor', isMuted: false }),
    ).toBeNull()
  })

  it('passes an anonymous non-admin commenter', () => {
    expect(decideCommenterGate(undefined, { email: 'anon@example.com', role: null, isMuted: false })).toBeNull()
  })

  it('rejects a muted commenter', () => {
    expect(decideCommenterGate(undefined, { email: 'anon@example.com', role: null, isMuted: true })).toMatchObject({
      code: 'FORBIDDEN',
      descriptor: { messageKey: 'comments.error.muted' },
    })
  })

  it('checks role before mute (anonymous muted admin gets the login error)', () => {
    expect(decideCommenterGate(undefined, { email: 'admin@example.com', role: 'admin', isMuted: true })).toMatchObject({
      code: 'UNAUTHORIZED',
      descriptor: { messageKey: 'comments.error.adminLoginRequired' },
    })
  })
})

describe('decideContentGate — length cap and dedupe window', () => {
  it('passes content exactly at the length cap', () => {
    expect(
      decideContentGate({ role: null, contentLength: MAX_COMMENT_LENGTH, contentHash: 'h1', recentContentHashes: [] }),
    ).toBeNull()
  })

  it('rejects content one character over the cap', () => {
    expect(
      decideContentGate({
        role: null,
        contentLength: MAX_COMMENT_LENGTH + 1,
        contentHash: 'h1',
        recentContentHashes: [],
      }),
    ).toMatchObject({
      code: 'BAD_REQUEST',
      descriptor: { messageKey: 'comments.error.contentTooLong', params: { max: MAX_COMMENT_LENGTH } },
    })
  })

  it('rejects a duplicate hash inside the dedupe window for non-admins', () => {
    expect(
      decideContentGate({ role: 'visitor', contentLength: 10, contentHash: 'dup', recentContentHashes: ['dup'] }),
    ).toMatchObject({
      code: 'CONFLICT',
      descriptor: { messageKey: 'comments.error.duplicate' },
    })
  })

  it('treats role-less (anonymous) commenters as non-admins for dedupe', () => {
    expect(
      decideContentGate({ role: null, contentLength: 10, contentHash: 'dup', recentContentHashes: ['dup'] }),
    ).toMatchObject({
      code: 'CONFLICT',
      descriptor: { messageKey: 'comments.error.duplicate' },
    })
  })

  it('skips the dedupe rule for admins', () => {
    expect(
      decideContentGate({ role: 'admin', contentLength: 10, contentHash: 'dup', recentContentHashes: ['dup'] }),
    ).toBeNull()
  })

  it('passes a fresh hash for non-admins', () => {
    expect(
      decideContentGate({ role: 'visitor', contentLength: 10, contentHash: 'new', recentContentHashes: ['old'] }),
    ).toBeNull()
  })

  it('checks length before dedupe (over-long duplicate reports the length error)', () => {
    expect(
      decideContentGate({
        role: 'visitor',
        contentLength: MAX_COMMENT_LENGTH + 1,
        contentHash: 'dup',
        recentContentHashes: ['dup'],
      }),
    ).toMatchObject({
      code: 'BAD_REQUEST',
      descriptor: { messageKey: 'comments.error.contentTooLong', params: { max: MAX_COMMENT_LENGTH } },
    })
  })
})

describe('policy constants', () => {
  it('pins the window and cap values the services load with', () => {
    expect(OWN_EDIT_GRACE_MS).toBe(30 * 60 * 1000)
    expect(DEDUPE_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(DEDUPE_SAMPLE_LIMIT).toBe(20)
    expect(MAX_COMMENT_LENGTH).toBe(10_000)
  })
})
