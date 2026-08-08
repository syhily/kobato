import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { weakEtag } from '@/server/infra/http/etag'

// The `content.*` read procedures over the real RPCHandler JSON round-trip:
// union signals (redirect / not-modified), NOT_FOUNDs, and happy-path payloads.

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

const publishedBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Published body.' }],
  },
]

async function seedPost(
  opts: Partial<typeof postTable.$inferInsert> & { body?: PortableTextBody } = {},
): Promise<number> {
  const { body, ...meta } = opts
  const rows = await db
    .insert(postTable)
    .values({
      slug: meta.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Untitled react notes',
      summary: 'react summary',
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

/** A draft post: unpublished, hidden, no published revision pointer, one draft revision. */
async function seedDraftPost(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title, published: false, visible: false, publishedRevisionId: null })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'draft', body: publishedBody })
  return postId
}

async function seedPage(
  opts: Partial<typeof pageTable.$inferInsert> & { body?: PortableTextBody; draftBody?: PortableTextBody } = {},
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
  if (meta.published ?? true) {
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: body ?? [] })
      .returning({ id: contentTable.id })
    await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  }
  if (draftBody !== undefined) {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: pageId,
      revisionNo: (meta.published ?? true) ? 2 : 1,
      status: 'draft',
      body: draftBody,
    })
  }
  return pageId
}

type RpcError = { code: string; status: number; message: string }

describe('content.bootstrap', () => {
  it('returns the root data segment (identity, redacted bundle, fonts, csrf token)', async () => {
    const res = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      admin: boolean
      currentUser: unknown
      blogSettings: { siteIdentity: { title: string } } | null
      fonts: { global: unknown[]; post: unknown[]; code: unknown[] } | null
      theme: string | null
      csrfToken: string
    }>(res)

    expect(json.admin).toBe(false)
    expect(json.currentUser).toBeNull()
    expect(json.blogSettings?.siteIdentity.title).toBe('且听书吟')
    // The fixture's font slots are empty — the resolver answers the empty shape.
    expect(json.fonts).toEqual({ global: [], post: [], code: [] })
    expect(json.csrfToken).toBe('test-csrf-token')
  })

  it('parses the theme cookie inside the procedure (dark / light)', async () => {
    const dark = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'kobato-blog-theme=dark' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(dark)).theme).toBe('dark')

    const light = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'other=1; kobato-blog-theme=light' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(light)).theme).toBe('light')
  })

  it('answers a null theme when the cookie is absent or invalid', async () => {
    const absent = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    expect((await parseRpcJson<{ theme: string | null }>(absent)).theme).toBeNull()

    const invalid = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'kobato-blog-theme=neon' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(invalid)).theme).toBeNull()
  })
})

describe('content.home', () => {
  it('returns the ok listing payload', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc('/content/home', {}, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      listing: { pageNum: number; totalPage: number; resolvedPosts: unknown[] }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.listing.pageNum).toBe(1)
    expect(json.listing.totalPage).toBe(2)
    expect(json.listing.resolvedPosts).toHaveLength(6)
  })

  it('answers the overflow redirect as a union member (302 to the last page)', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc('/content/home', { num: '9999' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/page/2', status: 302 })
  })

  it('collapses /page/1 to the canonical root as a redirect union member', async () => {
    const res = await callRpc('/content/home', { num: '1' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/', status: 302 })
  })
})

describe('content.posts.list', () => {
  it('returns the tag-scoped listing', async () => {
    const tagId = await seedTag('typescript', 'typescript')
    const postId = await seedPost({ slug: 'tagged-post' })
    await db.insert(postTag).values({ postId, tagId })

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'tag', slug: 'typescript' } },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; listing: { title?: string; resolvedPosts: { slug: string }[] } }>(
      res,
    )

    expect(json.kind).toBe('ok')
    expect(json.listing.title).toBe('typescript')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('tagged-post')
  })

  it('returns the category-scoped listing', async () => {
    const categoryId = await seedCategory('general', 'general')
    await seedPost({ slug: 'categorized-post', categoryId })

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'category', slug: 'general' } },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      listing: { rootPath: string; title?: string; resolvedPosts: { slug: string }[] }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.listing.rootPath).toBe('/cats/general')
    expect(json.listing.title).toBe('general')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('categorized-post')
  })

  it('answers the category overflow redirect as a union member', async () => {
    const categoryId = await seedCategory('general', 'general')
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, categoryId, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'category', slug: 'general' }, num: '9999' },
      makePublicCtx({ db }),
    )
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/cats/general/page/2', status: 302 })
  })

  it('answers NOT_FOUND for an unknown taxonomy slug', async () => {
    const res = await callRpc('/content/posts/list', { scope: { type: 'tag', slug: 'missing' } }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })
})

