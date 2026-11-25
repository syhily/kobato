import type { ClientPostWithMetadata } from '@kobato/catalog/model'

import { makePost } from '@kobato/api/tests/utils/catalog'
import { renderInRouter, renderToHtml } from '@kobato/web-public/tests/utils/render'
import { PostListingBody, PostSquare } from '@kobato/web-public/ui/post/PostListViews'
import { describe, expect, it } from 'vitest'

function withMetadata(post: ReturnType<typeof makePost>): ClientPostWithMetadata {
  return { ...post, meta: { likes: 5, views: 42, comments: 3 } }
}

describe('snapshot: PostListingBody (category/tag/search)', () => {
  it('renders the empty 404 state when no posts', () => {
    const html = renderToHtml(
      <PostListingBody
        title="标签：rust"
        description="描述"
        resolvedPosts={[]}
        pageNum={1}
        totalPage={0}
        rootPath="/tags/rust"
        pagination="auto"
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('404')
    expect(html).toContain('抱歉，没有你要找的内容')
  })

  it('renders a 2-post page with pagination', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'first',
          title: 'First post',
          permalink: '/posts/first',
          date: new Date('2024-01-01T00:00:00.000Z'),
        }),
      ),
      withMetadata(
        makePost({
          slug: 'second',
          title: 'Second post',
          permalink: '/posts/second',
          date: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ),
    ]
    const html = renderInRouter(
      <PostListingBody
        title="分类：技术"
        resolvedPosts={posts}
        pageNum={1}
        totalPage={3}
        rootPath="/cats/tech"
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('First post')
    expect(html).toContain('Second post')
    expect(html).toContain('/posts/first')
    expect(html).toContain('/posts/second')
  })
})

describe('snapshot: PostSquare card', () => {
  it('renders the first/large variant', () => {
    const post = withMetadata(
      makePost({
        slug: 'card',
        title: 'Card title',
        permalink: '/posts/card',
        date: new Date('2024-03-01T00:00:00.000Z'),
      }),
    )
    const html = renderInRouter(<PostSquare post={post} first listingNowIso="2026-04-25T12:00:00.000Z" />)
    expect(html).toContain('Card title')
    expect(html).toContain('/posts/card')
  })

  it('renders the small variant', () => {
    const post = withMetadata(
      makePost({
        slug: 'card-2',
        title: 'Card title',
        permalink: '/posts/card-2',
        date: new Date('2024-03-02T00:00:00.000Z'),
      }),
    )
    const html = renderInRouter(<PostSquare post={post} first={false} listingNowIso="2026-04-25T12:00:00.000Z" />)
    expect(html).toContain('Card title')
    expect(html).toContain('/posts/card-2')
  })
})
