import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { runWebmentionReverifyBatch, reverifyWebmention } from '@/server/domains/webmentions/reverify'
import { adminWebmentionsRouter } from '@/server/http/controllers/admin/webmentions.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { pickWebmentionsDueForReverify, upsertWebmention } from '@/server/infra/db/operations/webmention'
import { auditLog } from '@/server/infra/db/schema/config'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { webmention } from '@/server/infra/db/schema/webmention'

const db = getTestDb()
const mockFetch = installFetch()

const SOURCE = 'https://sender.example/mentioning-post'
// The canonical stored target — `resolveWebmentionTarget` re-derives the
// same URL from the live post's slug.
const TARGET = 'https://example.com/posts/wm-target/'
const linkingHtml = (href: string) =>
  `<html><head><title>Mentioning post</title><meta name="author" content="Jane Doe"></head>` +
  `<body><p>I wrote about <a href="${href}">this post</a>.</p></body></html>`

const DAY_MS = 24 * 60 * 60 * 1000
const dueAt = () => new Date(Date.now() - DAY_MS - 60_000) // crossed the 24h waterline
const freshAt = () => new Date(Date.now() - 60_000)

async function seedLivePost(slug = 'wm-target'): Promise<number> {
  const rows = await db
    .insert(post)
    .values({ slug, title: 'Mentioned Post', published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function rowOf(id: number) {
  const rows = await db.select().from(webmention).where(eq(webmention.id, id))
  return rows[0]!
}

async function seedMention(
  overrides: Partial<{
    sourceUrl: string
    status: 'pending' | 'approved' | 'rejected' | 'hidden'
    verificationStatus: 'verified' | 'failed'
    lastVerifiedAt: Date
    lastError: string | null
    verifyFailStreak: number
  }> = {},
): Promise<number> {
  const { row } = await upsertWebmention(db, {
    sourceUrl: SOURCE,
    targetUrl: TARGET,
    status: 'pending',
    type: 'mention',
    targetType: 'post',
    targetOwnerId: 1,
    fetchedAt: new Date(),
    verificationStatus: 'verified',
    lastVerifiedAt: dueAt(),
    lastError: null,
    verifyFailStreak: 0,
    authorName: 'Jane Doe',
    title: 'Mentioning post',
    summary: null,
    rawPayload: { source: SOURCE, target: TARGET },
    ...overrides,
  })
  return row.id
}

beforeEach(async () => {
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('integration / daily re-verification cycle', () => {
  it('re-verifies a due approved mention, keeping it verified with a fresh waterline', async () => {
    await seedLivePost()
    const id = await seedMention({ status: 'approved' })
    mockFetch.enqueue(SOURCE, new Response(linkingHtml(TARGET), { status: 200 }))

    expect(await runWebmentionReverifyBatch(db)).toBe(1)

    const row = await rowOf(id)
    expect(row.status).toBe('approved')
    expect(row.verificationStatus).toBe('verified')
    expect(row.verifyFailStreak).toBe(0)
    expect(row.lastError).toBeNull()
    expect(row.lastVerifiedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('leaves rows inside the 24h window alone', async () => {
    await seedLivePost()
    await seedMention({ status: 'approved', lastVerifiedAt: freshAt() })

    expect(await runWebmentionReverifyBatch(db)).toBe(0)
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('records a failed check with the message and bumps the streak', async () => {
    await seedLivePost()
    const id = await seedMention({ status: 'approved' })
    mockFetch.enqueue(SOURCE, new Response('gone', { status: 404 }))

    expect(await runWebmentionReverifyBatch(db)).toBe(1)

    const row = await rowOf(id)
    expect(row.verificationStatus).toBe('failed')
    expect(row.lastError).toBe('source could not be fetched (HTTP 404)')
    expect(row.verifyFailStreak).toBe(1)
    expect(row.status).toBe('approved')
  })

  it('hides an approved mention on the 7th consecutive daily failure and stops checking it', async () => {
    await seedLivePost()
    const id = await seedMention({ status: 'approved', verifyFailStreak: 6 })
    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })

    expect(await runWebmentionReverifyBatch(db)).toBe(1)
    const row = await rowOf(id)
    expect(row.status).toBe('hidden')
    expect(row.verificationStatus).toBe('failed')
    expect(row.verifyFailStreak).toBe(7)

    // Hidden rows leave the cycle: the next run checks nothing.
    expect(await runWebmentionReverifyBatch(db)).toBe(0)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('recovers a pending failed row to verified while staying pending', async () => {
    await seedLivePost()
    const id = await seedMention({
      status: 'pending',
      verificationStatus: 'failed',
      lastError: 'old error',
      verifyFailStreak: 2,
    })
    mockFetch.enqueue(SOURCE, new Response(linkingHtml(TARGET), { status: 200 }))

    expect(await runWebmentionReverifyBatch(db)).toBe(1)

    const row = await rowOf(id)
    expect(row.status).toBe('pending')
    expect(row.verificationStatus).toBe('verified')
    expect(row.lastError).toBeNull()
    expect(row.verifyFailStreak).toBe(0)
  })

  it('keeps verified pending rows out of the cycle', async () => {
    await seedLivePost()
    await seedMention({ status: 'pending', lastVerifiedAt: dueAt() })

    expect(await runWebmentionReverifyBatch(db)).toBe(0)
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('caps the streak at the hide threshold for pending rows', async () => {
    await seedLivePost()
    const id = await seedMention({
      status: 'pending',
      verificationStatus: 'failed',
      lastError: 'old error',
      verifyFailStreak: 7,
    })
    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })

    expect(await runWebmentionReverifyBatch(db)).toBe(1)

    const row = await rowOf(id)
    expect(row.status).toBe('pending') // only approved rows can hide
    expect(row.verificationStatus).toBe('failed')
    // Bounded: a pending row whose target is gone must not accumulate an
    // unbounded counter (MIN(streak + 1, 7) in the failure write).
    expect(row.verifyFailStreak).toBe(7)
  })

  it('counts a vanished target as a permanent failure toward the streak', async () => {
    // The post is deleted: the target no longer resolves.
    const id = await seedMention({ status: 'approved' })

    expect(await runWebmentionReverifyBatch(db)).toBe(1)

    const row = await rowOf(id)
    expect(row.verificationStatus).toBe('failed')
    expect(row.lastError).toBe('target is not a resource on this site')
    expect(row.verifyFailStreak).toBe(1)
    expect(mockFetch.calls).toHaveLength(0)
  })
})

describe('integration / manual re-verification (admin)', () => {
  it('restores a hidden mention on a successful check, resetting the streak', async () => {
    await seedLivePost()
    const id = await seedMention({
      status: 'hidden',
      verificationStatus: 'failed',
      lastError: 'source could not be fetched (HTTP 404)',
      verifyFailStreak: 12,
    })
    mockFetch.enqueue(SOURCE, new Response(linkingHtml(TARGET), { status: 200 }))

    const updated = await reverifyWebmention(db, id.toString())

    expect(updated.status).toBe('approved')
    expect(updated.verificationStatus).toBe('verified')
    expect(updated.verifyFailStreak).toBe(0)
    expect(updated.lastError).toBeNull()
  })

  it('records the failure and throws when the source still fails', async () => {
    await seedLivePost()
    const waterline = dueAt()
    const id = await seedMention({
      status: 'hidden',
      verificationStatus: 'failed',
      lastError: 'old error',
      verifyFailStreak: 9,
      lastVerifiedAt: waterline,
    })
    mockFetch.enqueue(SOURCE, new Response('gone', { status: 404 }))

    await expect(reverifyWebmention(db, id.toString())).rejects.toThrow('source could not be fetched (HTTP 404)')

    // The row keeps its hidden state and the failure message refreshes;
    // the streak is a daily-cycle counter and the 24h waterline must NOT
    // move — an admin's failed attempt cannot delay the next scheduled
    // check.
    const row = await rowOf(id)
    expect(row.status).toBe('hidden')
    expect(row.verificationStatus).toBe('failed')
    expect(row.lastError).toBe('source could not be fetched (HTTP 404)')
    expect(row.verifyFailStreak).toBe(9)
    expect(row.lastVerifiedAt!.getTime()).toBe(waterline.getTime())
  })

  it('404s on an unknown id', async () => {
    await expect(reverifyWebmention(db, '999999')).rejects.toThrow()
  })

  it('refuses to re-verify a rejected row (terminal state)', async () => {
    await seedLivePost()
    const id = await seedMention({ status: 'rejected', verificationStatus: 'failed', lastError: 'spam' })

    await expect(reverifyWebmention(db, id.toString())).rejects.toThrow('不再参与验证')

    // Nothing changed on the row.
    const row = await rowOf(id)
    expect(row.status).toBe('rejected')
    expect(row.verificationStatus).toBe('failed')
    expect(row.lastError).toBe('spam')
    expect(mockFetch.calls).toHaveLength(0)
  })
})

describe('integration / admin reverify procedure (audit + wire)', () => {
  beforeEach(() => {
    initAllBatchers(getDatabaseHandle())
  })

  afterEach(async () => {
    // Flush BEFORE reset (and before the next clearAllTables wipes the
    // seeded admin) — same discipline as the moderation suite.
    await flushAuditLog()
    resetAllBatchers()
  })

  async function seedAdmin(): Promise<number> {
    const rows = await db
      .insert(user)
      .values({
        name: 'Admin',
        email: `admin-${Date.now()}-${Math.random()}@example.com`,
        password: 'hashed',
        role: 'admin',
      })
      .returning({ id: user.id })
    return rows[0]!.id
  }

  it('reverifies through the router, restores the row, and records the audit event', async () => {
    await seedLivePost()
    const adminId = await seedAdmin()
    const id = await seedMention({
      status: 'hidden',
      verificationStatus: 'failed',
      lastError: 'boom',
      verifyFailStreak: 8,
    })
    mockFetch.enqueue(SOURCE, new Response(linkingHtml(TARGET), { status: 200 }))

    const wire = await call(
      adminWebmentionsRouter.reverify,
      { id: id.toString() },
      { context: makeAuthedCtx({ userId: adminId.toString(), role: 'admin', db }) },
    )

    expect(wire.status).toBe('approved')
    expect(wire.verificationStatus).toBe('verified')
    expect(wire.verifyFailStreak).toBe(0)
    expect(wire.lastError).toBeNull()
    expect(wire.id).toBe(id.toString())

    await flushAuditLog()
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'webmention_verified'))
    expect(audits).toHaveLength(1)
    expect(audits[0]!.resourceType).toBe('webmention')
    expect(audits[0]!.resourceId).toBe(id.toString())
  })
})

describe('integration / pickWebmentionsDueForReverify', () => {
  it('picks only cycle rows that crossed the waterline, oldest first', async () => {
    await seedLivePost()
    // Every row needs its own (source, target) pair — the upsert folds
    // same-pair seeds into one row.
    const oldApproved = await seedMention({
      sourceUrl: `${SOURCE}?a=1`,
      status: 'approved',
      lastVerifiedAt: new Date(Date.now() - 3 * DAY_MS),
    })
    await seedMention({ sourceUrl: `${SOURCE}?a=2`, status: 'approved', lastVerifiedAt: freshAt() })
    const pendingFailed = await seedMention({
      sourceUrl: `${SOURCE}?a=3`,
      status: 'pending',
      verificationStatus: 'failed',
      lastVerifiedAt: dueAt(),
    })
    await seedMention({
      sourceUrl: `${SOURCE}?a=4`,
      status: 'hidden',
      verificationStatus: 'failed',
      lastVerifiedAt: dueAt(),
    })
    await seedMention({ sourceUrl: `${SOURCE}?a=5`, status: 'rejected', lastVerifiedAt: dueAt() })

    const picked = await pickWebmentionsDueForReverify(db, new Date(), 10)

    const pickedIds = picked.map((row) => row.id).sort((a, b) => a - b)
    expect(pickedIds).toEqual([oldApproved, pendingFailed].sort((a, b) => a - b))
  })
})
