import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/cache/feed-cache', () => ({
  feedCacheFor: () => feedCacheState.cache,
}))
vi.mock('@/server/domains/posts/repos/public-query/feed', () => ({
  listPublicPostsWithContent: (db: unknown, opts: unknown) => feedState.listPosts(db, opts),
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  findCategoriesByNames: (_db: unknown, names: string[]) => feedState.findCats(names),
  findCategoryByName: (_db: unknown, name: string) => feedState.findCatByName(name),
  findCategoryBySlug: (_db: unknown, slug: string) => feedState.findCatBySlug(slug),
  listAllCategories: () => feedState.listCats(),
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  findTagByName: (_db: unknown, name: string) => feedState.findTagByName(name),
  findTagBySlug: (_db: unknown, slug: string) => feedState.findTagBySlug(slug),
  getTagsByNames: (_db: unknown, names: string[]) => feedState.getTags(names),
}))
vi.mock('@/server/render/feed/feed-pt-render', () => ({
  renderPortableTextToHtml: () => feedState.render(),
}))

import type { Post, Page } from '@/shared/types/catalog'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { feedResponse, generateFeeds } from '@/server/render/feed/generator'

const feedCacheState = {
  cache: {
    get: vi.fn<() => Promise<unknown>>(),
    set: vi.fn<(value: unknown) => Promise<void>>(),
  },
}

const feedState = {
  listPosts: vi.fn<(db: unknown, opts: unknown) => Promise<(Post | Page)[]>>(),
  findCats: vi.fn<(names: string[]) => Promise<unknown[]>>(),
  findCatByName: vi.fn<(name: string) => Promise<unknown | null>>(),
  findCatBySlug: vi.fn<(slug: string) => Promise<unknown | null>>(),
  listCats: vi.fn<() => Promise<unknown[]>>(),
  findTagByName: vi.fn<(name: string) => Promise<unknown | null>>(),
  findTagBySlug: vi.fn<(slug: string) => Promise<unknown | null>>(),
  getTags: vi.fn<(names: string[]) => Promise<unknown[]>>(),
  render: vi.fn<() => Promise<string>>(),
}

const fakeDb = {} as NodePgDatabase

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
  feedCacheState.cache.get.mockReset()
  feedCacheState.cache.set.mockReset()
  feedCacheState.cache.get.mockResolvedValue(null)
  feedCacheState.cache.set.mockResolvedValue(undefined)
  feedState.listPosts.mockReset()
  feedState.findCats.mockReset()
  feedState.findCatByName.mockReset()
  feedState.findCatBySlug.mockReset()
  feedState.listCats.mockReset()
  feedState.findTagByName.mockReset()
  feedState.findTagBySlug.mockReset()
  feedState.getTags.mockReset()
  feedState.render.mockReset()
  feedState.listPosts.mockResolvedValue([])
  feedState.findCats.mockResolvedValue([])
  feedState.findCatByName.mockResolvedValue(null)
  feedState.findCatBySlug.mockResolvedValue(null)
  feedState.listCats.mockResolvedValue([{ name: '默认分类' }])
  feedState.findTagByName.mockResolvedValue(null)
  feedState.findTagBySlug.mockResolvedValue(null)
  feedState.getTags.mockResolvedValue([])
  feedState.render.mockResolvedValue('<p>body</p>')
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('render/feed/generator — generateFeeds', () => {
  it('returns the cached feed when the cache has it', async () => {
    feedCacheState.cache.get.mockResolvedValue({ rss: 'cached-rss', atom: 'cached-atom' })
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toBe('cached-rss')
    expect(feedState.listPosts).not.toHaveBeenCalled()
  })

  it('generates a feed with no posts', async () => {
    feedState.listPosts.mockResolvedValue([])
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toContain('<?xml')
    expect(result.atom).toContain('xml:lang="zh-CN"')
    expect(feedCacheState.cache.set).toHaveBeenCalled()
  })

  it('generates a feed with one post including its content', async () => {
    feedState.listPosts.mockResolvedValue([makePost()])
    feedState.getTags.mockResolvedValue([{ name: 'react', slug: 'react' }])
    feedState.findCats.mockResolvedValue([{ name: '默认分类', slug: 'default' }])
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toContain('Hello')
    expect(result.rss).toContain('<p>body</p>')
  })

  it('throws DomainError when both category and tag are provided', async () => {
    await expect(generateFeeds(fakeDb, { category: 'c', tag: 't' })).rejects.toMatchObject({ name: 'DomainError' })
  })

  it('returns an empty feed when the category slug and name both miss', async () => {
    feedState.findCatBySlug.mockResolvedValue(null)
    feedState.findCatByName.mockResolvedValue(null)
    const result = await generateFeeds(fakeDb, { category: 'missing' })
    expect(result.rss).toContain('<?xml')
    expect(feedState.listPosts).not.toHaveBeenCalled()
  })

  it('queries posts by category name when the slug matches', async () => {
    feedState.findCatBySlug.mockResolvedValue({ name: 'React', slug: 'react' })
    feedState.listPosts.mockResolvedValue([])
    await generateFeeds(fakeDb, { category: 'react' })
    expect(feedState.listPosts).toHaveBeenCalled()
    const opts = feedState.listPosts.mock.calls[0]![1] as { category: string }
    expect(opts.category).toBe('React')
  })

  it('falls back to category name lookup when slug misses', async () => {
    feedState.findCatBySlug.mockResolvedValue(null)
    feedState.findCatByName.mockResolvedValue({ name: 'React', slug: 'react' })
    feedState.listPosts.mockResolvedValue([])
    await generateFeeds(fakeDb, { category: 'React' })
    expect(feedState.listPosts).toHaveBeenCalled()
  })

  it('returns an empty feed when the tag slug and name both miss', async () => {
    feedState.findTagBySlug.mockResolvedValue(null)
    feedState.findTagByName.mockResolvedValue(null)
    const result = await generateFeeds(fakeDb, { tag: 'missing' })
    expect(result.rss).toContain('<?xml')
    expect(feedState.listPosts).not.toHaveBeenCalled()
  })

  it('queries posts by tag name when the slug matches', async () => {
    feedState.findTagBySlug.mockResolvedValue({ name: 'React', slug: 'react' })
    feedState.listPosts.mockResolvedValue([])
    await generateFeeds(fakeDb, { tag: 'react' })
    const opts = feedState.listPosts.mock.calls[0]![1] as { tag: string }
    expect(opts.tag).toBe('React')
  })

  it('falls back to tag name lookup when slug misses', async () => {
    feedState.findTagBySlug.mockResolvedValue(null)
    feedState.findTagByName.mockResolvedValue({ name: 'React', slug: 'react' })
    feedState.listPosts.mockResolvedValue([])
    await generateFeeds(fakeDb, { tag: 'React' })
    expect(feedState.listPosts).toHaveBeenCalled()
  })
})

describe('render/feed/generator — feedResponse', () => {
  it('returns a Response with the RSS content-type', async () => {
    feedState.listPosts.mockResolvedValue([])
    const res = await feedResponse(fakeDb, 'rss')
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    const body = await res.text()
    expect(body).toContain('<?xml')
  })

  it('returns a Response with the Atom content-type', async () => {
    feedState.listPosts.mockResolvedValue([])
    const res = await feedResponse(fakeDb, 'atom')
    expect(res.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8')
    const body = await res.text()
    expect(body).toContain('<feed')
  })
})
