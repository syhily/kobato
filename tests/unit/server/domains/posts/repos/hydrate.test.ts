import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'

// Unit matrix for the post-list assembly pipeline (`hydratePostList`):
// revision ('none' | 'published') × images (boolean). Every collaborator
// that would touch the DB is mocked, so this pins which stages run for
// each knob combination — the public listing call sites are one-liners
// over these defaults.

vi.mock('@/server/domains/content/repos/query', () => ({
  hydratePublishedRevisions: vi.fn(async () => new Map()),
}))

vi.mock('@/server/infra/db/operations/post-tag', () => ({
  findTagNamesByPostIds: vi.fn(async () => new Map()),
}))

vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryNamesByIds: vi.fn(async () => new Map()),
}))

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(
    async (
      _db: unknown,
      items: { cover: string; coverThumbhash?: string }[],
      _getUrl: unknown,
      apply: (item: { cover: string; coverThumbhash?: string }, lookup: unknown) => void,
    ) => {
      for (const item of items) {
        apply(item, { thumbhash: 'th', publicUrl: 'https://cdn/cover.png' })
      }
    },
  ),
}))

const { hydratePublishedRevisions } = await import('@/server/domains/content/repos/query')
const { hydrateImageRefs } = await import('@/server/domains/images/services/enhance')
const { findTagNamesByPostIds } = await import('@/server/infra/db/operations/post-tag')
const { findCategoryNamesByIds } = await import('@/server/infra/db/operations/category')
const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')

const db = {} as NodePgDatabase

function metaRow(overrides: Partial<PostMetaRow> = {}): PostMetaRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 1n,
    slug: overrides.slug ?? 'hello',
    title: overrides.title ?? 'Hello',
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '/images/cover.png',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    visible: overrides.visible ?? true,
    publishedAt: overrides.publishedAt ?? now,
    publishedRevisionId: overrides.publishedRevisionId ?? null,
    firstPublishedAt: overrides.firstPublishedAt ?? null,
    authorId: overrides.authorId ?? null,
    categoryId: overrides.categoryId === undefined ? 1n : overrides.categoryId,
    alias: overrides.alias ?? [],
    pinnedAt: overrides.pinnedAt ?? null,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  }
}

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 100n,
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'published',
    body: overrides.body ?? [],
    imageSources: overrides.imageSources ?? [],
    headings: overrides.headings ?? [],
    authorId: overrides.authorId ?? null,
    clientRevisionToken: overrides.clientRevisionToken ?? '00000000-0000-0000-0000-000000000001',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('posts/repos/hydrate — hydratePostList matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] for empty input without touching any collaborator', async () => {
    await expect(hydratePostList(db, [])).resolves.toEqual([])
    expect(findTagNamesByPostIds).not.toHaveBeenCalled()
    expect(findCategoryNamesByIds).not.toHaveBeenCalled()
    expect(hydratePublishedRevisions).not.toHaveBeenCalled()
    expect(hydrateImageRefs).not.toHaveBeenCalled()
  })

  it('resolves category names through the id batch; null and dangling ids yield an empty string', async () => {
    vi.mocked(findCategoryNamesByIds).mockResolvedValue(new Map([[1n, 'Tech']]))
    const posts = await hydratePostList(db, [
      metaRow({ id: 1n, categoryId: 1n }),
      metaRow({ id: 2n, categoryId: null }),
      metaRow({ id: 3n, categoryId: 999n }),
    ])
    expect(findCategoryNamesByIds).toHaveBeenCalledWith(db, [1n, 999n])
    expect(posts[0]?.category).toBe('Tech')
    expect(posts[1]?.category).toBe('')
    expect(posts[2]?.category).toBe('')
  })

  it('revision:none + images (defaults): tag batch + covers, empty body', async () => {
    vi.mocked(findTagNamesByPostIds).mockResolvedValue(new Map([[1n, ['react']]]))
    const posts = await hydratePostList(db, [metaRow({ id: 1n, publishedRevisionId: 100n })])
    expect(findTagNamesByPostIds).toHaveBeenCalledWith(db, [1n])
    expect(hydratePublishedRevisions).not.toHaveBeenCalled()
    expect(hydrateImageRefs).toHaveBeenCalledTimes(1)
    expect(posts[0]?.tags).toEqual(['react'])
    expect(posts[0]?.body).toEqual([])
    expect(posts[0]?.headings).toEqual([])
    expect(posts[0]?.imageSources).toEqual([])
    expect(posts[0]?.publishedRevisionId).toBe(100n)
    expect(posts[0]?.cover).toBe('https://cdn/cover.png')
    expect(posts[0]?.coverThumbhash).toBe('th')
  })

  it('revision:none + images:false: skips cover hydration', async () => {
    const posts = await hydratePostList(db, [metaRow()], { images: false })
    expect(hydratePublishedRevisions).not.toHaveBeenCalled()
    expect(hydrateImageRefs).not.toHaveBeenCalled()
    expect(posts[0]?.cover).toBe('/images/cover.png')
    expect(posts[0]?.coverThumbhash).toBeUndefined()
  })

  it('revision:published + images: joins bodies/headings from the published revision', async () => {
    const body = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] },
    ]
    const headings = [{ depth: 2, text: 'Hi', slug: 'hi' }]
    vi.mocked(hydratePublishedRevisions).mockResolvedValue(
      new Map([[100n, contentRow({ id: 100n, body, headings, imageSources: ['images/x.jpg'] })]]),
    )
    const metas = [metaRow({ id: 1n, publishedRevisionId: 100n }), metaRow({ id: 2n, slug: 'two' })]
    const posts = await hydratePostList(db, metas, { revision: 'published' })
    expect(hydratePublishedRevisions).toHaveBeenCalledWith(db, metas)
    expect(hydrateImageRefs).toHaveBeenCalledTimes(1)
    expect(posts[0]?.body).toEqual(body)
    expect(posts[0]?.headings).toEqual(headings)
    expect(posts[0]?.imageSources).toEqual(['images/x.jpg'])
    // Meta without a published revision id still projects, with an empty body.
    expect(posts[1]?.body).toEqual([])
  })

  it('revision:published + images:false: joins revisions but skips covers', async () => {
    vi.mocked(hydratePublishedRevisions).mockResolvedValue(new Map([[100n, contentRow({ id: 100n })]]))
    const posts = await hydratePostList(db, [metaRow({ publishedRevisionId: 100n })], {
      revision: 'published',
      images: false,
    })
    expect(hydratePublishedRevisions).toHaveBeenCalledTimes(1)
    expect(hydrateImageRefs).not.toHaveBeenCalled()
    expect(posts[0]?.cover).toBe('/images/cover.png')
    expect(posts[0]?.coverThumbhash).toBeUndefined()
  })
})
