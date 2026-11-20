import type { AppLocalization } from '@kobato/settings/app-localization.ts'

import { content as contentTable } from '@kobato/db/schema/content.ts'
import { friend as friendTable } from '@kobato/db/schema/friend.ts'
import { metric as metricTable } from '@kobato/db/schema/metric.ts'
import { page as pageTable } from '@kobato/db/schema/page.ts'
import { post as postTable } from '@kobato/db/schema/post.ts'
import { CACHE_PROFILES } from '@kobato/server/infra/http/headers.ts'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@tests/utils/blog-settings.ts'
import { makeLoaderArgs, unwrapLoaderData } from '@tests/utils/context.ts'
import { clearAllTables, getTestDb } from '@tests/utils/integration-db.ts'
import { emptyLexicalBody } from '@tests/utils/lexical.ts'
import { adminSession, emptySession, regularSession } from '@tests/utils/session.ts'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { RouterContextProvider } from 'react-router'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Session resolution stays controlled; every domain service runs for real
// behind call-through spies.
const postSingle = await import('@kobato/server/domains/posts/services/single.ts')
const pagesPublicQuery = await import('@kobato/server/domains/pages/services/public-query.ts')
const friendsService = await import('@kobato/server/domains/friends/service.ts')
const tagsService = await import('@kobato/server/domains/taxonomies/tags/service.ts')
const detailCritical = await import('@kobato/server/http/loaders/detail-critical.ts')
const bodyHtml = await import('@kobato/server/domains/content/services/body-html.ts')

const realFindPostBySlug = postSingle.findPostBySlug
const realFindPageBySlug = pagesPublicQuery.findPageBySlug
const realListAllFriends = friendsService.listAllFriends
const realGetTagsByNames = tagsService.getTagsByNames
const realLoadDetailCritical = detailCritical.loadDetailCritical
const realResolveBodyHtml = bodyHtml.resolveBodyHtml

const mocks = {
  resolveSessionContext: vi
    .spyOn(await import('@kobato/server/domains/auth/primitives.ts'), 'resolveSessionContext')
    .mockImplementation(async () => ({ session: emptySession(), user: null, dirty: false }) as never),
  findPostBySlug: vi.spyOn(postSingle, 'findPostBySlug').mockImplementation(realFindPostBySlug),
  findPageBySlug: vi.spyOn(pagesPublicQuery, 'findPageBySlug').mockImplementation(realFindPageBySlug),
  listAllFriends: vi.spyOn(friendsService, 'listAllFriends').mockImplementation(realListAllFriends),
  getTagsByNames: vi.spyOn(tagsService, 'getTagsByNames').mockImplementation(realGetTagsByNames),
  loadDetailCritical: vi.spyOn(detailCritical, 'loadDetailCritical').mockImplementation(realLoadDetailCritical),
  resolveBodyHtml: vi.spyOn(bodyHtml, 'resolveBodyHtml').mockImplementation(realResolveBodyHtml),
}

afterAll(() => {
  vi.restoreAllMocks()
})

const db = getTestDb()
const session = regularSession()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedPost(opts: Partial<typeof postTable.$inferInsert> & { body?: unknown } = {}): Promise<number> {
  const { body, ...meta } = opts
  const rows = await db
    .insert(postTable)
    .values({
      slug: meta.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Untitled',
      published: meta.published ?? true,
      publishedAt: meta.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: meta.firstPublishedAt ?? new Date('2024-01-01'),
      visible: meta.visible ?? true,
      ...meta,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: body ?? emptyLexicalBody() })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function seedDraftPost(slug: string, authorId = 1): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title: 'Draft', published: false, visible: false, publishedRevisionId: null, authorId })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'draft', body: emptyLexicalBody() })
  return postId
}

