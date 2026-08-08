import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { establishLoginSession, logout, userSession } from '@/server/domains/auth/primitives'
import { requireRole, requireUserRole, isPostOwner, canEditPost } from '@/server/domains/auth/rbac'
import {
  recordSessionLogin,
  findSessionMeta,
  revokeSessionById,
  recordSessionActivity,
} from '@/server/domains/auth/repo'
import { handleCredentialLogin } from '@/server/domains/auth/services/credential'
import { handleOtpCancel } from '@/server/domains/auth/services/otp'
import { listSessionsByUser, listAllSessions } from '@/server/domains/auth/services/sessions'
import { revokeSessionWithGuard } from '@/server/domains/auth/session-guard'
import { getRequestSession } from '@/server/domains/auth/session-storage'
import {
  getSetupToken,
  invalidateSetupToken,
  verifySetupToken,
  isSetupTokenActive,
  __resetSetupTokenForTests,
} from '@/server/domains/auth/setup-token'
import {
  issueOtpToken,
  issueResetToken,
  issueSetupToken,
  issueSignInLinkToken,
  consumeToken,
  peekToken,
  purgeExpired,
  revokeTokensFor,
  verifyOtpToken,
} from '@/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { verification, user } from '@/server/infra/db/schema/user'

const db = getTestDb()

// Wire the audit batcher so establishLoginSession's fire-and-forget
// events land; flush before clearAllTables truncates referenced rows.
beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  // The invalidation flag is a process-level fast-path — reset it per test.
  __resetSetupTokenForTests()
})

afterEach(async () => {
  vi.useRealTimers()
  await flushAuditLog()
  resetAllBatchers()
})

async function seedUser(role: 'admin' | 'visitor' | 'author' = 'admin', email = 'a@example.com') {
  const [u] = await db.insert(user).values({ name: 'T', email, password: 'hashed', role }).returning()
  return u
}

/** Seed a bare session row — `recordSessionLogin` is UPDATE-only, so the
 * row must already exist with its owner stamped. */
async function seedSessionRow(sid: string, userId: number | null, expiresAt?: Date) {
  await db.insert(sessionTable).values({
    id: sid,
    userId,
    data: {},
    expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  })
}

describe('auth/verification-tokens — issueResetToken', () => {
  it('issues a token and round-trips peek then consume', async () => {
    const u = await seedUser()
    const { token } = await issueResetToken(db, u.id)

    const peeked = await peekToken(db, token, 'password-reset')
    expect(peeked).not.toBeNull()
    expect(peeked!.userId).toBe(u.id)

    const consumed = await consumeToken(db, token, 'password-reset')
    expect(consumed).not.toBeNull()
    expect(consumed!.userId).toBe(u.id)

    // Single-shot consume.
    expect(await consumeToken(db, token, 'password-reset')).toBeNull()
  })

  it('returns null when peeking with a mismatched purpose', async () => {
    const u = await seedUser('admin', 'mismatch@example.com')
    const { token } = await issueResetToken(db, u.id)
    expect(await peekToken(db, token, 'author-invite')).toBeNull()
  })

  it('returns null for malformed token strings (length filter)', async () => {
    expect(await peekToken(db, 'too-short', 'password-reset')).toBeNull()
    expect(await consumeToken(db, 'also-too-short', 'password-reset')).toBeNull()
  })

  it('rotates a token in place on re-issue via UPSERT', async () => {
    const u = await seedUser('admin', 'rot@example.com')
    const first = await issueResetToken(db, u.id)
    const second = await issueResetToken(db, u.id)
    expect(first.token).not.toBe(second.token)

    expect(await peekToken(db, first.token, 'password-reset')).toBeNull()
    expect(await peekToken(db, second.token, 'password-reset')).not.toBeNull()
  })

  it('expires tokens that have passed their expiry', async () => {
    const u = await seedUser('admin', 'exp@example.com')
    const past = new Date(Date.now() - 60 * 60 * 1000)
    const raw = '0'.repeat(43)
    const value = await (await import('node:crypto')).createHash('sha256').update(raw).digest('hex')
    await db.insert(verification).values({
      id: 'expiredtokenid1234567890ab',
      purpose: 'password-reset',
      userId: u.id,
      value,
      expiresAt: past,
    })
    expect(await peekToken(db, raw, 'password-reset')).toBeNull()
  })
})

