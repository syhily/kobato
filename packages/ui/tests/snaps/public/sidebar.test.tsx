import type { LatestComment } from '@kobato/shared/types/comments'

import { makePostList, makeTag } from '#/_helpers/catalog'
import { renderInRouter } from '#/_helpers/render'

import { Sidebar } from '@kobato/ui/public/Sidebar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

const sampleRecent: LatestComment[] = [
  {
    permalink: '/posts/hello',
    title: 'Hello',
    author: 'alice',
    authorLink: 'https://alice.example',
  },
  {
    permalink: '/posts/world',
    title: 'World',
    author: 'bob',
    authorLink: '',
  },
]

describe('snapshot: Sidebar', () => {
  it('renders the public sidebar with every widget populated', () => {
    const data = {
      posts: makePostList(3, { slug: 'side' }),
      tags: [
        makeTag({ name: 'typescript', slug: 'typescript', counts: 5 }),
        makeTag({ name: 'react', slug: 'react', counts: 8 }),
      ],
      recentComments: sampleRecent,
    }
    const html = renderInRouter(<Sidebar data={data} />)
    expect(html).toContain('id="search"')
    expect(html).toContain('id="recent-posts"')
    expect(html).toContain('id="recent-comments"')
    expect(html).toContain('流年拾忆')
    expect(html).toContain('雁过留声')
    expect(html).toContain('Post side-0')
    expect(html).toContain('/posts/side-0')
    expect(html).toContain('typescript')
    expect(html).toContain('/tags/typescript')
    expect(html).toContain('react')
    expect(html).toContain('/tags/react')
    expect(html).toContain('alice')
    expect(html).toContain('bob')
    expect(html).toContain('/images/calendar/2026/0424.png')
  })

  it('renders an empty sidebar (every widget hides itself when starved)', () => {
    const data = {
      posts: [],
      tags: [],
      recentComments: [],
    }
    const html = renderInRouter(<Sidebar data={data} />)
    expect(html).toContain('id="search"')
    expect(html).not.toContain('id="recent-posts"')
    expect(html).not.toContain('id="recent-comments"')
    expect(html).toContain('/images/calendar/2026/0424.png')
  })
})
