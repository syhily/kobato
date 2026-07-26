import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makePost } from '#/_helpers/catalog'
const mocks = vi.hoisted(() => ({
  listClientPosts: vi.fn(),
  listAllPosts: vi.fn(),
  getClientPostsWithMetadata: vi.fn(async (_db: unknown, posts: unknown[]) => posts),
}))

vi.mock('@/server/http/request-context', async () => {
  const { createRequestContextMockModule } = await import('#/_helpers/auth-context-mock')
  return createRequestContextMockModule()
})

vi.mock('@/server/domains/posts/repos/public-query/listing', () => ({
  listClientPosts: mocks.listClientPosts,
  getClientPostsWithMetadata: mocks.getClientPostsWithMetadata,
}))
vi.mock('@/server/domains/posts/repos/public-query/misc', () => ({
  listAllPosts: mocks.listAllPosts,
}))
vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (post: unknown) => post,
    toListingPostCard: (post: unknown) => post,
  }
})

const { loader } = await import('@/routes/public/archives')

const visiblePost = makePost({ slug: 'visible-post' })
const hiddenPost = makePost({ slug: 'hidden-post', visible: false })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listClientPosts.mockResolvedValue([visiblePost, hiddenPost])
})

describe('routes/archives loader', () => {
  it('includes visible=false posts while still excluding scheduled posts', async () => {
    const result = (await loader({
      request: new Request('http://localhost/archives'),
    } as unknown as Parameters<typeof loader>[0])) as { resolvedPosts: Array<{ slug: string }>; listingNowIso: string }

    expect(mocks.listClientPosts).toHaveBeenCalledWith(expect.any(Object), {
      includeHidden: true,
      includeScheduled: false,
      limit: 10_000,
    })
    expect(result.resolvedPosts.map((post) => post.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(typeof result.listingNowIso).toBe('string')
    expect(result.listingNowIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
