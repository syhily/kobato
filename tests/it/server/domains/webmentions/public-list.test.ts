import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'
import { webmentionPublicRouter } from '@/server/http/controllers/webmention-public.controller'
import { ensureMetric } from '@/server/infra/db/operations/metric'
import { setWebmentionStatus, upsertWebmention } from '@/server/infra/db/operations/webmention'
import { post } from '@/server/infra/db/schema/post'
import { webmention } from '@/server/infra/db/schema/webmention'

// public.webmention.list (split-plan notes-6 §3.1) against the real engine — same discipline as the comment-public suite.
const db = getTestDb()

const TARGET_URL = 'https://example.com/posts/wm-target/'

async function seedLivePost(overrides: Partial<typeof post.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug: 'wm-target',
      title: 'Mentioned Post',
      published: true,
      publishedRevisionId: 1,
      ...overrides,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

/** The real page_key flow: `ensureMetric` yields the public_id the client passes. */
async function seedPageKey(type: 'post' | 'page', ownerId: number): Promise<string> {
  const row = await ensureMetric(db, { type, ownerId })
  return row.publicId
}

async function seedMention(
  source: string,
  status: 'pending' | 'approved' | 'rejected' | 'hidden',
  targetType: 'post' | 'page' = 'post',
  targetOwnerId = 1,
): Promise<number> {
  const { row } = await upsertWebmention(db, {
    sourceUrl: source,
    targetUrl: TARGET_URL,
    status: 'pending',
    type: 'mention',
    targetType,
    targetOwnerId,
    fetchedAt: new Date(),
    verificationStatus: 'verified',
    lastVerifiedAt: new Date(),
    lastError: null,
    verifyFailStreak: 0,
    authorName: 'Jane Doe',
    title: 'Mentioning post',
    summary: null,
    rawPayload: { source, target: TARGET_URL },
  })
  if (status !== 'pending') {
    await setWebmentionStatus(db, row.id, status)
  }
  return row.id
}

async function approvedIds(): Promise<number[]> {
  const rows = await db.select({ id: webmention.id }).from(webmention).where(eq(webmention.status, 'approved'))
  return rows.map((row) => row.id).sort((a, b) => a - b)
}

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('integration / public.webmention.list (headless display feed)', () => {
  it('returns only approved mentions of the target, oldest first', async () => {
    const ownerId = await seedLivePost()
    const pageKey = await seedPageKey('post', ownerId)
    await seedMention('https://sender.example/one', 'pending')
    await seedMention('https://sender.example/two', 'approved')
    await seedMention('https://sender.example/three', 'rejected')
    await seedMention('https://sender.example/four', 'hidden')
    // A mention of a DIFFERENT entity must not leak into this feed.
    const other = await seedLivePost({ slug: 'other-target' })
    await seedMention('https://sender.example/other', 'approved', 'post', other)

    const { webmentions } = await call(
      webmentionPublicRouter.list,
      { page_key: pageKey },
      { context: makePublicCtx({ db }) },
    )

    expect(webmentions).toHaveLength(1)
    expect(webmentions[0]!.sourceUrl).toBe('https://sender.example/two')
    // The public DTO carries display fields only.
    expect(Object.keys(webmentions[0]!).sort()).toEqual(
      ['authorName', 'createdAt', 'id', 'sourceUrl', 'summary', 'title', 'type'].sort(),
    )
  })

  it('answers an honest empty list when the global display switch is off', async () => {
    const ownerId = await seedLivePost()
    const pageKey = await seedPageKey('post', ownerId)
    await seedMention('https://sender.example/two', 'approved')
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: true, displayOnPosts: false } },
    })

    const { webmentions } = await call(
      webmentionPublicRouter.list,
      { page_key: pageKey },
      { context: makePublicCtx({ db }) },
    )

    expect(webmentions).toEqual([])
    expect(await approvedIds()).toHaveLength(1) // the row itself is untouched
  })

  it('answers an honest empty list when the entity toggle is off', async () => {
    const ownerId = await seedLivePost({ webmentionsEnabled: false })
    const pageKey = await seedPageKey('post', ownerId)
    await seedMention('https://sender.example/two', 'approved')

    const { webmentions } = await call(
      webmentionPublicRouter.list,
      { page_key: pageKey },
      { context: makePublicCtx({ db }) },
    )

    expect(webmentions).toEqual([])
  })

  it('404s on an unknown page_key (NOT_FOUND, same as comments)', async () => {
    await expect(
      call(webmentionPublicRouter.list, { page_key: 'no-such-key' }, { context: makePublicCtx({ db }) }),
    ).rejects.toThrow()
  })
})
