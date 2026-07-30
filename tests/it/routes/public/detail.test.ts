import { eq } from 'drizzle-orm'
import { RouterContextProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { emptySession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'

// post.detail / page.detail loaders form the most-trafficked SSR endpoints.
// Real engine: posts/pages are seeded rows (meta + published content
// revision) and the loaders, projections, live gate, comments streaming, and
// redirect contracts all run against the in-memory database. The only kept
// seams are the presentational PT renderer and a wrapped (not replaced)
// `resolveSessionContext` so the "no session re-resolution fallback" test
// can assert the loaders never consult it.

const mocks = vi.hoisted(() => ({
  resolveSessionContext: vi.fn(),
}))

// Wrapped (not replaced) so the "no session re-resolution fallback" test
// can assert the loaders never consult it — everything else stays real.
vi.mock('@/server/domains/auth/primitives', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/primitives')>(
    '@/server/domains/auth/primitives',
  )
  return { ...actual, resolveSessionContext: mocks.resolveSessionContext }
})

// Presentational seam — the loader contract under test never renders.
vi.mock('@/ui/pt/render', () => ({
  PortableTextBody: () => null,
}))

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
    // Anonymous requests carry the canonical context with `viewer: null`;
    // a missing slug must still 404 rather than leak a draft preview.
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
      body: unknown[]
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
    expect(data.body).toEqual([])
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
    // ADR-0003: the session re-resolution fallback was deleted. A loader
    // that finds no canonical request context treats that as a
    // programming error and throws — `resolveSessionContext` is never
    // consulted as a fallback.
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