async function seedPage(
  opts: Partial<typeof pageTable.$inferInsert> & { body?: unknown; draftBody?: unknown } = {},
): Promise<number> {
  const { body, draftBody, ...meta } = opts
  const rows = await db
    .insert(pageTable)
    .values({
      slug: meta.slug ?? `page-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Untitled',
      published: meta.published ?? true,
      publishedAt: meta.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: meta.firstPublishedAt ?? new Date('2024-01-01'),
      ...meta,
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: body ?? emptyLexicalBody() })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  if (draftBody !== undefined) {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: pageId,
      revisionNo: 2,
      status: 'draft',
      body: draftBody,
    })
  }
  return pageId
}

async function seedFriend(): Promise<void> {
  await db
    .insert(friendTable)
    .values({ website: 'Alice', homepage: 'https://alice.example', poster: '/images/alice.png' })
}

function gateOnce(mock: (typeof mocks)[keyof typeof mocks]): { release: () => void } {
  const base = mock.getMockImplementation() as (...args: unknown[]) => unknown
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  mock.mockImplementationOnce(((...args: unknown[]) => gate.then(() => base(...args))) as never)
  return { release }
}

const postRoute = await import('@/routes/public/post/detail.tsx')
const pageRoute = await import('@/routes/public/page/detail.tsx')

describe('routes/post.detail loader', () => {
  it('301-redirects a post alias to the canonical slug', async () => {
    await seedPost({ slug: 'hello', alias: ['hello-old'] })
    const result = await postRoute
      .loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello-old'),
          session,
          db,
          params: { slug: 'hello-old' },
        }),
      )
      .then(
        () => null,
        (response: unknown) => response,
      )
    expect(result).toMatchObject({ status: 301 })
    expect((result as Response).headers.get('Location')).toBe('/posts/hello')
  })

  it("404s when the slug isn't a known post", async () => {
    await expect(
      postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/missing'),
          session,
          db,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('404s when the slug is missing for an anonymous visitor', async () => {
    await expect(
      postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/missing'),
          session: emptySession(),
          db,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical post payload for a real slug', async () => {
    await seedPost({ slug: 'hello', title: 'Hello' })

    const data = unwrapLoaderData<{
      post: { title: string; permalink: string }
      bodyHtml: string
      eid: string | null
    }>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello'),
          session,
          db,
          params: { slug: 'hello' },
        }),
      ),
    )

    expect(data.post.title).toBe('Hello')
    expect(data.post.permalink).toBe('/posts/hello')

    expect(data.bodyHtml).toBe('')
    expect(data.eid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('carries the author content language from the row into the SSR post shell', async () => {
    await seedPost({ slug: 'zh-post', title: '中文标题', contentLanguage: 'zh-CN' })

    const data = unwrapLoaderData<{ post: { contentLanguage: string | null } }>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/zh-post'),
          session,
          db,
          params: { slug: 'zh-post' },
        }),
      ),
    )

    expect(data.post.contentLanguage).toBe('zh-CN')
  })
})

function loaderEtag(result: unknown): string | null {
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.ETag ?? null
}

const LOCALIZATION: AppLocalization = {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-MM-dd',
  revision: 'test-boot:0000000001',
  revisions: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE),
}

interface DetailCallOptions {
  ifNoneMatch?: string
  localization?: AppLocalization
  session?: ReturnType<typeof regularSession>
}

async function callPostDetail(
  slug: string,
  { ifNoneMatch, localization = LOCALIZATION, session: callerSession = session }: DetailCallOptions = {},
): Promise<{ etag: string | null; result?: unknown; response?: Response }> {
  try {
    const result = await postRoute.loader(
      makeLoaderArgs({
        request: new Request(
          `http://localhost/posts/${slug}`,
          ifNoneMatch === undefined ? undefined : { headers: { 'If-None-Match': ifNoneMatch } },
        ),
        session: callerSession,
        db,
        params: { slug },
        localization,
      }),
    )
    return { etag: loaderEtag(result), result }
  } catch (error) {
    return { etag: null, response: error as Response }
  }
}

