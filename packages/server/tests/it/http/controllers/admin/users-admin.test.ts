import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch, jsonResponse } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { passkeyCredential } from '@kobato/server/infra/db/schema/passkey'
import { user as userTable, verification } from '@kobato/server/infra/db/schema/user'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The users-admin router against the real engine: real user rows, real
// role/mute guards, real passkey gate (driven by the settings bundle),
// real in-process rate limiter, and audit rows asserted after a batcher
// flush. The only test double is `installFetch` — the Zeabur ZSend
// transport is HTTP, so invite / password-reset delivery is captured at
// the fetch boundary (an officially sanctioned seam).
const { RPCHandler } = await import('@orpc/server/fetch')
const { adminUsersAdminRouter } = await import('@kobato/server/http/controllers/admin/users-admin.controller')
const { __resetRateLimitsForTests } = await import('@kobato/server/infra/rate-limit')
const handler = new RPCHandler(adminUsersAdminRouter)

const db = getTestDb()
const ZSEND_URL = 'https://mail.test/api/v1/zsend/emails'

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

// `audit_log.actor_id` is a real FK to `user.id`, so the acting admin is
// a seeded row whose id becomes the viewer identity.
async function seedViewer(): Promise<number> {
  return seedUser({ name: 'Test User', email: 'test@example.com', role: 'admin' })
}

