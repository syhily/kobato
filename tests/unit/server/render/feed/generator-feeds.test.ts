import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/posts/repos/public-query/feed', () => ({
  listPublicPostsWithContent: (db: unknown, opts: unknown) => feedState.listPosts(db, opts),
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  listAllCategories: () => feedState.listCats(),
  resolveCategoryBySlugOrName: (_db: unknown, v: string) =>
    feedState.findCatBySlug(v).then((r) => r ?? feedState.findCatByName(v)),
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  resolveTagBySlugOrName: (_db: unknown, v: string) =>
    feedState.findTagBySlug(v).then((r) => r ?? feedState.findTagByName(v)),
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
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { generateFeeds } from '@/server/render/feed/generator'

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
  it('generates a feed with no posts', async () => {
    feedState.listPosts.mockResolvedValue([])
    const result = await generateFeeds(fakeDb)
    expect(result.rss).toContain('<?xml')
    expect(result.atom).toContain('xml:lang="zh-CN"')
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

  it('queries posts by category id when the slug matches', async () => {
    feedState.findCatBySlug.mockResolvedValue({ id: 7n, name: 'React', slug: 'react' })
    feedState.listPosts.mockResolvedValue([])
    await generateFeeds(fakeDb, { category: 'react' })
    expect(feedState.listPosts).toHaveBeenCalled()
    const opts = feedState.listPosts.mock.calls[0]![1] as { categoryId: bigint }
    expect(opts.categoryId).toBe(7n)
  })

  it('falls back to category name lookup when slug misses', async () => {
    feedState.findCatBySlug.mockResolvedValue(null)
    feedState.findCatByName.mockResolvedValue({ id: 7n, name: 'React', slug: 'react' })
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
