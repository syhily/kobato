import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { handleOtpCancel, handleCredentialLogin } from '@/server/domains/auth/otp-flow'
import { establishLoginSession, logout, userSession } from '@/server/domains/auth/primitives'
import { requireRole, requireUserRole, isPostOwner, canEditPost, canDeleteTag } from '@/server/domains/auth/rbac'
import {
  recordSessionLogin,
  findSessionMeta,
  revokeSessionById,
  recordSessionActivity,
  USER_SET_KEY,
} from '@/server/domains/auth/repo'
import { listSessionsByUser, listAllSessions, revokeSessionWithGuard } from '@/server/domains/auth/service'
import { commitSessionWithMaxAge, getRequestSession } from '@/server/domains/auth/session-storage'
import {
  getSetupToken,
  invalidateSetupToken,
  verifySetupToken,
  isSetupTokenActive,
} from '@/server/domains/auth/setup-token'
import {
  issueOtpToken,
  issueResetToken,
  issueSetupToken,
  consumeToken,
  peekToken,
  purgeExpired,
  revokeTokensFor,
  verifyOtpToken,
} from '@/server/domains/auth/verification-tokens'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { verification } from '@/server/infra/db/schema/user'
import { user } from '@/server/infra/db/schema/user'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.useRealTimers()
})

async function seedUser(role: 'admin' | 'visitor' | 'author' = 'admin', email = 'a@example.com') {
  const [u] = await db.insert(user).values({ name: 'T', email, password: 'hashed', role }).returning()
  return u
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

    // Single-shot consume — second call must return null.
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

    // Old token must no longer work.
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
        userId: 1n,
        value: 'stalevalue1',
        expiresAt: stale,
      },
      {
        id: 'staleid000000000000002',
        purpose: 'password-reset',
        userId: 2n,
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

    // Single-use — second verify must fail (row was deleted).
    expect(await verifyOtpToken(db, u.id, otpCode)).toBeNull()
  })

  it('returns null when verifying a wrong code', async () => {
    const u = await seedUser('admin', 'otp2@example.com')
    await issueOtpToken(db, u.id)
    expect(await verifyOtpToken(db, u.id, '000000')).toBeNull()
  })

  it('returns null when no OTP row exists for the user', async () => {
    expect(await verifyOtpToken(db, 99_999n, '123456')).toBeNull()
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
    await flushWorkerRedis()
    const token = await getSetupToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(await verifySetupToken(token)).toBe(true)
    expect(await isSetupTokenActive()).toBe(true)
  })

  it('returns the same token across calls until invalidated', async () => {
    await flushWorkerRedis()
    const a = await getSetupToken()
    const b = await getSetupToken()
    expect(a).toBe(b)
  })

  it('rejects an unequal candidate of the same length', async () => {
    await flushWorkerRedis()
    const token = await getSetupToken()
    const other = '0'.repeat(token.length)
    expect(await verifySetupToken(other)).toBe(false)
  })

  it('returns false when no token exists in Redis', async () => {
    await flushWorkerRedis()
    expect(await verifySetupToken('whatever')).toBe(false)
    expect(await isSetupTokenActive()).toBe(false)
  })

  it('after invalidate, getSetupToken throws and verify returns false', async () => {
    await flushWorkerRedis()
    await getSetupToken()
    await invalidateSetupToken()
    await expect(getSetupToken()).rejects.toThrow(/invalidated/i)
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

  it('isPostOwner compares authorId to viewer.userId', () => {
    const viewer = { userId: '5', role: 'admin' as const }
    expect(isPostOwner(viewer, { authorId: 5n })).toBe(true)
    expect(isPostOwner(viewer, { authorId: 6n })).toBe(false)
    expect(isPostOwner(viewer, { authorId: null })).toBe(false)
  })

  it('canEditPost is true for admin OR owner', () => {
    const admin = { userId: '1', role: 'admin' as const }
    const author = { userId: '5', role: 'author' as const }
    expect(canEditPost(admin, { authorId: 99n })).toBe(true)
    expect(canEditPost(author, { authorId: 5n })).toBe(true)
    expect(canEditPost(author, { authorId: 6n })).toBe(false)
  })

  it('canDeleteTag is admin-only OR zero-post', () => {
    const admin = { userId: '1', role: 'admin' as const }
    const visitor = { userId: '2', role: 'visitor' as const }
    expect(canDeleteTag(admin, 5)).toBe(true)
    expect(canDeleteTag(visitor, 0)).toBe(true)
    expect(canDeleteTag(visitor, 5)).toBe(false)
  })
})

