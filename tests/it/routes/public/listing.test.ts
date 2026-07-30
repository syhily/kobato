import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

// Listing routes (`/cats/:slug`, `/tags/:slug`, `/search/:keyword`) all share
// the same skeleton. We pin the public 404/redirect contracts that are part
// of the URL surface (AGENTS.md says these paths must remain stable forever)
// against the real engine: seeded taxonomy + live posts (one hidden), real
// LIKE search, real listing SEO.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedCategory(name: string, slug: string): Promise<number> {
  const rows = await db.insert(categoryTable).values({ name, slug, cover: '' }).returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug: string): Promise<number> {
  const rows = await db.insert(tagTable).values({ name, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

async function seedPost(opts: {
  slug: string
  categoryId?: number | null
  visible?: boolean
  day?: number
}): Promise<number> {
  const date = new Date(Date.UTC(2024, 0, opts.day ?? 1))
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: `${opts.slug} react notes`,
      // The LIKE corpus covers title + summary — 'react' keeps every seeded
      // post searchable for the /search/:keyword cases.
      summary: 'react summary',
      published: true,
      publishedAt: date,
      firstPublishedAt: date,
      categoryId: opts.categoryId ?? null,
      visible: opts.visible ?? true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function linkTag(postId: number, tagId: number): Promise<void> {
  await db.insert(postTag).values({ postId, tagId })
}

/** The shared catalogue: three visible posts + one hidden, all in the seeded category/tag. */
async function seedCatalog(): Promise<void> {
  const categoryId = await seedCategory('general', 'general')
  const tagId = await seedTag('typescript', 'typescript')
  for (let i = 0; i < 3; i++) {
    const postId = await seedPost({ slug: `post-${i}`, categoryId, day: i + 1 })
    await linkTag(postId, tagId)
  }
  const hiddenId = await seedPost({ slug: 'hidden-post', categoryId, visible: false, day: 4 })
  await linkTag(hiddenId, tagId)
}

const categoryRoute = await import('@/routes/public/category/list')
const tagRoute = await import('@/routes/public/tag/list')
const searchRoute = await import('@/routes/public/search/list')

describe('routes/category.list loader', () => {
  it("404s when the slug doesn't match a known category", async () => {
    await expect(
      categoryRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/cats/missing'),
          db,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload (title/seo) for a real category', async () => {
    await seedCatalog()

    const data = await categoryRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/cats/general'),
        db,
        params: { slug: 'general' },
      }),
    )

    expect(data.title).toBe('general')
    const canonical = data.seo.find(
      (tag) =>
        tag !== null &&
        typeof tag === 'object' &&
        'tagName' in tag &&
        tag.tagName === 'link' &&
        tag.rel === 'canonical',
    ) as { href: string } | undefined
    expect(canonical?.href).toContain('/cats/general')
  })

  it('includes hidden posts for public category visitors', async () => {
    await seedCatalog()

    const data = await categoryRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/cats/general'),
        session: regularSession(),
        db,
        params: { slug: 'general' },
      }),
    )

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })

  it('includes hidden posts for admin category visitors', async () => {
    await seedCatalog()

    const data = await categoryRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/cats/general'),
        session: adminSession(),
        db,
        params: { slug: 'general' },
      }),
    )

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})

describe('routes/tag.list loader', () => {
  it("404s when the slug doesn't match a known tag", async () => {
    await expect(
      tagRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/tags/missing'),
          db,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload for a real tag', async () => {
    await seedCatalog()

    const data = await tagRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/tags/typescript'),
        db,
        params: { slug: 'typescript' },
      }),
    )

    expect(data.title).toContain('typescript')
  })

  it('includes hidden tag posts for public visitors', async () => {
    await seedCatalog()

    const data = await tagRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/tags/typescript'),
        session: regularSession(),
        db,
        params: { slug: 'typescript' },
      }),
    )

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})

describe('routes/search.list loader', () => {
  it('redirects to / when the keyword is empty / whitespace', async () => {
    await expect(
      searchRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/search/'),
          db,
          params: { keyword: '   ' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the search payload with forced noindex SEO for a real query', async () => {
    await seedCatalog()

    const data = await searchRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/search/react'),
        db,
        params: { keyword: 'react' },
      }),
    )

    expect(data.title).toContain('react')
    const robots = data.seo.find(
      (tag) => tag !== null && typeof tag === 'object' && 'name' in tag && tag.name === 'robots',
    ) as { content: string } | undefined
    expect(robots?.content).toContain('noindex')
  })

  it('includes hidden posts in public search results', async () => {
    await seedCatalog()

    const data = await searchRoute.loader(
      makeLoaderArgs({
        request: new Request('http://localhost/search/react'),
        session: regularSession(),
        db,
        params: { keyword: 'react' },
      }),
    )

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})
