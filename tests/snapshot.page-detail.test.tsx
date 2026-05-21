import { describe, expect, it } from 'vite-plus/test'

import type { MarkdownHeading } from '@/shared/types/catalog'

import { PageDetailBody } from '@/ui/public/post/PageDetailBody'

import { makePage } from './_helpers/catalog'
import { renderInRouter } from './_helpers/render'

describe('snapshot: PageDetailBody composed view', () => {
  it('renders a static page (no comments, no TOC)', () => {
    const page = makePage({
      slug: 'about',
      title: 'About',
      permalink: '/about',
      cover: '/images/about.png',
      toc: false,
      comments: false,
    })
    const commentsPromise = Promise.resolve({ commentData: null, commentItems: [] })
    const html = renderInRouter(
      <PageDetailBody
        page={page}
        headings={[]}
        likes={0}
        commentKey="https://yufan.me/about/"
        commentsPromise={commentsPromise}
      >
        <p>About body</p>
      </PageDetailBody>,
    )
    expect(html).toMatchSnapshot()
  })

  it('renders a page with TOC + comments enabled', () => {
    const page = makePage({
      slug: 'guide',
      title: 'Guide',
      permalink: '/guide',
      cover: '/images/guide.png',
      toc: true,
      comments: true,
    })
    const headings: MarkdownHeading[] = [{ depth: 2, slug: 'intro', text: 'Intro' }]
    // The comments island is rendered behind a `<Suspense fallback>` so the
    // SSR snapshot captures the skeleton shell whether or not the promise
    // resolves synchronously.
    const commentsPromise = Promise.resolve({ commentData: null, commentItems: [] })
    const html = renderInRouter(
      <PageDetailBody
        page={page}
        headings={headings}
        likes={3}
        commentKey="https://yufan.me/guide/"
        commentsPromise={commentsPromise}
      >
        <p>Guide body</p>
      </PageDetailBody>,
    )
    expect(html).toMatchSnapshot()
  })
})