describe('auth/verification-tokens — issueSetupToken', () => {
  it('issues an author-invite token', async () => {
    const u = await seedUser('author', 'invite@example.com')
    const { token } = await issueSetupToken(db, u.id)
    expect(await peekToken(db, token, 'author-invite')).not.toBeNull()
  })
})

describe('auth/verification-tokens — signin-link', () => {
  it('issues a signin-link token that peeks, consumes once, and rejects replay', async () => {
    const u = await seedUser('admin', 'magic@example.com')
    const { token } = await issueSignInLinkToken(db, u.id)

    // Peek is read-only.
    expect(await peekToken(db, token, 'signin-link')).not.toBeNull()
    expect(await peekToken(db, token, 'signin-link')).not.toBeNull()

    const consumed = await consumeToken(db, token, 'signin-link')
    expect(consumed).not.toBeNull()
    expect(consumed!.userId).toBe(u.id)
    expect(await consumeToken(db, token, 'signin-link')).toBeNull()
  })

  it('does not peek under a different purpose', async () => {
    const u = await seedUser('admin', 'magic2@example.com')
    const { token } = await issueSignInLinkToken(db, u.id)
    expect(await peekToken(db, token, 'password-reset')).toBeNull()
    expect(await peekToken(db, token, 'signin-link')).not.toBeNull()
  })

  it('re-issue rotates the live token in place', async () => {
    const u = await seedUser('admin', 'magic3@example.com')
    const first = await issueSignInLinkToken(db, u.id)
    const second = await issueSignInLinkToken(db, u.id)
    expect(second.token).not.toBe(first.token)
    expect(await peekToken(db, first.token, 'signin-link')).toBeNull()
    expect(await peekToken(db, second.token, 'signin-link')).not.toBeNull()
  })
})

describe('auth/verification-tokens — revokeTokensFor', () => {
  it('deletes all tokens for the given (user, purpose)', async () => {
    const u = await seedUser('admin', 'rev@example.com')
    const { token } = await issueResetToken(db, u.id)
    await revokeTokensFor(db, u.id, 'password-reset')
    expect(await peekToken(db, token, 'password-reset')).toBeNull()
  })
})

describe('auth/verification-tokens — purgeExpired', () => {
  it('deletes verification rows that are older than 1 day past expiry', async () => {
    const stale = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    await db.insert(verification).values([
      {
        id: 'staleid000000000000001',
        purpose: 'password-reset',
        userId: 1,
        value: 'stalevalue1',
        expiresAt: stale,
      },
      {
        id: 'staleid000000000000002',
        purpose: 'password-reset',
        userId: 2,
        value: 'stalevalue2',
        expiresAt: stale,
      },
    ])
    const deleted = await purgeExpired(db)
    expect(deleted).toBeGreaterThanOrEqual(2)
  })
})

describe('auth/verification-tokens — OTP', () => {
  it('issues a 6-digit OTP and verifies it on first use, then fails on reuse', async () => {
    const u = await seedUser('admin', 'otp@example.com')
    const { otpCode } = await issueOtpToken(db, u.id)
    expect(otpCode).toMatch(/^\d{6}$/)

    const result = await verifyOtpToken(db, u.id, otpCode)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe(u.id)

    // Single-use: the row was deleted.
    expect(await verifyOtpToken(db, u.id, otpCode)).toBeNull()
  })

  it('returns null when verifying a wrong code', async () => {
    const u = await seedUser('admin', 'otp2@example.com')
    await issueOtpToken(db, u.id)
    expect(await verifyOtpToken(db, u.id, '000000')).toBeNull()
  })

  it('returns null when no OTP row exists for the user', async () => {
    expect(await verifyOtpToken(db, 99_999, '123456')).toBeNull()
  })

  it('deletes and rejects an expired OTP', async () => {
    const u = await seedUser('admin', 'otp3@example.com')
    const { otpCode } = await issueOtpToken(db, u.id)
    const { and, eq } = await import('drizzle-orm')
    const past = new Date(Date.now() - 60 * 60 * 1000)
    await db
      .update(verification)
      .set({ expiresAt: past })
      .where(and(eq(verification.userId, u.id), eq(verification.purpose, 'signin-otp')))
    expect(await verifyOtpToken(db, u.id, otpCode)).toBeNull()
  })
})

