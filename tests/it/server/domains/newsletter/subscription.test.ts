import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { NewsletterSubscriberRow } from '@/server/infra/db/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { signUnsubscribeId } from '@/server/domains/newsletter/signing'
import { newsletterSubscriber } from '@/server/infra/db/schema/newsletter'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'

const handle = createTestDatabase()
const db: Database = handle.db

const mockFetch = installFetch()

afterAll(async () => {
  closeTestDatabase(handle)
})

function enableNewsletter() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    newsletter: {
      newsletter: { enabled: true, fromName: '', subjectPrefix: '' },
    },
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        host: 'mail.test',
        apiKey: 'TEST-KEY',
        sender: 'noreply@example.com',
      },
    },
  })
  invalidateMailTransportCache()
  mockFetch.enqueue('https://mail.test/api/v1/zsend/emails', new Response(null, { status: 200 }))
}

beforeEach(async () => {
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  enableNewsletter()
})

async function findRow(email: string): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.email, email)).limit(1)
  return rows[0] ?? null
}

function lastMailBody(): { to: string[]; subject: string; html: string } {
  const call = mockFetch.calls.at(-1)
  expect(call).toBeDefined()
  return JSON.parse(call!.init?.body as string)
}

function extractConfirmToken(): string {
  const { html } = lastMailBody()
  const match = html.match(/token=([A-Za-z0-9_-]{43})/)
  expect(match).not.toBeNull()
  return match![1]
}

describe('integration / newsletter', () => {
  it('subscribe → confirm round trip flips the row to confirmed and clears the token', async () => {
    const ctx = makePublicCtx({ db })

    const subscribeRes = await callRpc('/newsletter/subscribe', { email: 'Reader@Example.com' }, ctx)
    expect(subscribeRes.status).toBe(200)

    const pending = await findRow('reader@example.com')
    expect(pending).not.toBeNull()
    expect(pending!.status).toBe('pending')
    expect(pending!.confirmTokenHash).not.toBeNull()

    // The confirm email went out exactly once, addressed to the subscriber.
    expect(mockFetch.calls).toHaveLength(1)
    expect(lastMailBody().to).toEqual(['reader@example.com'])

    const confirmRes = await callRpc('/newsletter/confirm', { token: extractConfirmToken() }, ctx)
    expect(confirmRes.status).toBe(200)

    const confirmed = await findRow('reader@example.com')
    expect(confirmed!.status).toBe('confirmed')
    expect(confirmed!.confirmTokenHash).toBeNull()
    expect(confirmed!.confirmTokenExpiresAt).toBeNull()
    expect(confirmed!.confirmedAt).not.toBeNull()
  })

  it('dedupes by normalized email and rotates the token on re-subscribe', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/newsletter/subscribe', { email: 'dup@example.com' }, ctx)
    mockFetch.enqueue('https://mail.test/api/v1/zsend/emails', new Response(null, { status: 200 }))
    const first = await findRow('dup@example.com')

    const resub = await callRpc('/newsletter/subscribe', { email: 'Dup@Example.COM' }, ctx)
    expect(resub.status).toBe(200)
    const second = await findRow('dup@example.com')

    const all = await db.select().from(newsletterSubscriber)
    expect(all).toHaveLength(1)
    expect(second!.id).toBe(first!.id)
    expect(second!.status).toBe('pending')
    expect(second!.confirmTokenHash).not.toBe(first!.confirmTokenHash)
    // Both subscribes sent a confirm email.
    expect(mockFetch.calls).toHaveLength(2)
  })

  it('does not resend confirmation to an already-confirmed subscriber', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/newsletter/subscribe', { email: 'stay@example.com' }, ctx)
    await callRpc('/newsletter/confirm', { token: extractConfirmToken() }, ctx)

    const again = await callRpc('/newsletter/subscribe', { email: 'stay@example.com' }, ctx)
    expect(again.status).toBe(200)
    // Still exactly one confirm email — a confirmed row is a silent no-op.
    expect(mockFetch.calls).toHaveLength(1)
    expect((await findRow('stay@example.com'))!.status).toBe('confirmed')
  })

  it('rejects a bad confirm token and a replayed (single-use) one', async () => {
    const ctx = makePublicCtx({ db })

    const bad = await callRpc('/newsletter/confirm', { token: 'not-a-real-token' }, ctx)
    expect(bad.status).toBe(400)

    await callRpc('/newsletter/subscribe', { email: 'once@example.com' }, ctx)
    const token = extractConfirmToken()
    expect((await callRpc('/newsletter/confirm', { token }, ctx)).status).toBe(200)
    // Replay: the hash was cleared on confirm, so the link is dead.
    expect((await callRpc('/newsletter/confirm', { token }, ctx)).status).toBe(400)
  })

  it('unsubscribes via the signed link and stays idempotent on re-click', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/newsletter/subscribe', { email: 'bye@example.com' }, ctx)
    await callRpc('/newsletter/confirm', { token: extractConfirmToken() }, ctx)
    const row = await findRow('bye@example.com')
    const id = row!.id.toString()
    const sig = signUnsubscribeId(row!.id)

    const tampered = sig.endsWith('0') ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`
    const forged = await callRpc('/newsletter/unsubscribe', { id, sig: tampered }, ctx)
    expect(forged.status).toBe(400)
    expect((await findRow('bye@example.com'))!.status).toBe('confirmed')

    const first = await callRpc('/newsletter/unsubscribe', { id, sig }, ctx)
    expect(first.status).toBe(200)
    const unsubscribed = await findRow('bye@example.com')
    expect(unsubscribed!.status).toBe('unsubscribed')
    expect(unsubscribed!.unsubscribedAt).not.toBeNull()

    // Re-click — never 404.
    const second = await callRpc('/newsletter/unsubscribe', { id, sig }, ctx)
    expect(second.status).toBe(200)

    // Unknown id — also a quiet success (no enumeration).
    const unknown = await callRpc('/newsletter/unsubscribe', { id: '999999', sig: signUnsubscribeId(999999) }, ctx)
    expect(unknown.status).toBe(200)
  })

  it('rejects bot submissions via the honeypot field', async () => {
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/newsletter/subscribe', { email: 'bot@example.com', subtitle: 'spammy' }, ctx)
    expect(res.status).toBe(400)
    expect(await findRow('bot@example.com')).toBeNull()
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('rejects subscribe when the section is disabled', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/newsletter/subscribe', { email: 'off@example.com' }, ctx)
    expect(res.status).toBe(400)
    expect(await findRow('off@example.com')).toBeNull()
  })
})