describe('content.posts.bySlug', () => {
  it('returns the ok payload and stamps the weak ETag', async () => {
    const postId = await seedPost({ slug: 'hello', title: 'Hello', publishedAt: new Date('2024-01-01') })

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      etag: string
      payload: {
        post: { title: string; permalink: string }
        draftMarker: string | null
        critical: { commentKey: string }
      }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.etag).toBe(weakEtag(['post', String(postId), new Date('2024-01-01')]))
    expect(json.payload.post.title).toBe('Hello')
    expect(json.payload.post.permalink).toBe('/posts/hello')
    expect(json.payload.draftMarker).toBeNull()
    expect(typeof json.payload.critical.commentKey).toBe('string')
  })

  it('answers not-modified when the carried If-None-Match matches the probe ETag', async () => {
    const postId = await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })
    const etag = weakEtag(['post', String(postId), new Date('2024-01-01')])

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello', ifNoneMatch: etag }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string }>(res)

    expect(json).toEqual({ kind: 'not-modified', etag })
  })

  it('answers the canonical 301 for an alias slug', async () => {
    await seedPost({ slug: 'hello', alias: ['hello-old'] })

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello-old' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/posts/hello', status: 301 })
  })

  it('answers NOT_FOUND for an unknown slug', async () => {
    const res = await callRpc('/content/posts/bySlug', { slug: 'missing' }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })

  it('gates the draft preview by role: anonymous 404s, authors see the draft', async () => {
    await seedDraftPost('secret', 'Secret')

    const anonymous = await callRpc('/content/posts/bySlug', { slug: 'secret' }, makePublicCtx({ db }))
    expect(anonymous.status).toBe(404)

    const author = await callRpc('/content/posts/bySlug', { slug: 'secret' }, makeAuthedCtx({ role: 'author', db }))
    expect(author.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; payload: { draftMarker: string | null; post: { title: string } } }>(
      author,
    )
    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('draft')
    expect(json.payload.post.title).toBe('Secret')
  })
})

