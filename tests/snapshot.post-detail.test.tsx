import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { MarkdownHeading } from '@/shared/types/catalog'

import { PostDetailBody } from '@/ui/public/post/PostDetailBody'

import { makePost, makePostList, makeTag } from './_helpers/catalog'
import { renderInRouter } from './_helpers/render'

describe('snapshot: PostDetailBody composed view', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the canonical post detail (TOC + comments + sidebar)', () => {
    const post = makePost({
      slug: 'hello',
      title: 'Hello world',
      permalink: '/posts/hello',
      date: new Date('2024-01-01T00:00:00.000Z'),
      cover: '/images/cover.png',
      toc: true,
    })
    const headings: MarkdownHeading[] = [
      { depth: 2, slug: 'section-a', text: 'Section A' },
      { depth: 3, slug: 'subsection', text: 'Subsection' },
      { depth: 2, slug: 'section-b', text: 'Section B' },
    ]
    const visibleTags = [makeTag({ name: 'typescript', slug: 'typescript' })]
    const sidebar = {
      posts: makePostList(2, { slug: 'side' }),
      tags: visibleTags,
      recentComments: [],
      pendingComments: [],
    }

    const commentsPromise = Promise.resolve({ commentData: null, commentItems: [] })
    const html = renderInRouter(
      <PostDetailBody
        post={post}
        headings={headings}
        visibleTags={visibleTags}
        admin={false}
        likes={7}
        commentKey="https://yufan.me/posts/hello/"
        commentsPromise={commentsPromise}
        sidebar={sidebar}
      >
        <p>
          Post body content with a <a href="https://example.com">link</a>.
        </p>
      </PostDetailBody>,
    )
    expect(html).toContain('Hello world')
    expect(html).toContain('Post body content with a')
    expect(html).toContain('typescript')
    expect(html).toContain('/tags/typescript')
    expect(html).toContain('aria-label="展开文章目录"')
    expect(html).toContain('Section A')
    expect(html).toContain('Subsection')
    expect(html).toContain('Section B')
    expect(html).toContain('data-liked="false"')
    expect(html).toContain('/posts/side-0')
  })

  it('renders without TOC when post.toc=false (markup divergence)', () => {
    const post = makePost({
      slug: 'no-toc',
      title: 'No TOC post',
      permalink: '/posts/no-toc',
      date: new Date('2024-01-01T00:00:00.000Z'),
      toc: false,
    })
    const sidebar = { posts: [], tags: [], recentComments: [], pendingComments: [] }
    const commentsPromise = Promise.resolve({ commentData: null, commentItems: [] })
    const html = renderInRouter(
      <PostDetailBody
        post={post}
        headings={[]}
        visibleTags={[]}
        admin={false}
        likes={0}
        commentKey="https://yufan.me/posts/no-toc/"
        commentsPromise={commentsPromise}
        sidebar={sidebar}
      >
        <p>body</p>
      </PostDetailBody>,
    )
    expect(html).toContain('No TOC post')
    expect(html).toContain('body')
    expect(html).not.toContain('aria-label="展开文章目录"')
  })
})
