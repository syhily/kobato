import { routeMeta } from '@kobato/shared/seo/meta'
import { describe, expect, it } from 'vitest'

// Snapshot the full meta-tag head emitted for the three canonical page kinds
// (default home, post detail, listing). A regression here changes the SEO
// surface visible to crawlers, so we want it to surface as a PR diff.
describe('snapshot: SEO meta head', () => {
  it('default (home / website) head', () => {
    const meta = routeMeta()
    expect(meta).toMatchSnapshot()
  })

  it('post detail head includes article:tag entries', () => {
    const meta = routeMeta({
      title: '测试文章',
      description: 'summary text',
      pageUrl: '/posts/hello',
      canonical: true,
      variant: {
        kind: 'post',
        article: {
          date: new Date('2024-01-02T03:04:05.000Z'),
          updated: new Date('2024-02-03T00:00:00.000Z'),
          category: '技术',
          tags: ['typescript', 'react'],
        },
      },
    })
    expect(meta).toMatchSnapshot()
  })

  it('listing head with paging links + noindex', () => {
    const meta = routeMeta({
      title: '归档',
      pageUrl: '/archives/page/2',
      canonical: true,
      noindex: true,
      prevUrl: '/archives',
      nextUrl: '/archives/page/3',
    })
    expect(meta).toMatchSnapshot()
  })
})
