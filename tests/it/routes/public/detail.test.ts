import { eq } from 'drizzle-orm'
import { RouterContextProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, emptySession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { friend as friendTable } from '@/server/infra/db/schema/friend'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { weakEtag } from '@/server/infra/http/etag'

// post/page.detail loaders against the real engine; seams: wrapped probes
// gating per-test assertions.

const mocks = vi.hoisted(() => ({
  resolveSessionContext: vi.fn(),
  findPostBySlug: vi.fn(),
  findPageBySlug: vi.fn(),
  listAllFriends: vi.fn(),
  getTagsByNames: vi.fn(),
  loadPublicDetailData: vi.fn(),
  resolveBodyHtml: vi.fn(),
}))

// Wrapped (not replaced): the loaders must never consult it.
vi.mock('@/server/domains/auth/primitives', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/primitives')>(
    '@/server/domains/auth/primitives',
  )
  return { ...actual, resolveSessionContext: mocks.resolveSessionContext }
})

// Wrapped (not replaced): the 304 tests assert the full meta load is skipped.
vi.mock('@/server/domains/posts/services/single', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/posts/services/single')>(
    '@/server/domains/posts/services/single',
  )
  mocks.findPostBySlug.mockImplementation(actual.findPostBySlug)
  return { ...actual, findPostBySlug: mocks.findPostBySlug }
})

// Wrapped (not replaced): the page 304 tests assert `findPageBySlug` is skipped.
vi.mock('@/server/domains/pages/services/public-query', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/pages/services/public-query')>(
    '@/server/domains/pages/services/public-query',
  )
  mocks.findPageBySlug.mockImplementation(actual.findPageBySlug)
  return { ...actual, findPageBySlug: mocks.findPageBySlug }
})

// Wrapped: the full-table read must be skipped when the page hides the section.
vi.mock('@/server/domains/friends/service', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/friends/service')>(
    '@/server/domains/friends/service',
  )
  mocks.listAllFriends.mockImplementation(actual.listAllFriends)
  return { ...actual, listAllFriends: mocks.listAllFriends }
})

// Wrapped: gated so the orchestrator must start without waiting for this read.
vi.mock('@/server/domains/taxonomies/tags/service', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/taxonomies/tags/service')>(
    '@/server/domains/taxonomies/tags/service',
  )
  mocks.getTagsByNames.mockImplementation(actual.getTagsByNames)
  return { ...actual, getTagsByNames: mocks.getTagsByNames }
})

vi.mock('@/server/http/loaders/detail', async () => {
  const actual = await vi.importActual<typeof import('@/server/http/loaders/detail')>('@/server/http/loaders/detail')
  mocks.loadPublicDetailData.mockImplementation(actual.loadPublicDetailData)
  return { ...actual, loadPublicDetailData: mocks.loadPublicDetailData }
})

// Wrapped: the body_html fallback projection runs in parallel with friends.
vi.mock('@/server/domains/content/services/body-html', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/content/services/body-html')>(
    '@/server/domains/content/services/body-html',
  )
  mocks.resolveBodyHtml.mockImplementation(actual.resolveBodyHtml)
  return { ...actual, resolveBodyHtml: mocks.resolveBodyHtml }
})

const db = getTestDb()
const session = regularSession()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedPost(
  opts: Partial<typeof postTable.$inferInsert> & { body?: PortableTextBody } = {},
): Promise<number> {
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
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: body ?? [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function seedPage(
  opts: Partial<typeof pageTable.$inferInsert> & { body?: PortableTextBody } = {},
): Promise<number> {
  const { body, ...meta } = opts
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
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: body ?? [] })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

async function seedFriend(): Promise<void> {
  await db
    .insert(friendTable)
    .values({ website: 'Alice', homepage: 'https://alice.example', poster: '/images/alice.png' })
}

/** Holds one mocked read open until `release` fires, so ordering tests can
 *  observe what the loader starts while the read is still in flight. */
function gateOnce(mock: (typeof mocks)[keyof typeof mocks]): { release: () => void } {
  const base = mock.getMockImplementation() as (...args: unknown[]) => unknown
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  mock.mockImplementationOnce((...args: unknown[]) => gate.then(() => base(...args)))
  return { release }
}

const postRoute = await import('@/routes/public/post/detail')
const pageRoute = await import('@/routes/public/page/detail')

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
    // A missing slug must 404 even anonymously — never leak a draft preview.
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
    // Seeded with a legacy PT body and no projection column — the fallback
    // renders empty rather than failing the page.
    expect(data.bodyHtml).toBe('')
  })
})

// `data()` keeps status/headers under `.init` — the 200 ETag lives there.
function loaderEtag(result: unknown): string | null {
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.ETag ?? null
}

