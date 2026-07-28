import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

vi.mock('@/server/domains/posts/services/feed', () => ({
  selectFeedPosts: (db: unknown, opts: unknown, resolvers: unknown) => feedState.selectPosts(db, opts, resolvers),
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  listAllCategories: () => feedState.listCats(),
  // Passed through to the domain selection as injected resolvers — the
  // generator never calls them itself, so a null stub is enough here.
  resolveCategoryBySlugOrName: vi.fn(async () => null),
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  resolveTagBySlugOrName: vi.fn(async () => null),
  getTagsByNames: (_db: unknown, names: string[]) => feedState.getTags(names),
}))
vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoriesByNames: (_db: unknown, names: string[]) => feedState.findCats(names),
}))
vi.mock('@/server/render/pt-html', () => ({
  renderPortableTextToHtml: () => feedState.render(),
}))

import type { Post, Page } from '@/shared/types/catalog'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { generateFeeds } from '@/server/render/feed/generator'

// Perimeter coverage for `generateFeeds`: the RSS/Atom envelope and the
// wiring into the posts domain's `selectFeedPosts`. The selection policy
// (visibility, scope resolution, miss → empty) is pinned at the domain
// seam in tests/unit/server/domains/posts/services/feed.test.ts.
const feedState = {
  selectPosts: vi.fn<(db: unknown, opts: unknown, resolvers: unknown) => Promise<(Post | Page)[]>>(),
  findCats: vi.fn<(names: string[]) => Promise<unknown[]>>(),
  listCats: vi.fn<() => Promise<unknown[]>>(),
  getTags: vi.fn<(names: string[]) => Promise<unknown[]>>(),
  render: vi.fn<() => Promise<string>>(),
}

const fakeDb = {} as Database

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: '1',
    slug: 'hello',
    title: 'Hello',
    summary: 'A summary',
    permalink: '/posts/hello',
    date: new Date('2024-01-01'),
    category: '默认分类',
    tags: ['react'],
    body: [],
    headings: [],
    ...overrides,
  } as Post
}

beforeEach(() => {
  feedState.selectPosts.mockReset()
  feedState.findCats.mockReset()
  feedState.listCats.mockReset()
  feedState.getTags.mockReset()
  feedState.render.mockReset()
  feedState.selectPosts.mockResolvedValue([])
  feedState.findCats.mockResolvedValue([])
  feedState.listCats.mockResolvedValue([{ name: '默认分类' }])
  feedState.getTags.mockResolvedValue([])
  feedState.render.mockResolvedValue('<p>body</p>')
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('render/feed/generator — generateFeeds', () => {
  it('generates a feed with no posts', async () => {
    feedState.selectPosts.mockResolvedValue([])
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toContain('<?xml')
    expect(result.atom).toContain('xml:lang="zh-CN"')
  })

  it('generates a feed with one post including its content', async () => {
    feedState.selectPosts.mockResolvedValue([makePost()])
    feedState.getTags.mockResolvedValue([{ name: 'react', slug: 'react' }])
    feedState.findCats.mockResolvedValue([{ name: '默认分类', slug: 'default' }])
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toContain('Hello')
    expect(result.rss).toContain('<p>body</p>')
  })

  it('throws DomainError when both category and tag are provided', async () => {
    await expect(generateFeeds(fakeDb, { category: 'c', tag: 't' })).rejects.toMatchObject({ name: 'DomainError' })
  })

  it('forwards the category scope and the configured feed size to the domain selection', async () => {
    await generateFeeds(fakeDb, { category: 'react' })
    expect(feedState.selectPosts).toHaveBeenCalledWith(
      fakeDb,
      { category: 'react', tag: undefined, limit: 20 },
      expect.objectContaining({ resolveCategory: expect.any(Function), resolveTag: expect.any(Function) }),
    )
  })

  it('forwards the tag scope to the domain selection', async () => {
    await generateFeeds(fakeDb, { tag: 'react' })
    expect(feedState.selectPosts).toHaveBeenCalledWith(
      fakeDb,
      { category: undefined, tag: 'react', limit: 20 },
      expect.any(Object),
    )
  })

  it('renders an empty feed when the domain selection is empty', async () => {
    feedState.selectPosts.mockResolvedValue([])
    const result = await generateFeeds(fakeDb, { category: 'missing' })
    expect(result.rss).toContain('<?xml')
  })
})
