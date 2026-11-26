import type { CalendarImageOutput, OgImageOutput } from '@kobato/api/contracts/public/images'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { image as imageTable } from '@kobato/db/sqlite/schema/media'
import { page as pageTable } from '@kobato/db/sqlite/schema/page'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { category as categoryTable } from '@kobato/db/sqlite/schema/taxonomy'
import { wipeCache } from '@kobato/server/infra/cache/file-store'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store'
import { resetCacheCounterMemo } from '@kobato/server/infra/cache/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const { __resetRateLimitsForTests, tryResourceRateLimit } = await import('@kobato/server/infra/rate-limit')
const { imageRouter } = await import('@kobato/server/http/controllers/public/image.controller')

const db = getTestDb()

const COVER_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function seedLivePost(slug: string, overrides: { summary?: string } = {}): Promise<void> {
  const rows = await sqliteOf(db)
    .insert(postTable)
    .values({
      slug,
      title: 'Post',
      summary: overrides.summary ?? 'Summary',
      cover: COVER_DATA_URI,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      visible: true,
    })
    .returning({ id: postTable.id })
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'post', ownerId: rows[0]!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await sqliteOf(db)
    .update(postTable)
    .set({ publishedRevisionId: revisions[0]!.id })
    .where(eq(postTable.id, rows[0]!.id))
}

