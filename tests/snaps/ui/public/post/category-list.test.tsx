import { describe, expect, it } from 'vitest'

import type { ClientPostWithMetadata } from '@/shared/types/catalog'

import { makePost } from '#/_helpers/catalog'
import { renderInRouter } from '#/_helpers/render'
import { PostListingBody } from '@/ui/public/post/PostListViews'

function withMetadata(post: ReturnType<typeof makePost>): ClientPostWithMetadata {
  return { ...post, meta: { likes: 0, views: 0, comments: 0 } }
}

describe('snapshot: PostListingBody (category variant)', () => {
  it('renders the category-list page with description + posts', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'first',
          title: 'First',
          permalink: '/posts/first',
          date: new Date('2024-01-01T00:00:00.000Z'),
        }),
      ),
      withMetadata(
        makePost({
          slug: 'second',
          title: 'Second',
          permalink: '/posts/second',
          date: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ),
    ]
    const html = renderInRouter(
      <PostListingBody
        title="技术"
        description="Programming, infrastructure, debugging."
        resolvedPosts={posts}
        pageNum={1}
        totalPage={2}
        rootPath="/cats/tech"
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('技术')
    expect(html).toContain('Programming, infrastructure, debugging.')
    expect(html).toContain('First')
    expect(html).toContain('Second')
    expect(html).toContain('/posts/first')
    expect(html).toContain('/posts/second')
    expect(html).toContain('2024-01-01')
    expect(html).toContain('2024-02-01')
  })

  it('renders the deep-paginated category page (no description)', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'third',
          title: 'Third',
          permalink: '/posts/third',
          date: new Date('2024-03-01T00:00:00.000Z'),
        }),
      ),
    ]
    const html = renderInRouter(
      <PostListingBody
        title="技术"
        resolvedPosts={posts}
        pageNum={2}
        totalPage={2}
        rootPath="/cats/tech"
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('技术')
    expect(html).not.toContain('Programming, infrastructure, debugging.')
    expect(html).toContain('Third')
    expect(html).toContain('/posts/third')
    expect(html).toContain('2024-03-01')
  })
})