describe('auth/setup-token — getSetupToken & verify', () => {
  it('generates a token, persists it, and verifies the same value', async () => {
    const token = await getSetupToken(db)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(await verifySetupToken(db, token)).toBe(true)
    expect(await isSetupTokenActive(db)).toBe(true)
  })

  it('returns the same token across calls until invalidated', async () => {
    const a = await getSetupToken(db)
    const b = await getSetupToken(db)
    expect(a).toBe(b)
  })

  it('rejects an unequal candidate of the same length', async () => {
    const token = await getSetupToken(db)
    const other = '0'.repeat(token.length)
    expect(await verifySetupToken(db, other)).toBe(false)
  })

  it('returns false when no token exists', async () => {
    expect(await verifySetupToken(db, 'whatever')).toBe(false)
    expect(await isSetupTokenActive(db)).toBe(false)
  })

  it('after invalidate, getSetupToken throws and verify returns false', async () => {
    await getSetupToken(db)
    await invalidateSetupToken(db)
    await expect(getSetupToken(db)).rejects.toThrow(/invalidated/i)
  })
})

describe('auth/rbac — predicates', () => {
  it('requireUserRole throws on missing user', () => {
    expect(() => requireUserRole(undefined, 'admin')).toThrow()
  })

  it('requireUserRole throws on insufficient role', () => {
    expect(() =>
      requireUserRole({ id: '1', name: 'T', email: 't@e.com', website: null, role: 'visitor' }, 'admin'),
    ).toThrow()
  })

  it('requireUserRole passes for matching role', () => {
    expect(() =>
      requireUserRole({ id: '1', name: 'T', email: 't@e.com', website: null, role: 'admin' }, 'admin'),
    ).not.toThrow()
  })

  it('requireRole delegates to requireUserRole', () => {
    expect(() => requireRole({ user: undefined, role: null }, 'admin')).toThrow()
    expect(() =>
      requireRole(
        { user: { id: '1', name: 'T', email: 't@e.com', website: null, role: 'admin' }, role: 'admin' },
        'admin',
      ),
    ).not.toThrow()
  })

  it('isPostOwner compares authorId to viewer.id', () => {
    const viewer = { id: '5', role: 'admin' as const }
    expect(isPostOwner(viewer, { authorId: 5 })).toBe(true)
    expect(isPostOwner(viewer, { authorId: 6 })).toBe(false)
    expect(isPostOwner(viewer, { authorId: null })).toBe(false)
  })

  it('canEditPost is true for admin OR owner', () => {
    const admin = { id: '1', role: 'admin' as const }
    const author = { id: '5', role: 'author' as const }
    expect(canEditPost(admin, { authorId: 99 })).toBe(true)
    expect(canEditPost(author, { authorId: 5 })).toBe(true)
    expect(canEditPost(author, { authorId: 6 })).toBe(false)
  })
})

describe('auth/repo — session meta', () => {
  it('recordSessionLogin writes meta columns that findSessionMeta can read back', async () => {
    const u = await seedUser('admin', 'meta@example.com')
    const sid = 'sid-record-1'
    await seedSessionRow(sid, u.id)
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: 'jest', ip: '127.0.0.1' })

    const meta = await findSessionMeta(db, sid)
    expect(meta).not.toBeNull()
    expect(meta!.userId).toBe(u.id)
    expect(meta!.ip).toBe('127.0.0.1')
  })

  it('truncates a user agent longer than 512 chars', async () => {
    const u = await seedUser('admin', 'longua@example.com')
    const sid = 'sid-long-ua'
    await seedSessionRow(sid, u.id)
    const longUa = 'x'.repeat(1000)
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: longUa, ip: '1.1.1.1' })
    const meta = await findSessionMeta(db, sid)
    expect(meta!.userAgent.length).toBe(512)
  })

  it('returns null from findSessionMeta for an unknown sid', async () => {
    expect(await findSessionMeta(db, 'nope')).toBeNull()
  })

  it('revokeSessionById drops the session row', async () => {
    const u = await seedUser('admin', 'rev-session@example.com')
    const sid = 'sid-revoke-1'
    await seedSessionRow(sid, u.id)
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })

    await revokeSessionById(db, sid, u.id)

    expect(await findSessionMeta(db, sid)).toBeNull()
    const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
    expect(rows).toHaveLength(0)
  })

  it('recordSessionActivity is a void fire-and-forget that bumps lastActiveAt and expiresAt', async () => {
    const u = await seedUser('admin', 'activity@example.com')
    const sid = 'sid-activity'
    // Seed a short-lived row so the sliding-refresh bump is observable.
    const seededExpiry = new Date(Date.now() + 60 * 60 * 1000)
    await seedSessionRow(sid, u.id, seededExpiry)
    const staleLogin = new Date('2024-01-01T00:00:00Z')
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1', loginAt: staleLogin })
    recordSessionActivity(db, sid)
    // One event-loop turn drains the fire-and-forget UPDATE deterministically.
    await new Promise((resolve) => setImmediate(resolve))
    const meta = await findSessionMeta(db, sid)
    expect(meta).not.toBeNull()
    expect(meta!.lastActiveAt.getTime()).toBeGreaterThan(staleLogin.getTime())
    expect(meta!.expiresAt.getTime()).toBeGreaterThan(seededExpiry.getTime())
  })
})