async function seedLivePage(slug: string): Promise<void> {
  const rows = await sqliteOf(db)
    .insert(pageTable)
    .values({
      slug,
      title: 'Page',
      summary: 'Page summary',
      cover: COVER_DATA_URI,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'page', ownerId: rows[0]!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await sqliteOf(db)
    .update(pageTable)
    .set({ publishedRevisionId: revisions[0]!.id })
    .where(eq(pageTable.id, rows[0]!.id))
}

beforeEach(async () => {
  __resetRateLimitsForTests()
  await clearAllTables(db)
})

async function seedImage(overrides: Partial<typeof imageTable.$inferInsert> = {}) {
  const rows = await sqliteOf(db)
    .insert(imageTable)
    .values({
      storagePath: 'images/test.jpg',
      storageDriver: 's3',
      mimeType: 'image/jpeg',
      width: 100,
      height: 200,
      byteSize: 1234,
      thumbhash: 'abc123',
      ...overrides,
    })
    .returning({ id: imageTable.id })
  return rows[0]!.id
}

describe('imageRouter.resolveThumbhash', () => {
  it('throws TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await tryResourceRateLimit('127.0.0.1')

    const ctx = makePublicCtx({ db })
    await expect(
      call(imageRouter.resolveThumbhash, { src: 'https://assets.example.com/images/test.jpg' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('returns thumbhash, width, and height when image is found', async () => {
    await seedImage()
    const ctx = makePublicCtx({ db })
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://assets.example.com/images/test.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBe('abc123')
    expect(res.width).toBe(100)
    expect(res.height).toBe(200)
  })

  it('returns nulls when image is not found', async () => {
    const ctx = makePublicCtx({ db })
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://assets.example.com/images/missing.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBeNull()
    expect(res.width).toBeNull()
    expect(res.height).toBeNull()
  })
})

interface BinaryOk {
  kind: 'ok'
  body: Blob
  etag?: string
  contentType: string
  cacheControl: string
  contentLanguage: string | null
}

type OgAnswer = OgImageOutput
type CalendarAnswer = CalendarImageOutput

async function callOg(input: { slug: string; category?: boolean }): Promise<OgAnswer> {
  const ctx = makePublicCtx({ db })
  return (await call(imageRouter.og, input, { context: ctx })) as OgAnswer
}

async function callCalendar(input: {
  year: string
  time: string
  theme: 'light' | 'dark'
  ifNoneMatch?: string
}): Promise<CalendarAnswer> {
  const ctx = makePublicCtx({ db })
  return (await call(imageRouter.calendar, input, { context: ctx })) as CalendarAnswer
}

describe('imageRouter.og', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('renders a real PNG for a live post slug', async () => {
    await seedLivePost('og-post')
    const answer = await callOg({ slug: 'og-post' })
    if (answer.kind !== 'ok') {
      throw new Error(`expected an ok answer, got ${JSON.stringify(answer)}`)
    }
    expect(answer.contentType).toBe('image/png')
    expect(answer.cacheControl).toBe('public, max-age=3600')
    expect(answer.contentLanguage).toBeNull()
    expect(answer.etag).toBeUndefined()
    expect(answer.body).toBeInstanceOf(Blob)
    const bytes = new Uint8Array(await answer.body.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('renders a page OG image when no post matches', async () => {
    await seedLivePage('og-page')
    const answer = await callOg({ slug: 'og-page' })
    expect(answer.kind).toBe('ok')
  })

  it('renders the category variant only on the category scope', async () => {
    await sqliteOf(db)
      .insert(categoryTable)
      .values({ name: 'Code', slug: 'code', description: '', cover: COVER_DATA_URI })
    const entity = await callOg({ slug: 'code', category: true })
    expect(entity.kind).toBe('ok')
    const withoutScope = await callOg({ slug: 'code' })
    expect(withoutScope.kind).toBe('redirect')
    expect(withoutScope).toMatchObject({ location: 'https://example.com/images/open-graph.png', cacheControl: null })
  })

  it('answers the branding fallback redirect when no entity resolves', async () => {
    const answer = await callOg({ slug: 'missing' })
    expect(answer).toEqual({
      kind: 'redirect',
      location: 'https://example.com/images/open-graph.png',
      cacheControl: null,
    })
  })

  it('redirects an empty slug to the fallback', async () => {
    const answer = await callOg({ slug: '' })
    expect(answer.kind).toBe('redirect')
  })

  it('counts og renders against the images bucket keyed on the visitor address', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    const first = await callOg({ slug: 'missing' })
    expect(first.kind).toBe('redirect')
    await expect(callOg({ slug: 'missing' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    const otherVisitor = makePublicCtx({ db, clientAddress: '203.0.113.9' })
    await expect(call(imageRouter.og, { slug: 'missing' }, { context: otherVisitor })).resolves.toMatchObject({
      kind: 'redirect',
    })
  })
})

describe('imageRouter.calendar', () => {
  beforeEach(async () => {
    __resetRateLimitsForTests()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    await wipeCache()
    __resetMemoryCacheForTests()
    resetCacheCounterMemo()
  })

  it('answers an ok PNG envelope with the revalidating cache profile and Content-Language', async () => {
    const answer = await callCalendar({ year: '2026', time: '0617', theme: 'light' })
    if (answer.kind !== 'ok') {
      throw new Error(`expected an ok answer, got ${JSON.stringify(answer)}`)
    }
    expect(answer.contentType).toBe('image/png')
    expect(answer.cacheControl).toBe('public, no-cache')
    expect(answer.contentLanguage).toBe('zh-CN')
    expect(answer.etag).toMatch(/^"[0-9a-f]{32}"$/)
    const bytes = new Uint8Array(await answer.body.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('answers 304 semantics through the not-modified case for a matching If-None-Match', async () => {
    const first = await callCalendar({ year: '2026', time: '0617', theme: 'light' })
    if (first.kind !== 'ok') {
      throw new Error('expected an ok answer')
    }
    const cached = await callCalendar({
      year: '2026',
      time: '0617',
      theme: 'light',
      ifNoneMatch: first.etag,
    })
    expect(cached).toMatchObject({
      kind: 'not-modified',
      etag: first.etag,
      contentType: 'image/png',
      cacheControl: 'public, no-cache',
      contentLanguage: 'zh-CN',
    })
  })

  it('keys light and dark independently', async () => {
    const light = await callCalendar({ year: '2026', time: '0617', theme: 'light' })
    const dark = await callCalendar({ year: '2026', time: '0617', theme: 'dark' })
    if (light.kind !== 'ok' || dark.kind !== 'ok') {
      throw new Error('expected ok answers')
    }
    expect(dark.etag).not.toBe(light.etag)
  })

  it('threads the localization locale through the envelope', async () => {
    const ctx = makePublicCtx({ db, localization: { locale: 'zh-TW', timeZone: 'Asia/Taipei' } })
    const answer = (await call(
      imageRouter.calendar,
      { year: '2026', time: '0617', theme: 'light' },
      { context: ctx },
    )) as BinaryOk
    expect(answer.contentLanguage).toBe('zh-TW')
  })

  it.each([
    ['abcd', '0617'],
    ['2026', '1332'],
    ['2026', 'abcd'],
    ['1969', '0617'],
    ['2101', '0617'],
  ])('answers NOT_FOUND for the malformed date %s/%s', async (year, time) => {
    await expect(callCalendar({ year, time, theme: 'light' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('serves the window edges (1970 and 2100)', async () => {
    for (const year of ['1970', '2100']) {
      const answer = await callCalendar({ year, time: '0617', theme: 'light' })
      expect(answer.kind).toBe('ok')
    }
  })

  it('counts calendar renders against the images bucket', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await callCalendar({ year: '2026', time: '0617', theme: 'light' })
    await expect(callCalendar({ year: '2026', time: '0617', theme: 'light' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })

  it('reaches the procedure through the canonical RPC path with a real RPCHandler', async () => {
    const { callRpc } = await import('@kobato/server/tests/utils/rpc-call')
    const res = await callRpc(
      '/public/images/calendar',
      { year: '2026', time: '0617', theme: 'light' },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('multipart/form-data')
    const form = await res.formData()
    const serialized = JSON.parse(String(form.get('data'))) as {
      json: { kind: string; contentType: string; etag: string }
    }
    expect(serialized.json.kind).toBe('ok')
    expect(serialized.json.contentType).toBe('image/png')
    expect(serialized.json.etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(form.get('0')).toBeInstanceOf(Blob)
  })
})
