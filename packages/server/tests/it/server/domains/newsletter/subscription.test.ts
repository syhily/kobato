import type { NewsletterSubscriberRow } from '@kobato/db/types'

import { newsletterSubscriber } from '@kobato/db/schema/newsletter'
import { signUnsubscribeId } from '@kobato/server/domains/newsletter/signing'
import { invalidateMailTransportCache } from '@kobato/server/infra/email/sender'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { callRpc } from '@kobato/server/tests/utils/rpc-call'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { installFetch } from '@kobato/test/fetch'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const mockFetch = installFetch()

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
        transport: 'mailgun',
        mailgunDomain: 'mail.test',
        mailgunApiKey: 'TEST-KEY',
        sender: 'noreply@example.com',
      },
    },
  })
  invalidateMailTransportCache()
  mockFetch.enqueue('https://api.mailgun.net/v3/mail.test/messages', new Response(null, { status: 200 }))
}

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  enableNewsletter()
})

async function findRow(email: string): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.email, email)).limit(1)
  return rows[0] ?? null
}

function lastMailBody(): { to: string; subject: string; html: string } {
  const call = mockFetch.calls.at(-1)
  expect(call).toBeDefined()
  const body = call!.init?.body as FormData
  return { to: body.get('to') as string, subject: body.get('subject') as string, html: body.get('html') as string }
}

function extractConfirmToken(): string {
  const { html } = lastMailBody()
  const match = /token=([A-Za-z0-9_-]{43})/.exec(html)
  expect(match).not.toBeNull()
  return match![1]
}

describe('integration / newsletter', () => {
  it('subscribe → confirm round trip flips the row to confirmed and clears the token', async () => {
    const ctx = makePublicCtx({ db })

    const subscribeRes = await callRpc('/account/newsletter/subscribe', { email: 'Reader@Example.com' }, ctx)
    expect(subscribeRes.status).toBe(200)

    const pending = await findRow('reader@example.com')
    expect(pending).not.toBeNull()
    expect(pending!.status).toBe('pending')
    expect(pending!.confirmTokenHash).not.toBeNull()

    expect(mockFetch.calls).toHaveLength(1)
    expect(lastMailBody().to).toBe('reader@example.com')

    const confirmRes = await callRpc('/account/newsletter/confirm', { token: extractConfirmToken() }, ctx)
    expect(confirmRes.status).toBe(200)

    const confirmed = await findRow('reader@example.com')
    expect(confirmed!.status).toBe('confirmed')
    expect(confirmed!.confirmTokenHash).toBeNull()
    expect(confirmed!.confirmTokenExpiresAt).toBeNull()
    expect(confirmed!.confirmedAt).not.toBeNull()
  })

  it('dedupes by normalized email and rotates the token on re-subscribe', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/account/newsletter/subscribe', { email: 'dup@example.com' }, ctx)
    mockFetch.enqueue('https://api.mailgun.net/v3/mail.test/messages', new Response(null, { status: 200 }))
    const first = await findRow('dup@example.com')

    const resub = await callRpc('/account/newsletter/subscribe', { email: 'Dup@Example.COM' }, ctx)
    expect(resub.status).toBe(200)
    const second = await findRow('dup@example.com')

    const all = await db.select().from(newsletterSubscriber)
    expect(all).toHaveLength(1)
    expect(second!.id).toBe(first!.id)
    expect(second!.status).toBe('pending')
    expect(second!.confirmTokenHash).not.toBe(first!.confirmTokenHash)
    expect(mockFetch.calls).toHaveLength(2)
  })

  it('does not resend confirmation to an already-confirmed subscriber', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/account/newsletter/subscribe', { email: 'stay@example.com' }, ctx)
    await callRpc('/account/newsletter/confirm', { token: extractConfirmToken() }, ctx)

    const again = await callRpc('/account/newsletter/subscribe', { email: 'stay@example.com' }, ctx)
    expect(again.status).toBe(200)
    expect(mockFetch.calls).toHaveLength(1)
    expect((await findRow('stay@example.com'))!.status).toBe('confirmed')
  })

  it('rejects a bad confirm token and a replayed (single-use) one', async () => {
    const ctx = makePublicCtx({ db })

    const bad = await callRpc('/account/newsletter/confirm', { token: 'not-a-real-token' }, ctx)
    expect(bad.status).toBe(400)

    await callRpc('/account/newsletter/subscribe', { email: 'once@example.com' }, ctx)
    const token = extractConfirmToken()
    expect((await callRpc('/account/newsletter/confirm', { token }, ctx)).status).toBe(200)
    expect((await callRpc('/account/newsletter/confirm', { token }, ctx)).status).toBe(400)
  })

  it('unsubscribes via the signed link and stays idempotent on re-click', async () => {
    const ctx = makePublicCtx({ db })

    await callRpc('/account/newsletter/subscribe', { email: 'bye@example.com' }, ctx)
    await callRpc('/account/newsletter/confirm', { token: extractConfirmToken() }, ctx)
    const row = await findRow('bye@example.com')
    const id = row!.id.toString()
    const sig = signUnsubscribeId(row!.id)

    const tampered = sig.endsWith('0') ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`
    const forged = await callRpc('/account/newsletter/unsubscribe', { id, sig: tampered }, ctx)
    expect(forged.status).toBe(400)
    expect((await findRow('bye@example.com'))!.status).toBe('confirmed')

    const first = await callRpc('/account/newsletter/unsubscribe', { id, sig }, ctx)
    expect(first.status).toBe(200)
    const unsubscribed = await findRow('bye@example.com')
    expect(unsubscribed!.status).toBe('unsubscribed')
    expect(unsubscribed!.unsubscribedAt).not.toBeNull()

    const second = await callRpc('/account/newsletter/unsubscribe', { id, sig }, ctx)
    expect(second.status).toBe(200)

    const unknown = await callRpc(
      '/account/newsletter/unsubscribe',
      { id: '999999', sig: signUnsubscribeId(999999) },
      ctx,
    )
    expect(unknown.status).toBe(200)
  })

  it('rejects bot submissions via the honeypot field', async () => {
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/account/newsletter/subscribe', { email: 'bot@example.com', subtitle: 'spammy' }, ctx)
    expect(res.status).toBe(400)
    expect(await findRow('bot@example.com')).toBeNull()
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('rejects subscribe when the section is disabled', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/account/newsletter/subscribe', { email: 'off@example.com' }, ctx)
    expect(res.status).toBe(400)
    expect(await findRow('off@example.com')).toBeNull()
  })

  it('caps repeated subscribes of one address at 3/hour (per-email limit)', async () => {
    const ctx = makePublicCtx({ db })
    for (let i = 0; i < 3; i++) {
      mockFetch.enqueue('https://api.mailgun.net/v3/mail.test/messages', new Response(null, { status: 200 }))
    }

    for (let i = 0; i < 3; i++) {
      const res = await callRpc('/account/newsletter/subscribe', { email: 'victim@example.com' }, ctx)
      expect(res.status).toBe(200)
    }
    const fourth = await callRpc('/account/newsletter/subscribe', { email: 'Victim@Example.com' }, ctx)
    expect(fourth.status).toBe(429)
    expect(mockFetch.calls).toHaveLength(3)
  })
})
