import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { NewWebmention } from '@/server/infra/db/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  setWebmentionStatus,
  upsertWebmention,
  upsertWebmentionVerificationFailure,
} from '@/server/infra/db/operations/webmention'
import { webmention } from '@/server/infra/db/schema/webmention'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function mentionValues(overrides: Partial<NewWebmention> = {}): NewWebmention {
  return {
    sourceUrl: 'https://sender.example/mentioning-post',
    targetUrl: 'https://example.com/posts/wm-target/',
    status: 'pending',
    type: 'mention',
    targetType: 'post',
    targetOwnerId: 1,
    fetchedAt: new Date('2026-08-01T00:00:00.000Z'),
    authorName: 'Jane Doe',
    title: 'Mentioning post',
    summary: 'a summary',
    rawPayload: { source: 'https://sender.example/mentioning-post', target: 'https://example.com/posts/wm-target/' },
    ...overrides,
  }
}

async function rowOf(id: number) {
  const rows = await db.select().from(webmention).where(eq(webmention.id, id))
  return rows[0]!
}

describe('integration / upsertWebmention (re-mention update semantics)', () => {
  it('inserts a fresh pair and reports `inserted`', async () => {
    const { row, outcome } = await upsertWebmention(db, mentionValues())
    expect(outcome).toBe('inserted')
    expect(row.status).toBe('pending')
    expect(await db.select().from(webmention)).toHaveLength(1)
  })

  it('refreshes a pending row in place and reports `updated`', async () => {
    const first = await upsertWebmention(db, mentionValues())
    const refetched = new Date('2026-08-02T00:00:00.000Z')
    const second = await upsertWebmention(
      db,
      mentionValues({ fetchedAt: refetched, title: 'Edited title', summary: 'edited summary', type: 'reply' }),
    )

    expect(second.outcome).toBe('updated')
    expect(second.row.id).toBe(first.row.id)
    expect(await db.select().from(webmention)).toHaveLength(1)

    const row = await rowOf(first.row.id)
    expect(row.status).toBe('pending')
    expect(row.title).toBe('Edited title')
    expect(row.summary).toBe('edited summary')
    // The mf2 classification refreshes with the rest of the extraction.
    expect(row.type).toBe('reply')
    expect(row.fetchedAt?.toISOString()).toBe(refetched.toISOString())
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(first.row.updatedAt.getTime())
  })

  it('refreshes the verification state on a successful re-mention', async () => {
    // A failed receive-time check left the row failed with a message.
    const first = await upsertWebmention(
      db,
      mentionValues({
        verificationStatus: 'failed',
        lastVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        lastError: 'source could not be fetched (HTTP 500)',
        verifyFailStreak: 3,
      }),
    )
    expect(first.row.verificationStatus).toBe('failed')

    // The sender re-POSTs and the source recovers: the upsert flips the
    // verification state back to verified and clears the failure.
    const second = await upsertWebmention(
      db,
      mentionValues({
        verificationStatus: 'verified',
        lastVerifiedAt: new Date('2026-08-02T00:00:00.000Z'),
        lastError: null,
        verifyFailStreak: 0,
      }),
    )

    expect(second.outcome).toBe('updated')
    const row = await rowOf(first.row.id)
    expect(row.verificationStatus).toBe('verified')
    expect(row.lastError).toBeNull()
    expect(row.verifyFailStreak).toBe(0)
    expect(row.lastVerifiedAt?.toISOString()).toBe('2026-08-02T00:00:00.000Z')
  })

  it('demotes an approved row back to pending without touching moderatedAt', async () => {
    const first = await upsertWebmention(db, mentionValues())
    await setWebmentionStatus(db, first.row.id, 'approved')
    const moderated = (await rowOf(first.row.id)).moderatedAt
    expect(moderated).not.toBeNull()

    const second = await upsertWebmention(db, mentionValues({ title: 'Edited after approval' }))

    expect(second.outcome).toBe('demoted')
    const row = await rowOf(first.row.id)
    expect(row.status).toBe('pending')
    expect(row.title).toBe('Edited after approval')
    // moderatedAt belongs to the moderation act — a re-mention must not rewrite it.
    expect(row.moderatedAt?.toISOString()).toBe(moderated!.toISOString())
  })

  it('keeps a rejected row rejected and reports `updated`', async () => {
    const first = await upsertWebmention(db, mentionValues())
    await setWebmentionStatus(db, first.row.id, 'rejected')

    const second = await upsertWebmention(db, mentionValues({ title: 'Spam edit attempt' }))

    expect(second.outcome).toBe('updated')
    const row = await rowOf(first.row.id)
    expect(row.status).toBe('rejected')
    expect(row.title).toBe('Spam edit attempt')
  })

  it('resets the failure streak when a row is approved', async () => {
    // A pending row accumulated daily-cycle failures; approval restarts
    // the 7-day window so the hide countdown only counts failures of the
    // APPROVED mention.
    const { row } = await upsertWebmention(
      db,
      mentionValues({
        verificationStatus: 'failed',
        lastVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        lastError: 'source could not be fetched (HTTP 500)',
        verifyFailStreak: 6,
      }),
    )
    await setWebmentionStatus(db, row.id, 'approved')

    const updated = await rowOf(row.id)
    expect(updated.status).toBe('approved')
    expect(updated.verifyFailStreak).toBe(0)
    // The verification state itself is untouched — only the count resets.
    expect(updated.verificationStatus).toBe('failed')
    expect(updated.lastError).toBe('source could not be fetched (HTTP 500)')
  })

  it('folds a same-key race into the ON CONFLICT fallback, reported as `updated`', async () => {
    // Both calls observe an empty pair SELECT before either INSERT runs
    // (node:sqlite resolves each statement in its own microtask), so one
    // of them must hit the unique index and take the conflict fallback —
    // which cannot see the old status and reports `updated` (no notify).
    const [a, b] = await Promise.all([
      upsertWebmention(db, mentionValues({ title: 'Race A' })),
      upsertWebmention(db, mentionValues({ title: 'Race B' })),
    ])

    const outcomes = [a.outcome, b.outcome].sort()
    expect(outcomes).toEqual(['inserted', 'updated'])
    expect(a.row.id).toBe(b.row.id)
    expect(await db.select().from(webmention)).toHaveLength(1)
  })
})