describe('auth/repo — session meta', () => {
  it('recordSessionLogin writes a meta hash that findSessionMeta can read back', async () => {
    const u = await seedUser('admin', 'meta@example.com')
    const sid = 'sid-record-1'
    await recordSessionLogin({ sid, userId: u.id, userAgent: 'jest', ip: '127.0.0.1' })

    const meta = await findSessionMeta(sid)
    expect(meta).not.toBeNull()
    expect(meta!.userId).toBe(u.id)
    expect(meta!.ip).toBe('127.0.0.1')
  })

  it('truncates a user agent longer than 512 chars', async () => {
    const u = await seedUser('admin', 'longua@example.com')
    const sid = 'sid-long-ua'
    const longUa = 'x'.repeat(1000)
    await recordSessionLogin({ sid, userId: u.id, userAgent: longUa, ip: '1.1.1.1' })
    const meta = await findSessionMeta(sid)
    expect(meta!.userAgent.length).toBe(512)
  })

  it('returns null from findSessionMeta for an unknown sid', async () => {
    expect(await findSessionMeta('nope')).toBeNull()
  })

  it('revokeSessionById drops meta, cookie blob, and user_sessions entry', async () => {
    const u = await seedUser('admin', 'rev-session@example.com')
    const sid = 'sid-revoke-1'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set(`session:${sid}`, 'blob')
    await redis.sadd(USER_SET_KEY(u.id), sid)
    await recordSessionLogin({ sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })

    await revokeSessionById(sid, u.id)

    expect(await findSessionMeta(sid)).toBeNull()
    expect(await redis.get(`session:${sid}`)).toBeNull()
    expect(await redis.sismember(USER_SET_KEY(u.id), sid)).toBe(0)
  })

  it('recordSessionActivity is a void fire-and-forget that writes lastActiveAt', async () => {
    const u = await seedUser('admin', 'activity@example.com')
    const sid = 'sid-activity'
    await recordSessionLogin({ sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })
    recordSessionActivity(sid)
    // Fire-and-forget; give the promise a tick.
    await new Promise((r) => setTimeout(r, 50))
    const meta = await findSessionMeta(sid)
    expect(meta).not.toBeNull()
  })
})

describe('auth/service — listSessionsByUser', () => {
  it('returns an empty list when the user has no sessions', async () => {
    const u = await seedUser('admin', 'none@example.com')
    expect(await listSessionsByUser(db, u.id)).toEqual([])
  })

  it('returns session metas and cleans up orphans (cookie blob missing)', async () => {
    const u = await seedUser('admin', 'has@example.com')
    const liveSid = 'sid-live'
    const orphanSid = 'sid-orphan'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()

    // Live: cookie blob exists + meta exists + set entry exists.
    await redis.set(`session:${liveSid}`, 'blob')
    await redis.sadd(USER_SET_KEY(u.id), liveSid)
    await recordSessionLogin({ sid: liveSid, userId: u.id, userAgent: 'jest', ip: '1.1.1.1' })

    // Orphan: meta + set entry exist but cookie blob is gone.
    await redis.sadd(USER_SET_KEY(u.id), orphanSid)
    await recordSessionLogin({ sid: orphanSid, userId: u.id, userAgent: 'jest', ip: '2.2.2.2' })
    await redis.del(`session:${orphanSid}`)

    const list = await listSessionsByUser(db, u.id)
    expect(list).toHaveLength(1)
    expect(list[0]!.sid).toBe(liveSid)

    // Orphan meta should be cleaned up by the listing.
    expect(await findSessionMeta(orphanSid)).toBeNull()
  })

  it('filters sids whose meta belongs to a different user', async () => {
    const alice = await seedUser('admin', 'alice@example.com')
    const bob = await seedUser('admin', 'bob@example.com')
    const aliceSid = 'sid-alice'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set(`session:${aliceSid}`, 'blob')
    await redis.sadd(USER_SET_KEY(alice.id), aliceSid)
    await recordSessionLogin({ sid: aliceSid, userId: alice.id, userAgent: 'ua', ip: '1.1.1.1' })

    const list = await listSessionsByUser(db, bob.id)
    expect(list).toEqual([])
  })
})

describe('auth/service — listAllSessions', () => {
  it('returns an empty list when no sessions exist', async () => {
    await flushWorkerRedis()
    expect(await listAllSessions(db)).toEqual([])
  })
})