async function call(path: string, input: unknown, viewerId: number) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makeAuthedCtx({ role: 'admin', userId: String(viewerId), db }) },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `user-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      role: opts.role ?? 'author',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function userRow(id: number) {
  const rows = await db.select().from(userTable).where(eq(userTable.id, id))
  return rows[0]!
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

/** Flip the mail section on with a Zeabur config that routes through `installFetch`. */
function withMailEnabled(bundle: BlogSettingsBundle = TEST_BLOG_SETTINGS_BUNDLE): void {
  setBlogSettingsBundleForTests({
    ...bundle,
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        host: 'mail.test',
        apiKey: 'test-key',
        sender: 'noreply@example.com',
        transport: 'zeabur',
      },
    },
  })
}

function zsendPayload(init: RequestInit | undefined): { to: string[]; bcc?: string[]; subject: string; html: string } {
  return JSON.parse(String(init?.body)) as { to: string[]; bcc?: string[]; subject: string; html: string }
}

describe('admin users-admin controller', () => {
  it('mutes a user', async () => {
    const viewerId = await seedViewer()
    const id = await seedUser({ role: 'author' })

    const response = await call('/mute', { id: String(id), muted: true }, viewerId)
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: { id: string; isMuted: boolean } }>(response)
    expect(body.user.id).toBe(String(id))
    expect(body.user.isMuted).toBe(true)

    // The mute landed in the user row…
    expect((await userRow(id)).isMuted).toBe(true)
    // …and was audited.
    const rows = await auditRowsFor('user_muted')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceId).toBe(String(id))
  })

  it('returns 404 when muting a non-existent user or an admin', async () => {
    const viewerId = await seedViewer()
    const adminId = await seedUser({ role: 'admin' })

    const response = await call('/mute', { id: String(adminId), muted: true }, viewerId)
    expect(response.status).toBe(404)

    // The admin row was not muted, and nothing was audited.
    expect((await userRow(adminId)).isMuted).toBe(false)
    expect(await auditRowsFor('user_muted')).toHaveLength(0)
  })

  it('updates a user role', async () => {
    const viewerId = await seedViewer()
    const id = await seedUser({ role: 'author' })

    const response = await call('/updateRole', { id: String(id), role: 'visitor' }, viewerId)
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: { role: string | null } }>(response)
    expect(body.user.role).toBe('visitor')

    expect((await userRow(id)).role).toBe('visitor')
    const rows = await auditRowsFor('user_role_changed')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceId).toBe(String(id))
  })

  it('invites an author', async () => {
    withMailEnabled()
    const fetchMock = installFetch()
    fetchMock.enqueue(ZSEND_URL, jsonResponse({ ok: true }))
    const viewerId = await seedViewer()

    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' }, viewerId)
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)

    // The author row and its one-shot setup token were committed.
    const rows = await db.select().from(userTable).where(eq(userTable.email, 'bob@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.role).toBe('author')
    expect(rows[0]!.deletedAt).toBeNull()
    const tokens = await db.select().from(verification).where(eq(verification.userId, rows[0]!.id))
    expect(tokens).toHaveLength(1)

    // The invite went out exactly once, to the invitee, BCC'd to the
    // inviter, carrying a setup link on the configured site origin.
    expect(fetchMock.calls).toHaveLength(1)
    expect(fetchMock.calls[0]!.url).toBe(ZSEND_URL)
    const payload = zsendPayload(fetchMock.calls[0]!.init)
    expect(payload.to).toEqual(['bob@example.com'])
    expect(payload.bcc).toEqual(['test@example.com'])
    expect(payload.html).toContain('https://example.com/admin/signin?action=accept-invite')

    const audit = await auditRowsFor('author_invited')
    expect(audit).toHaveLength(1)
    expect(audit[0]!.resourceId).toBe(String(rows[0]!.id))
  })

  it('rejects an invite when rate limited', async () => {
    // Shrink the per-IP invite bucket so the second invite in the window
    // trips; keep the per-email bucket out of the way so the 429 is
    // attributable to the IP guard. Mail stays enabled so the first
    // invite really delivers.
    withMailEnabled({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        inviteIp: { windowSeconds: 60, maxAttempts: 1 },
        inviteEmail: { windowSeconds: 60, maxAttempts: 100 },
      },
    })
    const fetchMock = installFetch()
    fetchMock.enqueue(ZSEND_URL, jsonResponse({ ok: true }))
    const viewerId = await seedViewer()

    expect((await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' }, viewerId)).status).toBe(200)

    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' }, viewerId)
    expect(response.status).toBe(429)

    // The rate-limited attempt never reached the mail transport, and only
    // one author row exists.
    expect(fetchMock.calls).toHaveLength(1)
    expect(await db.select().from(userTable).where(eq(userTable.email, 'bob@example.com'))).toHaveLength(1)
  })

  it('sends a password reset', async () => {
    withMailEnabled()
    const id = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const fetchMock = installFetch()
    fetchMock.enqueue(ZSEND_URL, jsonResponse({ ok: true }))

    const viewerId = await seedViewer()
    const response = await call('/sendPasswordReset', { email: 'alice@example.com' }, viewerId)
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)

    // A reset token row exists for the user…
    const tokens = await db.select().from(verification).where(eq(verification.userId, id))
    expect(tokens).toHaveLength(1)

    // …and the reset mail carries a link on the configured site origin.
    expect(fetchMock.calls).toHaveLength(1)
    const payload = zsendPayload(fetchMock.calls[0]!.init)
    expect(payload.to).toEqual(['alice@example.com'])
    expect(payload.html).toContain('https://example.com/admin/signin?action=resetpassword')

    const audit = await auditRowsFor('password_reset_sent')
    expect(audit).toHaveLength(1)
    expect(audit[0]!.resourceId).toBe(String(id))
  })

  it('clears passkeys for a user', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      security: {
        csrf: TEST_BLOG_SETTINGS_BUNDLE.security!.csrf!,
        cors: TEST_BLOG_SETTINGS_BUNDLE.security!.cors!,
        passkey: { enabled: true },
      },
    })
    const id = await seedUser({ role: 'author' })
    await db.insert(passkeyCredential).values([
      { userId: id, credentialId: 'cred-1', publicKey: Buffer.from('k1') },
      { userId: id, credentialId: 'cred-2', publicKey: Buffer.from('k2') },
    ])

    const viewerId = await seedViewer()
    const response = await call('/clearPasskeys', { id: String(id) }, viewerId)
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: { id: string; passkeyCount: number } }>(response)
    expect(body.user.id).toBe(String(id))
    expect(body.user.passkeyCount).toBe(0)

    // Every credential row for the user is gone.
    expect(await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, id))).toHaveLength(0)

    const audit = await auditRowsFor('passkeys_cleared')
    expect(audit).toHaveLength(1)
    expect(audit[0]!.resourceId).toBe(String(id))
  })

  it('rejects clearPasskeys when the passkey switch is off', async () => {
    // TEST_BLOG_SETTINGS_BUNDLE ships security.passkey.enabled = false.
    const id = await seedUser({ role: 'author' })

    const viewerId = await seedViewer()
    const response = await call('/clearPasskeys', { id: String(id) }, viewerId)
    expect(response.status).toBe(400)
    expect(await auditRowsFor('passkeys_cleared')).toHaveLength(0)
  })
})
