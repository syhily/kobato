import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { NewWebmention } from '@/server/infra/db/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { setWebmentionStatus, upsertWebmention } from '@/server/infra/db/operations/webmention'
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
