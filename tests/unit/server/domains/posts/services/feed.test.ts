import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedTaxonomyResolvers } from '@/server/domains/posts/services/feed'
import type { Database } from '@/server/infra/db/database'

// Domain-seam coverage for `selectFeedPosts` — the feed channel's post
// selection sunk out of `render/feed/generator.tsx` (task C4). The
// visibility policy (hidden included, scheduled excluded) and the
// scope-miss → empty-selection rule are pinned here; the renderer only
// wires the taxonomy resolvers (see tests/unit/server/render/feed/).

const listPublicPostsMock = vi.hoisted(() => vi.fn())
const hydratePostListMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/posts/services/public-query', () => ({
  listPublicPosts: listPublicPostsMock,
}))
vi.mock('@/server/domains/posts/repos/hydrate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/domains/posts/repos/hydrate')>()),
  hydratePostList: hydratePostListMock,
}))

const { selectFeedPosts } = await import('@/server/domains/posts/services/feed')

const fakeDb = {} as Database

function makeResolvers(overrides: Partial<FeedTaxonomyResolvers> = {}): FeedTaxonomyResolvers {
  return {
    resolveCategory: vi.fn(async () => null),
    resolveTag: vi.fn(async () => null),
    ...overrides,
  }
}

beforeEach(() => {
  listPublicPostsMock.mockReset()
  hydratePostListMock.mockReset()
  listPublicPostsMock.mockResolvedValue(['meta'])
  hydratePostListMock.mockImplementation(async (_db: unknown, metas: unknown) => metas)
})

describe('selectFeedPosts — feed-channel visibility policy', () => {
  it('includes hidden posts and excludes scheduled ones, with the configured limit', async () => {
    await selectFeedPosts(fakeDb, { limit: 20 }, makeResolvers())

    expect(listPublicPostsMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ includeHidden: true, includeScheduled: false, limit: 20 }),
    )
  })

  it('hydrates the published content revisions (feed items carry bodies)', async () => {
    const posts = await selectFeedPosts(fakeDb, { limit: 20 }, makeResolvers())

    expect(hydratePostListMock).toHaveBeenCalledWith(fakeDb, ['meta'], { revision: 'published' })
    expect(posts).toEqual(['meta'])
  })
})

describe('selectFeedPosts — category/tag scoping', () => {
  it('resolves the category scope to its id before querying', async () => {
    const resolvers = makeResolvers({ resolveCategory: vi.fn(async () => ({ id: 7 })) })

    await selectFeedPosts(fakeDb, { category: 'tech', limit: 20 }, resolvers)

    expect(resolvers.resolveCategory).toHaveBeenCalledWith(fakeDb, 'tech')
    expect(listPublicPostsMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ includeHidden: true, includeScheduled: false, categoryId: 7, limit: 20 }),
    )
  })

  it('returns an empty selection without querying when the category scope misses', async () => {
    const resolvers = makeResolvers()

    const posts = await selectFeedPosts(fakeDb, { category: 'missing', limit: 20 }, resolvers)

    expect(posts).toEqual([])
    expect(listPublicPostsMock).not.toHaveBeenCalled()
  })

  it('resolves the tag scope to its canonical name before querying', async () => {
    const resolvers = makeResolvers({ resolveTag: vi.fn(async () => ({ name: 'React' })) })

    await selectFeedPosts(fakeDb, { tag: 'react', limit: 20 }, resolvers)

    expect(resolvers.resolveTag).toHaveBeenCalledWith(fakeDb, 'react')
    expect(listPublicPostsMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ includeHidden: true, includeScheduled: false, tag: 'React', limit: 20 }),
    )
  })

  it('returns an empty selection without querying when the tag scope misses', async () => {
    const resolvers = makeResolvers()

    const posts = await selectFeedPosts(fakeDb, { tag: 'missing', limit: 20 }, resolvers)

    expect(posts).toEqual([])
    expect(listPublicPostsMock).not.toHaveBeenCalled()
  })

  it('does not touch the tag resolver when a category scope is given (category wins)', async () => {
    const resolvers = makeResolvers({ resolveCategory: vi.fn(async () => ({ id: 7 })) })

    await selectFeedPosts(fakeDb, { category: 'tech', limit: 20 }, resolvers)

    expect(resolvers.resolveTag).not.toHaveBeenCalled()
  })
})
