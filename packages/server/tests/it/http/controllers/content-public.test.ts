import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { seedMetric } from '#/_helpers/db'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'

import { contentPublicRouter } from '@kobato/server/http/controllers/content-public.controller'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { post } from '@kobato/server/infra/db/schema/post'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('public content API — layout', () => {
  it('returns the redacted settings bundle with resolved font slots', async () => {
    const result = await call(contentPublicRouter.layout, {}, { context: makePublicCtx({ db }) })
    expect(result.blogSettings).not.toBeNull()
    // The storage secret value must be redacted exactly like the SSR
    // root loader (same `redactSecretsFromBundle`); the access key ID
    // is not a secret field and passes through.
    expect(result.blogSettings?.assets?.storage?.secretAccessKey).toBe('')
    expect(result.fonts).toHaveProperty('global')
  })
})

describe('public content API — sidebar', () => {
  it('returns the admin flag and recent-comments widget data', async () => {
    const anonymous = await call(contentPublicRouter.sidebar, {}, { context: makePublicCtx({ db }) })
    expect(anonymous.admin).toBe(false)
    expect(anonymous.recentComments).toEqual([])

    const admin = await call(contentPublicRouter.sidebar, {}, { context: makeAuthedCtx({ db, role: 'admin' }) })
    expect(admin.admin).toBe(true)
  })
})

describe('public content API — webmention list', () => {
  it('resolves the page_key and applies both display gates', async () => {
    const publicId = '00000000-0000-0000-0000-0000000000ab'
    await db.insert(metric).values(seedMetric({ publicId, type: 'post', ownerId: 99 }))
    await db.insert(post).values({
      id: 99,
      title: 'gated post',
      slug: 'gated-post',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    })

    // Global switch on + entity flag off → honest empty list.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { displayOnPosts: true, receiveEnabled: true } },
    })
    const hidden = await call(
      contentPublicRouter.listWebmentions,
      { page_key: publicId },
      { context: makePublicCtx({ db }) },
    )
    expect(hidden.webmentions).toEqual([])

    // Unknown page_key → NOT_FOUND (same semantics as the comments list).
    await expect(
      call(contentPublicRouter.listWebmentions, { page_key: 'does-not-exist' }, { context: makePublicCtx({ db }) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
