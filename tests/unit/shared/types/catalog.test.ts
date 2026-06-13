import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ClientPage, ClientPost, Page, Post } from '@/shared/types/catalog'

import {
  toClientPage,
  toClientPost,
  toDetailPageShell,
  toDetailPostShell,
  toListingPostCard,
  toSidebarPostLink,
} from '@/shared/types/catalog'

const basePost: ClientPost = {
  id: '1',
  title: 'Hello',
  date: new Date('2025-01-01'),
  comments: true,
  alias: ['alias-1'],
  tags: ['tag-1'],
  category: 'cat',
  summary: 'summary',
  cover: 'cover.jpg',
  coverThumbhash: 'thumb',
  og: 'og.png',
  published: true,
  visible: true,
  toc: true,
  showUpdated: true,
  slug: 'hello',
  permalink: '/posts/hello',
  headings: [],
}

const basePage: ClientPage = {
  id: '2',
  title: 'About',
  date: new Date('2025-02-02'),
  comments: false,
  cover: 'cover.jpg',
  og: 'og.png',
  published: true,
  summary: 'about',
  toc: false,
  showUpdated: false,
  showFriends: false,
  slug: 'about',
  permalink: '/about',
  headings: [],
}

describe('shared/types/catalog — toClientPost', () => {
  it('strips body / imageSources / publishedRevisionId from a Post', () => {
    const post: Post = {
      ...basePost,
      body: [],
      imageSources: ['/a.png'],
      publishedRevisionId: 5n,
    }
    const client = toClientPost(post)
    expect(client).toEqual(basePost)
    expectTypeOf(client).toMatchTypeOf<ClientPost>()
    expect('body' in client).toBe(false)
    expect('imageSources' in client).toBe(false)
    expect('publishedRevisionId' in client).toBe(false)
  })
})

describe('shared/types/catalog — toClientPage', () => {
  it('strips body / imageSources / publishedRevisionId from a Page', () => {
    const page: Page = {
      ...basePage,
      body: [],
      imageSources: ['/a.png'],
      publishedRevisionId: null,
    }
    const client = toClientPage(page)
    expect(client).toEqual(basePage)
    expect('body' in client).toBe(false)
  })
})

describe('shared/types/catalog — toListingPostCard', () => {
  it('picks the listing-card fields', () => {
    const card = toListingPostCard(basePost)
    expect(card.id).toBe('1')
    expect(card.slug).toBe('hello')
    expect(card.title).toBe('Hello')
    expect(card.summary).toBe('summary')
    expect(card.cover).toBe('cover.jpg')
    expect(card.permalink).toBe('/posts/hello')
    expect(card.category).toBe('cat')
    expect(card.published).toBe(true)
    expect(card.date).toBe(basePost.date)
  })

  it('preserves coverThumbhash when present', () => {
    expect(toListingPostCard(basePost).coverThumbhash).toBe('thumb')
    expect(toListingPostCard({ ...basePost, coverThumbhash: undefined }).coverThumbhash).toBeUndefined()
  })
})

describe('shared/types/catalog — toDetailPostShell', () => {
  it('picks the detail-shell fields including headings + tags', () => {
    const shell = toDetailPostShell(basePost)
    expect(shell.id).toBe('1')
    expect(shell.slug).toBe('hello')
    expect(shell.tags).toEqual(['tag-1'])
    expect(shell.headings).toEqual([])
    expect(shell.toc).toBe(true)
    expect(shell.showUpdated).toBe(true)
  })
})

describe('shared/types/catalog — toDetailPageShell', () => {
  it('picks the page detail-shell fields including cover dimensions', () => {
    const page: ClientPage = { ...basePage, coverWidth: 800, coverHeight: 600 }
    const shell = toDetailPageShell(page)
    expect(shell.coverWidth).toBe(800)
    expect(shell.coverHeight).toBe(600)
    expect(shell.toc).toBe(false)
  })
})

describe('shared/types/catalog — toSidebarPostLink', () => {
  it('returns only slug/title/permalink', () => {
    expect(toSidebarPostLink(basePost)).toEqual({
      slug: 'hello',
      title: 'Hello',
      permalink: '/posts/hello',
    })
  })
})
