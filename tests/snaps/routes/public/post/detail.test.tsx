import { describe, expect, it } from 'vitest'

import { makePost, makeTag } from '#/_helpers/catalog'
import { prerenderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import PostDetailRoute from '@/routes/public/post/detail'
import { toDetailPostShell } from '@/shared/types/catalog'

describe('snapshot: routes/public/post/detail', () => {
  it('renders the post detail route', async () => {
    const Route = asRoute(PostDetailRoute)
    const post = toDetailPostShell(
      makePost({
        slug: 'hello',
        title: 'Hello world',
        permalink: '/posts/hello',
        date: new Date('2024-01-01T00:00:00.000Z'),
        toc: true,
        headings: [{ depth: 2, slug: 'intro', text: 'Intro' }],
      }),
    )
    const visibleTags = [makeTag({ name: 'typescript', slug: 'typescript' })]
    // The TOC sits behind a lazy boundary — only streamed SSR output carries it.
    const html = stableHtml(
      await prerenderInRouter(
        <Route
          loaderData={{
            post,
            body: [{ _type: 'block', children: [{ _type: 'span', _key: 's1', text: 'Hello body' }] }],
            visibleTags,
            sidebarPosts: [],
            tags: [],
            detail: {
              admin: false,
              likes: 3,
              commentKey: 'https://example.com/posts/hello/',
              comments: Promise.resolve({ commentData: null, commentItems: [] }),
              webmentions: Promise.resolve([]),
              recentComments: [],
              currentUser: null,
            },
            imageMeta: {},
            draftMarker: null,
          }}
        />,
        '/posts/hello',
      ),
    )
    expect(html).toContain('Hello world')
    expect(html).toContain('Intro')
  })
})
