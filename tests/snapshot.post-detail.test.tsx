import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { MarkdownHeading } from '@/shared/types/catalog'

import { PostDetailBody } from '@/ui/public/post/PostDetailBody'

import { makePost, makePostList, makeTag } from './_helpers/catalog'
import { renderInRouter } from './_helpers/render'

describe('snapshot: PostDetailBody composed view', () => {
  // Pin a deterministic clock so the TodayCalendar widget produces a stable
  // `images/calendar/YYYY/MMDD.png` URL across CI runs. 12:00 UTC on
  // 2026-04-25 maps to 20:00 in `Asia/Shanghai`, which the blog config uses
  // for date formatting — locking the rendered date to `0425`.
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

    // The Suspense fallback renders synchronously during the first SSR pass;
    // the `<Await>` boundary catches the unresolved promise and the snapshot
    // captures the comments-skeleton chrome instead of the resolved island.
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
    expect(html).toMatchSnapshot()
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
    expect(html).toMatchSnapshot()
  })
})
