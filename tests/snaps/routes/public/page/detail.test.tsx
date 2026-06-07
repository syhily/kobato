import { describe, expect, it } from 'vitest'

import type { MarkdownHeading } from '@/shared/types/catalog'

import { makePage } from '#/_helpers/catalog'
import { renderInRouter } from '#/_helpers/render'
import { PageDetailBody } from '@/ui/public/post/PageDetailBody'

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
        commentKey="https://example.com/about/"
        commentsPromise={commentsPromise}
      >
        <p>About body</p>
      </PageDetailBody>,
    )
    expect(html).toContain('About')
    expect(html).toContain('About body')
    expect(html).toContain('/images/about.png')
    expect(html).toContain('data-liked="false"')
    expect(html).not.toContain('aria-label="展开文章目录"')
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
    const commentsPromise = Promise.resolve({ commentData: null, commentItems: [] })
    const html = renderInRouter(
      <PageDetailBody
        page={page}
        headings={headings}
        likes={3}
        commentKey="https://example.com/guide/"
        commentsPromise={commentsPromise}
      >
        <p>Guide body</p>
      </PageDetailBody>,
    )
    expect(html).toContain('Guide')
    expect(html).toContain('Guide body')
    expect(html).toContain('/images/guide.png')
    expect(html).toContain('aria-label="展开文章目录"')
    expect(html).toContain('Intro')
    expect(html).toContain('data-liked="false"')
  })
})