describe('integration / upsertWebmentionVerificationFailure (terminal receive-time failure)', () => {
  const failureValues = (
    error: string,
    overrides: Partial<Parameters<typeof upsertWebmentionVerificationFailure>[1]> = {},
  ) => ({
    sourceUrl: 'https://sender.example/mentioning-post',
    targetUrl: 'https://example.com/posts/wm-target/',
    targetType: 'post' as const,
    targetOwnerId: 1,
    error,
    ...overrides,
  })

  it('inserts a failed pending row for a fresh pair', async () => {
    const row = await upsertWebmentionVerificationFailure(db, failureValues('source does not link to target'))

    expect(row.status).toBe('pending')
    expect(row.verificationStatus).toBe('failed')
    expect(row.lastError).toBe('source does not link to target')
    expect(row.verifyFailStreak).toBe(0)
    expect(row.lastVerifiedAt).not.toBeNull()
  })

  it('refreshes an existing failed row with the new message instead of duplicating', async () => {
    const first = await upsertWebmentionVerificationFailure(db, failureValues('first failure'))
    const second = await upsertWebmentionVerificationFailure(db, failureValues('second failure'))

    expect(second.id).toBe(first.id)
    expect(await db.select().from(webmention)).toHaveLength(1)
    const row = await rowOf(first.id)
    expect(row.lastError).toBe('second failure')
    expect(row.status).toBe('pending')
    expect(row.verificationStatus).toBe('failed')
  })

  it('demotes an approved row back to pending on a failed re-verification', async () => {
    const { row } = await upsertWebmention(db, mentionValues())
    await setWebmentionStatus(db, row.id, 'approved')

    await upsertWebmentionVerificationFailure(db, failureValues('source could not be fetched (HTTP 404)'))

    const updated = await rowOf(row.id)
    expect(updated.status).toBe('pending')
    expect(updated.verificationStatus).toBe('failed')
    expect(updated.lastError).toBe('source could not be fetched (HTTP 404)')
  })

  it('keeps a rejected row rejected on a failed re-send', async () => {
    const { row } = await upsertWebmention(db, mentionValues())
    await setWebmentionStatus(db, row.id, 'rejected')

    await upsertWebmentionVerificationFailure(db, failureValues('spam edit attempt'))

    const updated = await rowOf(row.id)
    expect(updated.status).toBe('rejected')
    expect(updated.verificationStatus).toBe('failed')
  })
})