describe('routes/post.detail loader — ETag probe', () => {
  it('answers 304 from the slim probe when If-None-Match matches, skipping the full load', async () => {
    const postId = await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })

    const first = await postRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/posts/hello'),
        session,
        db,
        params: { slug: 'hello' },
      }),
    )
    const etag = loaderEtag(first)
    expect(etag).toBe(weakEtag(['post', String(postId), new Date('2024-01-01')]))

    mocks.findPostBySlug.mockClear()
    const second = await postRoute
      .loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello', { headers: { 'If-None-Match': etag! } }),
          session,
          db,
          params: { slug: 'hello' },
        }),
      )
      .then(
        () => null,
        (response: unknown) => response,
      )

    expect(second).toMatchObject({ status: 304 })
    expect((second as Response).headers.get('ETag')).toBe(etag)
    expect(mocks.findPostBySlug).not.toHaveBeenCalled()
  })

  it('re-runs the full load and stamps a fresh ETag after the post is republished', async () => {
    const postId = await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })
    const staleEtag = weakEtag(['post', String(postId), new Date('2024-01-01')])

    // A republication bumps `published_at` — the ETag input.
    await db
      .update(postTable)
      .set({ publishedAt: new Date('2024-06-01') })
      .where(eq(postTable.id, postId))

    mocks.findPostBySlug.mockClear()
    const result = await postRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/posts/hello', { headers: { 'If-None-Match': staleEtag } }),
        session,
        db,
        params: { slug: 'hello' },
      }),
    )

    expect(mocks.findPostBySlug).toHaveBeenCalled()
    const freshEtag = loaderEtag(result)
    expect(freshEtag).not.toBe(staleEtag)
    expect(freshEtag).toBe(weakEtag(['post', String(postId), new Date('2024-06-01')]))
  })

  it('does not short-circuit an alias hit — the canonical 301 still fires', async () => {
    const postId = await seedPost({ slug: 'hello', alias: ['hello-old'], publishedAt: new Date('2024-01-01') })
    const etag = weakEtag(['post', String(postId), new Date('2024-01-01')])

    const result = await postRoute
      .loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello-old', { headers: { 'If-None-Match': etag } }),
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
})

describe('routes/post.detail loader — render waterfall', () => {
  it('starts the detail orchestrator without waiting for the tag/sidebar/prerender block', async () => {
    await seedPost({ slug: 'hello' })

    // Hold the tags read open — serial composition would reach the orchestrator only after it settles.
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
      expect(mocks.loadPublicDetailData).toHaveBeenCalled()
    })
    release()
    await pending
  })
})

describe('routes/page.detail loader', () => {
  it('returns the canonical page payload for a real page slug', async () => {
    await seedPage({ slug: 'about', title: 'About' })

    const data = unwrapLoaderData<{ page: { permalink: string } }>(
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
  })

  it('throws instead of re-resolving the session when the canonical request context is missing', async () => {
    // ADR-0003: missing canonical request context is a programming error — throws, never consults resolveSessionContext.
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

    // showFriends=false: no full-table scan; the payload stays an honest empty list.
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

    // Hold the friends read open — serial composition would reach the body only after it settles.
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

describe('routes/page.detail loader — ETag probe', () => {
  it('answers 304 from the slim probe when If-None-Match matches, skipping the full load', async () => {
    await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })

    const first = await pageRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/about'),
        session,
        db,
        params: { slug: 'about' },
      }),
    )
    const etag = loaderEtag(first)
    expect(etag).not.toBeNull()

    mocks.findPageBySlug.mockClear()
    const second = await pageRoute
      .loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about', { headers: { 'If-None-Match': etag! } }),
          session,
          db,
          params: { slug: 'about' },
        }),
      )
      .then(
        () => null,
        (response: unknown) => response,
      )

    expect(second).toMatchObject({ status: 304 })
    expect((second as Response).headers.get('ETag')).toBe(etag)
    expect(mocks.findPageBySlug).not.toHaveBeenCalled()
  })

  it('re-runs the full load and stamps a fresh ETag after the page is republished', async () => {
    const pageId = await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })

    const first = await pageRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/about'),
        session,
        db,
        params: { slug: 'about' },
      }),
    )
    const staleEtag = loaderEtag(first)

    // A republication bumps `published_at` — one of the ETag inputs.
    await db
      .update(pageTable)
      .set({ publishedAt: new Date('2024-06-01') })
      .where(eq(pageTable.id, pageId))

    mocks.findPageBySlug.mockClear()
    const result = await pageRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/about', { headers: { 'If-None-Match': staleEtag! } }),
        session,
        db,
        params: { slug: 'about' },
      }),
    )

    expect(mocks.findPageBySlug).toHaveBeenCalled()
    const freshEtag = loaderEtag(result)
    expect(freshEtag).not.toBe(staleEtag)
  })

  it('never 304s a `?draft=true` preview request from the published-ETag probe', async () => {
    await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })

    const first = await pageRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/about'),
        session,
        db,
        params: { slug: 'about' },
      }),
    )
    const etag = loaderEtag(first)

    // A draft preview may swap the body, so the published ETag must not short-circuit it.
    const result = unwrapLoaderData<{ draftMarker: string | null }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about?draft=true', { headers: { 'If-None-Match': etag! } }),
          session: adminSession(),
          db,
          params: { slug: 'about' },
        }),
      ),
    )
    expect(result.draftMarker).toBe('published-draft')
  })
})