describe('content.pages.bySlug', () => {
  it('returns the ok payload (footnotes title from settings inside the procedure)', async () => {
    await seedPage({ slug: 'about', title: 'About', publishedAt: new Date('2024-01-01') })

    const res = await callRpc('/content/pages/bySlug', { slug: 'about' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      etag: string | null
      payload: { page: { permalink: string }; showFriends: boolean; footnotesSectionTitle: string }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(typeof json.etag).toBe('string')
    expect(json.payload.page.permalink).toBe('/about')
    expect(json.payload.showFriends).toBe(false)
    expect(json.payload.footnotesSectionTitle).toBe('尾声礼记')
  })

  it('answers not-modified when the carried If-None-Match matches', async () => {
    const pageId = await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })
    // Page ETag inputs: id + publishedRevisionId + publishedAt.
    const rows = await db
      .select({ publishedRevisionId: pageTable.publishedRevisionId })
      .from(pageTable)
      .where(eq(pageTable.id, pageId))
    const etag = weakEtag(['page', String(pageId), rows[0]!.publishedRevisionId, new Date('2024-01-01')])

    const res = await callRpc('/content/pages/bySlug', { slug: 'about', ifNoneMatch: etag }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; etag: string }>(res)

    expect(json).toEqual({ kind: 'not-modified', etag })
  })

  it('301-redirects when the slug belongs to a live post', async () => {
    await seedPost({ slug: 'hello' })

    const res = await callRpc('/content/pages/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/posts/hello', status: 301 })
  })

  it('gates the draft preview by role: anonymous 404s on an unpublished page, admins see the draft', async () => {
    await seedPage({ slug: 'new-page', title: 'New Page Draft', published: false, draftBody: publishedBody })

    const anonymous = await callRpc('/content/pages/bySlug', { slug: 'new-page' }, makePublicCtx({ db }))
    expect(anonymous.status).toBe(404)

    const admin = await callRpc('/content/pages/bySlug', { slug: 'new-page' }, makeAuthedCtx({ role: 'admin', db }))
    expect(admin.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; payload: { draftMarker: string | null } }>(admin)
    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('draft')
  })

  it('never carries a public ETag on an admin draft preview (etag: null)', async () => {
    await seedPage({ slug: 'about', title: 'About', publishedAt: new Date('2024-01-01'), draftBody: publishedBody })

    const res = await callRpc(
      '/content/pages/bySlug',
      { slug: 'about', draft: true },
      makeAuthedCtx({ role: 'admin', db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string | null } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('unpublished-draft')
    expect(json.etag).toBeNull()
  })

  it('skips the published-ETag probe on draft previews (ok even on a matching etag)', async () => {
    const pageId = await seedPage({
      slug: 'about',
      title: 'About',
      publishedAt: new Date('2024-01-01'),
      draftBody: publishedBody,
    })
    const rows = await db
      .select({ publishedRevisionId: pageTable.publishedRevisionId })
      .from(pageTable)
      .where(eq(pageTable.id, pageId))
    const publishedEtag = weakEtag(['page', String(pageId), rows[0]!.publishedRevisionId, new Date('2024-01-01')])

    // `draft: true` must skip the published-ETag probe, or a match answers `not-modified` and the draft never renders.
    const res = await callRpc(
      '/content/pages/bySlug',
      { slug: 'about', draft: true, ifNoneMatch: publishedEtag },
      makeAuthedCtx({ role: 'admin', db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string | null } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('unpublished-draft')
    expect(json.etag).toBeNull()
  })
})

describe('content.comments.byKey', () => {
  it('resolves the metric page_key from the detail critical', async () => {
    await seedPost({ slug: 'hello' })
    const detailRes = await callRpc('/content/posts/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    const detail = await parseRpcJson<{ payload: { critical: { commentKey: string } } }>(detailRes)

    const res = await callRpc(
      '/content/comments/byKey',
      { pageKey: detail.payload.critical.commentKey },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ commentData: { count: number } | null; commentItems: unknown[] }>(res)
    expect(json.commentData?.count ?? 0).toBe(0)
    expect(json.commentItems).toEqual([])
  })

  it('answers NOT_FOUND for an unknown page_key', async () => {
    const res = await callRpc('/content/comments/byKey', { pageKey: 'missing-key' }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })
})

describe('content.search', () => {
  it('answers the empty-keyword bounce as a redirect union member (302 to /)', async () => {
    const res = await callRpc('/content/search', { keyword: '   ' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/', status: 302 })
  })

  it('returns the ok listing for a real query', async () => {
    await seedPost({ slug: 'react-post' })

    const res = await callRpc('/content/search', { keyword: 'react' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; listing: { title?: string; resolvedPosts: { slug: string }[] } }>(
      res,
    )

    expect(json.kind).toBe('ok')
    expect(json.listing.title).toContain('react')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('react-post')
  })

  it('answers the overflow redirect as a union member (302 to the last page)', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `react-${i}` })
    }

    const res = await callRpc('/content/search', { keyword: 'react', num: '9999' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/search/react/page/2', status: 302 })
  })
})

describe('content.categories.list', () => {
  it('returns every category', async () => {
    await seedCategory('general', 'general')

    const res = await callRpc('/content/categories/list', undefined, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ categories: { name: string; slug: string }[] }>(res)

    expect(json.categories.map((c) => c.slug)).toContain('general')
  })
})

describe('content.archives', () => {
  it('returns every live post (hidden included, scheduled excluded)', async () => {
    await seedPost({
      slug: 'visible-post',
      publishedAt: new Date('2024-01-02'),
      firstPublishedAt: new Date('2024-01-02'),
    })
    await seedPost({
      slug: 'hidden-post',
      visible: false,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    await seedPost({
      slug: 'scheduled-post',
      publishedAt: new Date('2099-01-01'),
      firstPublishedAt: new Date('2024-01-03'),
    })

    const res = await callRpc('/content/archives', undefined, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ resolvedPosts: { slug: string }[]; listingNowIso: string }>(res)

    expect(json.resolvedPosts.map((p) => p.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(json.listingNowIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
