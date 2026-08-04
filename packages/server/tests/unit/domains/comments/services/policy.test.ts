import {
  DEDUPE_SAMPLE_LIMIT,
  DEDUPE_WINDOW_MS,
  MAX_COMMENT_LENGTH,
  OWN_EDIT_GRACE_MS,
  decideCommenterGate,
  decideContentGate,
  decideEmailGate,
  decideOwnEdit,
} from '@kobato/server/domains/comments/services/policy'
import { describe, expect, it } from 'vitest'

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
    expect(decideEmailGate(undefined, true)).toEqual({
      code: 'UNAUTHORIZED',
      message: '该邮箱已经注册，请登录后再进行评论留言。',
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
    expect(decideCommenterGate(undefined, { email: 'admin@example.com', role: 'admin', isMuted: false })).toEqual({
      code: 'UNAUTHORIZED',
      message: '管理员账号需要登陆才能评论。',
    })
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
    ).toEqual({
      code: 'FORBIDDEN',
      message: '评论邮箱与登陆账号不相符。',
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
    expect(decideCommenterGate(undefined, { email: 'anon@example.com', role: null, isMuted: true })).toEqual({
      code: 'FORBIDDEN',
      message: '您的评论功能已被管理员禁用，如有疑问请联系站长。',
    })
  })

  it('checks role before mute (anonymous muted admin gets the login error)', () => {
    expect(decideCommenterGate(undefined, { email: 'admin@example.com', role: 'admin', isMuted: true })).toEqual({
      code: 'UNAUTHORIZED',
      message: '管理员账号需要登陆才能评论。',
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
    ).toEqual({
      code: 'BAD_REQUEST',
      message: `评论内容过长，最多 ${MAX_COMMENT_LENGTH} 个字符。`,
    })
  })

  it('rejects a duplicate hash inside the dedupe window for non-admins', () => {
    expect(
      decideContentGate({ role: 'visitor', contentLength: 10, contentHash: 'dup', recentContentHashes: ['dup'] }),
    ).toEqual({
      code: 'CONFLICT',
      message: '重复评论，你已经有了相同的留言，如果在页面看不到，说明它正在等待站长审核。',
    })
  })

  it('treats role-less (anonymous) commenters as non-admins for dedupe', () => {
    expect(
      decideContentGate({ role: null, contentLength: 10, contentHash: 'dup', recentContentHashes: ['dup'] }),
    ).toEqual({
      code: 'CONFLICT',
      message: '重复评论，你已经有了相同的留言，如果在页面看不到，说明它正在等待站长审核。',
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
    ).toEqual({
      code: 'BAD_REQUEST',
      message: `评论内容过长，最多 ${MAX_COMMENT_LENGTH} 个字符。`,
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
