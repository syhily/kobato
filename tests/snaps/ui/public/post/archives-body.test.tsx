import { describe, expect, it } from 'vitest'

import type { ClientPostWithMetadata } from '@/shared/types/catalog'

import { makePost } from '#/_helpers/catalog'
import { renderInRouter } from '#/_helpers/render'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

function withMetadata(post: ReturnType<typeof makePost>): ClientPostWithMetadata {
  return { ...post, meta: { likes: 0, views: 0, comments: 0 } }
}

describe('snapshot: ArchivesBody', () => {
  it('groups posts by year-month and renders the archive grid', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'january-post',
          title: 'January Post',
          permalink: '/posts/january-post',
          date: new Date('2024-01-15T00:00:00.000Z'),
        }),
      ),
      withMetadata(
        makePost({
          slug: 'february-post',
          title: 'February Post',
          permalink: '/posts/february-post',
          date: new Date('2024-02-10T00:00:00.000Z'),
        }),
      ),
      withMetadata(
        makePost({
          slug: 'january-second',
          title: 'Another January Post',
          permalink: '/posts/january-second',
          date: new Date('2024-01-28T00:00:00.000Z'),
        }),
      ),
    ]

    const html = renderInRouter(<ArchivesBody resolvedPosts={posts} listingNowIso="2026-04-25T12:00:00.000Z" />)

    expect(html).toContain('共 3 篇文章')
    expect(html).toContain('2024 年 1 月')
    expect(html).toContain('本月累计 2 篇')
    expect(html).toContain('2024 年 2 月')
    expect(html).toContain('本月累计 1 篇')
    expect(html).toContain('January Post')
    expect(html).toContain('February Post')
    expect(html).toContain('Another January Post')
    expect(html).toContain('/posts/january-post')
    expect(html).toContain('/posts/february-post')
    expect(html).toContain('/posts/january-second')
  })

  it('renders an empty archive page', () => {
    const html = renderInRouter(<ArchivesBody resolvedPosts={[]} listingNowIso="2026-04-25T12:00:00.000Z" />)
    expect(html).toContain('共 0 篇文章')
  })
})