async function callPageDetail(
  slug: string,
  { ifNoneMatch, localization = LOCALIZATION, session: callerSession = session }: DetailCallOptions = {},
): Promise<{ etag: string | null; result?: unknown; response?: Response }> {
  try {
    const result = await pageRoute.loader(
      makeLoaderArgs({
        request: new Request(
          `http://localhost/${slug}`,
          ifNoneMatch === undefined ? undefined : { headers: { 'If-None-Match': ifNoneMatch } },
        ),
        session: callerSession,
        db,
        params: { slug },
        localization,
      }),
    )
    return { etag: loaderEtag(result), result }
  } catch (error) {
    return { etag: null, response: error as Response }
  }
}

describe('routes/post.detail loader — representation ETag', () => {
  it('answers 304 for the same representation with request-localized headers', async () => {
    await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })

    const first = await callPostDetail('hello')
    expect(first.etag).toMatch(/^W\/"/)

    mocks.findPostBySlug.mockClear()
    const second = await callPostDetail('hello', { ifNoneMatch: first.etag! })

    expect(second.response?.status).toBe(304)
    const headers = second.response!.headers
    expect(headers.get('ETag')).toBe(first.etag)
    expect(headers.get('Content-Language')).toBe('zh-CN')
    expect(headers.get('Cache-Control')).toBe(CACHE_PROFILES.detail)
    expect(headers.get('Vary')).toBe('Cookie')

    expect(mocks.findPostBySlug).toHaveBeenCalled()
  })

  it.each([
    ['locale', { locale: 'en-US' as const }],
    ['site time zone', { timeZone: 'America/New_York' }],
    ['date display format', { timeFormat: 'yyyy-LL-dd' }],
    ['settings revision', { revisions: { ...LOCALIZATION.revisions, detail: 'test-boot:0000000002' } }],
  ])('rejects the old tag when the request %s changes', async (_name, override) => {
    await seedPost({ slug: 'hello' })
    const first = await callPostDetail('hello')

    const changed = await callPostDetail('hello', {
      ifNoneMatch: first.etag!,
      localization: { ...LOCALIZATION, ...override },
    })

    expect(changed.response).toBeUndefined()
    expect(changed.etag).not.toBe(first.etag)
  })

  it('answers 304 for a 6+ candidate sidebar pool on a repeat request', async () => {
    await seedPost({ slug: 'hello' })
    for (let i = 0; i < 6; i++) {
      await seedPost({ slug: `filler-${i}`, title: `Filler ${i}` })
    }

    const first = await callPostDetail('hello')
    const data = unwrapLoaderData<{ sidebarPosts: { permalink: string }[] }>(first.result)

    expect(data.sidebarPosts).toHaveLength(5)

    const second = await callPostDetail('hello', { ifNoneMatch: first.etag! })
    expect(second.response?.status).toBe(304)
    expect(second.response?.headers.get('ETag')).toBe(first.etag)
  })

  it('rejects the old tag when the post is republished (new published revision)', async () => {
    const postId = await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })
    const first = await callPostDetail('hello')

    const revisions = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 2, status: 'published', body: emptyLexicalBody() })
      .returning({ id: contentTable.id })
    await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
    const republished = await callPostDetail('hello', { ifNoneMatch: first.etag! })
    expect(republished.response).toBeUndefined()
    expect(republished.etag).not.toBe(first.etag)
  })

  it('rejects the old tag when the sidebar posts change', async () => {
    await seedPost({ slug: 'hello' })
    const first = await callPostDetail('hello')

    await seedPost({ slug: 'sidebar-filler', title: 'Sidebar filler' })

    const withNewSidebar = await callPostDetail('hello', { ifNoneMatch: first.etag! })
    expect(withNewSidebar.response).toBeUndefined()
    expect(withNewSidebar.etag).not.toBe(first.etag)
  })

  it('rejects the old tag when likes or the comment key change', async () => {
    const postId = await seedPost({ slug: 'hello' })
    const first = await callPostDetail('hello')

    const metricWhere = and(eq(metricTable.type, 'post'), eq(metricTable.ownerId, postId))
    await db.update(metricTable).set({ voteUp: 3 }).where(metricWhere)
    const liked = await callPostDetail('hello', { ifNoneMatch: first.etag! })
    expect(liked.response).toBeUndefined()
    expect(liked.etag).not.toBe(first.etag)
    await db.update(metricTable).set({ publicId: randomUUID() }).where(metricWhere)
    const rekeyed = await callPostDetail('hello', { ifNoneMatch: liked.etag! })
    expect(rekeyed.response).toBeUndefined()
    expect(rekeyed.etag).not.toBe(liked.etag)
  })

  it('never stamps or honours a published ETag on a draft preview', async () => {
    await seedDraftPost('draft-post')

    const first = await callPostDetail('draft-post', { session: adminSession() })
    expect(first.response).toBeUndefined()
    expect(first.etag).toBeNull()

    const repeated = await callPostDetail('draft-post', {
      session: adminSession(),
      ifNoneMatch: 'W/"anything"',
    })
    expect(repeated.response).toBeUndefined()
    expect(loaderEtag(repeated.result)).toBeNull()
  })

  it('does not short-circuit an alias hit — the canonical 301 still fires', async () => {
    await seedPost({ slug: 'hello', alias: ['hello-old'] })

    const result = await callPostDetail('hello-old', { ifNoneMatch: 'W/"stale"' })

    expect(result.response).toMatchObject({ status: 301 })
    expect(result.response!.headers.get('Location')).toBe('/posts/hello')
  })
})

