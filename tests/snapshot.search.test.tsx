import { describe, expect, it } from 'vite-plus/test'

import type { ClientPostWithMetadata } from '@/shared/types/catalog'

import { PostListingBody } from '@/ui/public/post/PostListViews'

import { makePost } from './_helpers/catalog'
import { renderInRouter } from './_helpers/render'

function withMetadata(post: ReturnType<typeof makePost>): ClientPostWithMetadata {
  return { ...post, meta: { likes: 0, views: 0, comments: 0 } }
}

describe('snapshot: PostListingBody (search variant)', () => {
  it('renders the empty-results state for a search query', () => {
    const html = renderInRouter(
      <PostListingBody
        title="【react】搜索结果"
        resolvedPosts={[]}
        pageNum={1}
        totalPage={0}
        rootPath="/search/react"
        alwaysRenderPagination={false}
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('【react】搜索结果')
    expect(html).toContain('404')
    expect(html).toContain('抱歉，没有你要找的内容...')
  })

  it('renders a search results page with posts (pagination suppressed)', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'react-tips',
          title: 'React tips',
          permalink: '/posts/react-tips',
          date: new Date('2024-04-01T00:00:00.000Z'),
        }),
      ),
    ]
    const html = renderInRouter(
      <PostListingBody
        title="【react】搜索结果"
        resolvedPosts={posts}
        pageNum={1}
        totalPage={1}
        rootPath="/search/react"
        alwaysRenderPagination={false}
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('【react】搜索结果')
    expect(html).toContain('React tips')
    expect(html).toContain('/posts/react-tips')
    expect(html).toContain('2024-04-01')
  })
})