describe('auth/service — revokeSessionWithGuard', () => {
  it('returns null targetUserId when the session does not exist', async () => {
    const result = await revokeSessionWithGuard(db, 'missing', '1', 'admin')
    expect(result).toEqual({ targetUserId: null })
  })

  it("revokes the caller's own session regardless of role", async () => {
    const u = await seedUser('admin', 'own@example.com')
    const sid = 'sid-own'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set(`session:${sid}`, 'blob')
    await redis.sadd(USER_SET_KEY(u.id), sid)
    await recordSessionLogin({ sid, userId: u.id, userAgent: 'ua', ip: '1.1.1.1' })

    const result = await revokeSessionWithGuard(db, sid, String(u.id), 'admin')
    expect(result.targetUserId).toBe(u.id)
    expect(await findSessionMeta(sid)).toBeNull()
  })

  it("throws FORBIDDEN when an admin tries to revoke another admin's session", async () => {
    const alice = await seedUser('admin', 'a-admin@example.com')
    const bob = await seedUser('admin', 'b-admin@example.com')
    const sid = 'sid-guard'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set(`session:${sid}`, 'blob')
    await recordSessionLogin({ sid, userId: bob.id, userAgent: 'ua', ip: '1.1.1.1' })

    await expect(revokeSessionWithGuard(db, sid, String(alice.id), 'admin')).rejects.toThrow(/无权/)
  })

  it("allows an admin to revoke a non-admin's session", async () => {
    const admin = await seedUser('admin', 'admin2@example.com')
    const visitor = await seedUser('visitor', 'visitor@example.com')
    const sid = 'sid-cross'
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set(`session:${sid}`, 'blob')
    await recordSessionLogin({ sid, userId: visitor.id, userAgent: 'ua', ip: '1.1.1.1' })

    const result = await revokeSessionWithGuard(db, sid, String(admin.id), 'admin')
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

  it('establishes a login, populates user_sessions, then logout clears it', async () => {
    const u = await seedUser('admin', 'establish@example.com')
    const session = await getRequestSession(new Request('http://localhost/'))
    const request = new Request('http://localhost/', { headers: { 'User-Agent': 'vitest' } })

    const result = await establishLoginSession(db, session, u as any, request, '127.0.0.1')
    expect(result.sid).toMatch(/^[0-9a-f-]+$/)
    expect(result.setCookie).toContain('__session=')

    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    expect(await redis.sismember(USER_SET_KEY(u.id), result.sid)).toBe(1)

    // Now login again with a fresh session for logout flow.
    const session2 = await getRequestSession(
      new Request('http://localhost/', { headers: { Cookie: result.setCookie.split(';')[0] } }),
    )
    await logout(session2)
    expect(userSession(session2)).toBeUndefined()
  })

  it('revokes other sessions when revokeOtherSessions is set', async () => {
    const u = await seedUser('admin', 'revoke-others@example.com')
    const redis = (await import('@/server/infra/redis/storage')).redisInstance()
    await redis.set('session:existing', 'blob')
    await redis.sadd(USER_SET_KEY(u.id), 'existing')

    const session = await getRequestSession(new Request('http://localhost/'))
    await establishLoginSession(db, session, u as any, new Request('http://localhost/'), '127.0.0.1', {
      revokeOtherSessions: true,
    })
    expect(await redis.sismember(USER_SET_KEY(u.id), 'existing')).toBe(0)
  })
})

describe('auth/primitives — resolveSessionContext', () => {
  it('returns a session with no user for a fresh anonymous request', async () => {
    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext(db, new Request('http://localhost/'))
    expect(result.user).toBeUndefined()
    expect(result.role).toBeNull()
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

    const result = await handleOtpCancel(session, '/admin')
    expect(result.type).toBe('redirect')
    if (result.type === 'redirect') {
      expect(result.to).toContain('signin')
      expect(result.to).toContain(encodeURIComponent('/admin'))
    }
    expect(session.get('pendingOtpUser')).toBeUndefined()
    expect(session.get('otpFailCount')).toBeUndefined()
  })
})

describe('auth/otp-flow — handleCredentialLogin', () => {
  it('rejects an empty body with a Chinese error message', async () => {
    const session = await getRequestSession(new Request('http://localhost/'))
    const formData = new FormData()
    const result = await handleCredentialLogin(
      db,
      session,
      '127.0.0.1',
      new Request('http://localhost/'),
      formData,
      '/admin',
    )
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('邮箱')
    }
  })

  it('returns the invalid-credentials error when the user cannot be verified', async () => {
    const session = await getRequestSession(new Request('http://localhost/'))
    const formData = new FormData()
    formData.set('email', 'missing@example.com')
    formData.set('password', 'whatever')
    const result = await handleCredentialLogin(
      db,
      session,
      '127.0.0.1',
      new Request('http://localhost/'),
      formData,
      '/admin',
    )
    expect(result.type).toBe('error')
  })
})