describe('routes/post.detail loader — render waterfall', () => {
  it('starts the detail orchestrator without waiting for the tag/sidebar/prerender block', async () => {
    await seedPost({ slug: 'hello' })

    const { release } = gateOnce(mocks.getTagsByNames)
    const pending = postRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/posts/hello'),
        session,
        db,
        params: { slug: 'hello' },
      }),
    )

    await vi.waitFor(() => {
      expect(mocks.loadDetailCritical).toHaveBeenCalled()
    })
    release()
    await pending
  })
})

describe('routes/page.detail loader', () => {
  it('returns the canonical page payload for a real page slug', async () => {
    await seedPage({ slug: 'about', title: 'About' })

    const data = unwrapLoaderData<{ page: { permalink: string }; eid: string | null }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          db,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(data.page.permalink).toBe('/about')
    expect(data.eid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('carries the author content language from the row into the SSR page shell', async () => {
    await seedPage({ slug: 'about-lang', title: 'About', contentLanguage: 'fr-CA' })

    const data = unwrapLoaderData<{ page: { contentLanguage: string | null } }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about-lang'),
          session,
          db,
          params: { slug: 'about-lang' },
        }),
      ),
    )

    expect(data.page.contentLanguage).toBe('fr-CA')
  })

  it('throws instead of re-resolving the session when the canonical request context is missing', async () => {
    const ctx = new RouterContextProvider()

    await expect(
      pageRoute.loader({
        request: new Request('http://localhost/about'),
        context: ctx,
        params: { slug: 'about' },
      } as unknown as Parameters<typeof pageRoute.loader>[0]),
    ).rejects.toThrow('No value found for context')
    expect(mocks.resolveSessionContext).not.toHaveBeenCalled()
  })

  it('301-redirects to /posts/:slug when a page slug actually belongs to a post', async () => {
    await seedPost({ slug: 'hello' })

    try {
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/hello'),
          session,
          db,
          params: { slug: 'hello' },
        }),
      )
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Response)
      const response = err as Response
      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe('/posts/hello')
    }
  })

  it('404s when neither page nor post matches the slug', async () => {
    await expect(
      pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/missing'),
          session,
          db,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('routes/page.detail loader — friends gating', () => {
  it('skips the friends table read when the page hides the section', async () => {
    await seedPage({ slug: 'about' })
    await seedFriend()

    const result = unwrapLoaderData<{ friends: unknown[]; showFriends: boolean }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          db,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(mocks.listAllFriends).not.toHaveBeenCalled()
    expect(result.showFriends).toBe(false)
    expect(result.friends).toEqual([])
  })

  it('loads friends when the page shows the section', async () => {
    await seedPage({ slug: 'links', showFriends: true })
    await seedFriend()
    const result = unwrapLoaderData<{ friends: { website: string }[]; showFriends: boolean }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/links'),
          session,
          db,
          params: { slug: 'links' },
        }),
      ),
    )

    expect(mocks.listAllFriends).toHaveBeenCalled()
    expect(result.showFriends).toBe(true)
    expect(result.friends.map((f) => f.website)).toContain('Alice')
  })
})