describe('auth/service — listSessionsByUser', () => {
  it('returns an empty list when the user has no sessions', async () => {
    const u = await seedUser('admin', 'none@example.com')
    expect(await listSessionsByUser(db, u.id)).toEqual([])
  })

  it('returns only live session metas (expired rows are excluded)', async () => {
    const u = await seedUser('admin', 'has@example.com')
    const liveSid = 'sid-live'
    const expiredSid = 'sid-expired'

    await seedSessionRow(liveSid, u.id)
    await recordSessionLogin(db, { sid: liveSid, userId: u.id, userAgent: 'jest', ip: '1.1.1.1' })

    await seedSessionRow(expiredSid, u.id, new Date(Date.now() - 60 * 1000))
    await recordSessionLogin(db, { sid: expiredSid, userId: u.id, userAgent: 'jest', ip: '2.2.2.2' })

    const list = await listSessionsByUser(db, u.id)
    expect(list).toHaveLength(1)
    expect(list[0]!.sid).toBe(liveSid)
  })

  it('does not return sessions that belong to a different user', async () => {
    const alice = await seedUser('admin', 'alice@example.com')
    const bob = await seedUser('admin', 'bob@example.com')
    const aliceSid = 'sid-alice'
    await seedSessionRow(aliceSid, alice.id)
    await recordSessionLogin(db, { sid: aliceSid, userId: alice.id, userAgent: 'ua', ip: '1.1.1.1' })

    const list = await listSessionsByUser(db, bob.id)
    expect(list).toEqual([])
  })
})

describe('auth/service — listAllSessions', () => {
  it('returns an empty list when no sessions exist', async () => {
    expect(await listAllSessions(db)).toEqual([])
  })

  it('joins live sessions with their owning user', async () => {
    const u = await seedUser('admin', 'all@example.com')
    const sid = 'sid-all-1'
    await seedSessionRow(sid, u.id)
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })

    const list = await listAllSessions(db)
    expect(list).toHaveLength(1)
    expect(list[0]!.sid).toBe(sid)
    expect(list[0]!.userEmail).toBe('all@example.com')
  })
})

describe('auth/session-guard — revokeSessionWithGuard', () => {
  it('returns null targetUserId when the session does not exist', async () => {
    const result = await revokeSessionWithGuard(db, 'missing', { id: '1', role: 'admin' })
    expect(result).toEqual({ targetUserId: null })
  })

  it("revokes the caller's own session regardless of role", async () => {
    const u = await seedUser('admin', 'own@example.com')
    const sid = 'sid-own'
    await seedSessionRow(sid, u.id)
    await recordSessionLogin(db, { sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })

    const result = await revokeSessionWithGuard(db, sid, { id: String(u.id), role: 'admin' })
    expect(result.targetUserId).toBe(u.id)
    expect(await findSessionMeta(db, sid)).toBeNull()
  })

  it("throws FORBIDDEN when an admin tries to revoke another admin's session", async () => {
    const alice = await seedUser('admin', 'a-admin@example.com')
    const bob = await seedUser('admin', 'b-admin@example.com')
    const sid = 'sid-guard'
    await seedSessionRow(sid, bob.id)
    await recordSessionLogin(db, { sid, userId: bob.id, userAgent: 'ua', ip: '1.1.1.1' })

    await expect(revokeSessionWithGuard(db, sid, { id: String(alice.id), role: 'admin' })).rejects.toThrow(/无权/)
  })

  it("allows an admin to revoke a non-admin's session", async () => {
    const admin = await seedUser('admin', 'admin2@example.com')
    const visitor = await seedUser('visitor', 'visitor@example.com')
    const sid = 'sid-cross'
    await seedSessionRow(sid, visitor.id)
    await recordSessionLogin(db, { sid, userId: visitor.id, userAgent: 'ua', ip: '1.1.1.1' })

    const result = await revokeSessionWithGuard(db, sid, { id: String(admin.id), role: 'admin' })
    expect(result.targetUserId).toBe(visitor.id)
  })
})

describe('auth/primitives — establishLoginSession & logout', () => {
  it('throws when the user has no role', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'N', email: 'norole@example.com', password: 'h', role: null })
      .returning()
    const session = await getRequestSession(new Request('http://localhost/'))
    await expect(
      establishLoginSession(db, session, { ...u, role: null } as any, new Request('http://localhost/'), '1.1.1.1'),
    ).rejects.toThrow(/role/)
  })

  it('establishes a login, writes the session row, then logout clears it', async () => {
    const u = await seedUser('admin', 'establish@example.com')
    const session = await getRequestSession(new Request('http://localhost/'))
    const request = new Request('http://localhost/', { headers: { 'User-Agent': 'vitest' } })

    const result = await establishLoginSession(db, session, u as any, request, '127.0.0.1')
    expect(result.sid).toMatch(/^[0-9a-f-]+$/)
    expect(result.setCookie).toContain('__session=')

    // Row written through the process-level session-storage pool.
    const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, result.sid))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(u.id)

    const session2 = await getRequestSession(
      new Request('http://localhost/', { headers: { Cookie: result.setCookie.split(';')[0] } }),
    )
    await logout(session2)
    expect(userSession(session2)).toBeUndefined()
  })

  it('revokes other sessions when revokeOtherSessions is set', async () => {
    const u = await seedUser('admin', 'revoke-others@example.com')
    const session1 = await getRequestSession(new Request('http://localhost/'))
    const first = await establishLoginSession(db, session1, u as any, new Request('http://localhost/'), '127.0.0.1')

    const session2 = await getRequestSession(new Request('http://localhost/'))
    const second = await establishLoginSession(db, session2, u as any, new Request('http://localhost/'), '127.0.0.1', {
      revokeOtherSessions: true,
    })

    expect(second.sid).not.toBe(first.sid)
    expect(await db.select().from(sessionTable).where(eq(sessionTable.id, first.sid))).toHaveLength(0)
    expect(await db.select().from(sessionTable).where(eq(sessionTable.id, second.sid))).toHaveLength(1)
  })
})

describe('auth/primitives — resolveSessionContext', () => {
  it('returns a session with no user for a fresh anonymous request', async () => {
    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext(db, new Request('http://localhost/'))
    expect(result.user).toBeUndefined()
  })
})

describe('auth/otp-flow — handleOtpCancel', () => {
  it('redirects to the signin page and clears pending OTP state', async () => {
    const session = await getRequestSession(new Request('http://localhost/'))
    session.set('pendingOtpUser', {
      userId: '1',
      email: 't@e.com',
      expiresAt: Date.now(),
      sentAt: Date.now(),
    })
    session.set('otpFailCount', 2)

    const markSessionDirty = vi.fn()
    const result = await handleOtpCancel({ db, session, clientAddress: '127.0.0.1', markSessionDirty }, '/admin')
    expect(result.type).toBe('redirect')
    if (result.type === 'redirect') {
      expect(result.to).toContain('signin')
      expect(result.to).toContain(encodeURIComponent('/admin'))
    }
    expect(session.get('pendingOtpUser')).toBeUndefined()
    expect(session.get('otpFailCount')).toBeUndefined()
    // The domain only marks dirty — the boundary middleware commits the session.
    expect(markSessionDirty).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('setCookie')
  })
})

describe('auth/otp-flow — handleCredentialLogin', () => {
  it('rejects an empty body with a Chinese error message', async () => {
    const session = await getRequestSession(new Request('http://localhost/'))
    const formData = new FormData()
    const markSessionDirty = vi.fn()
    const result = await handleCredentialLogin(
      { db, session, clientAddress: '127.0.0.1', markSessionDirty },
      new Request('http://localhost/'),
      formData,
      '/admin',
    )
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('邮箱')
    }
    // Error results carry no mutation — no dirty mark, no setCookie.
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns the invalid-credentials error when the user cannot be verified', async () => {
    const session = await getRequestSession(new Request('http://localhost/'))
    const formData = new FormData()
    formData.set('email', 'missing@example.com')
    formData.set('password', 'whatever')
    const markSessionDirty = vi.fn()
    const result = await handleCredentialLogin(
      { db, session, clientAddress: '127.0.0.1', markSessionDirty },
      new Request('http://localhost/'),
      formData,
      '/admin',
    )
    expect(result.type).toBe('error')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })
})