describe('routes/page.detail loader — render waterfall', () => {
  it('starts the body_html resolution as soon as the preview resolves, without waiting for friends', async () => {
    await seedPage({ slug: 'links', showFriends: true })

    const { release } = gateOnce(mocks.listAllFriends)
    const pending = pageRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/links'),
        session,
        db,
        params: { slug: 'links' },
      }),
    )

    await vi.waitFor(() => {
      expect(mocks.resolveBodyHtml).toHaveBeenCalled()
    })
    release()
    await pending
  })
})

describe('routes/page.detail loader — representation ETag', () => {
  it('answers 304 for the same representation with request-localized headers', async () => {
    await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })

    const first = await callPageDetail('about')
    expect(first.etag).toMatch(/^W\/"/)

    mocks.findPageBySlug.mockClear()
    const second = await callPageDetail('about', { ifNoneMatch: first.etag! })

    expect(second.response?.status).toBe(304)
    const headers = second.response!.headers
    expect(headers.get('ETag')).toBe(first.etag)
    expect(headers.get('Content-Language')).toBe('zh-CN')
    expect(headers.get('Cache-Control')).toBe(CACHE_PROFILES.detail)
    expect(mocks.findPageBySlug).toHaveBeenCalled()
  })

  it.each([
    ['locale', { locale: 'zh-TW' as const }],
    ['settings revision', { revisions: { ...LOCALIZATION.revisions, detail: 'test-boot:0000000002' } }],
  ])('rejects the old tag when the request %s changes', async (_name, override) => {
    await seedPage({ slug: 'about' })
    const first = await callPageDetail('about')

    const changed = await callPageDetail('about', {
      ifNoneMatch: first.etag!,
      localization: { ...LOCALIZATION, ...override },
    })

    expect(changed.response).toBeUndefined()
    expect(changed.etag).not.toBe(first.etag)
  })

  it('rejects the old tag when the page is republished', async () => {
    const pageId = await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })
    const first = await callPageDetail('about')

    const revisions = await db
      .insert(contentTable)
      .values({ type: 'page', ownerId: pageId, revisionNo: 2, status: 'published', body: emptyLexicalBody() })
      .returning({ id: contentTable.id })
    await db
      .update(pageTable)
      .set({ publishedRevisionId: revisions[0]!.id, publishedAt: new Date('2024-06-01') })
      .where(eq(pageTable.id, pageId))

    const republished = await callPageDetail('about', { ifNoneMatch: first.etag! })
    expect(republished.response).toBeUndefined()
    expect(republished.etag).not.toBe(first.etag)
  })

  it('never stamps or honours a published ETag on a draft preview', async () => {
    await seedPage({
      slug: 'about',
      title: 'About',
      publishedAt: new Date('2024-01-01'),
      draftBody: [],
    })

    const load = (ifNoneMatch?: string) =>
      pageRoute.loader(
        makeLoaderArgs({
          request: new Request(
            'http://localhost/about?draft=true',
            ifNoneMatch === undefined ? undefined : { headers: { 'If-None-Match': ifNoneMatch } },
          ),
          session: adminSession(),
          db,
          params: { slug: 'about' },
          localization: LOCALIZATION,
        }),
      )

    const first = await load()
    expect(loaderEtag(first)).toBeNull()
    const preview = unwrapLoaderData<{ draftMarker: string | null }>(first)
    expect(preview.draftMarker).toBe('unpublished-draft')

    const repeated = unwrapLoaderData<{ draftMarker: string | null }>(await load('W/"anything"'))
    expect(repeated.draftMarker).toBe('unpublished-draft')
  })
})
