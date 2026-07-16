import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// `feedResponse` and `generateFeeds` thread a real `feed` package output, the
// content catalog, and `prerenderToNodeStream` together. We mock the catalog
// (no real MDX), keep the actual `feed` package, and pin the channel-level
// envelope so a future refactor of `index.server.tsx` cannot silently change
// the RSS/Atom output that downstream subscribers depend on.

const mocks = vi.hoisted(() => ({
  listPublicPostsWithContent: vi.fn(),
  findCategoryBySlug: vi.fn(),
  findCategoriesByNames: vi.fn(),
  findTagBySlug: vi.fn(),
  findTagByName: vi.fn(),
  listAllCategories: vi.fn(),
  getTagsByNames: vi.fn(),
}))

vi.mock('@/server/domains/posts/repos/public-query/feed', () => ({
  listPublicPostsWithContent: mocks.listPublicPostsWithContent,
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  listAllCategories: mocks.listAllCategories,
  findCategoryBySlug: mocks.findCategoryBySlug,
  findCategoriesByNames: mocks.findCategoriesByNames,
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  getTagsByNames: mocks.getTagsByNames,
  findTagBySlug: mocks.findTagBySlug,
  findTagByName: mocks.findTagByName,
}))
vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((section: string) => {
    if (section === 'siteIdentity') {
      return {
        title: 'Test Blog',
        description: 'A test blog',
        website: 'https://example.com',
        initialYear: 2024,
        author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com/about' },
      }
    }
    if (section === 'content') {
      return { feed: { size: 20 } }
    }
    return {}
  }),
  getCacheSettings: vi.fn(() => ({ cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } })),
  getBlogSettingsBundleSync: vi.fn(() => ({})),
}))

const db = {} as NodePgDatabase

const { feedResponse, generateFeeds } = await import('@/server/render/feed/generator')

function fakeCatalog(
  opts: {
    posts?: unknown[]
    categories?: { name: string; slug: string }[]
    tags?: { name: string; slug: string }[]
  } = {},
) {
  const categories = opts.categories ?? []
  const tags = opts.tags ?? []
  mocks.listPublicPostsWithContent.mockResolvedValue(opts.posts ?? [])
  mocks.findCategoryBySlug.mockImplementation((_db: unknown, slug: string) =>
    categories.find((cat) => cat.slug === slug),
  )
  mocks.findCategoriesByNames.mockImplementation((_db: unknown, names: string[]) =>
    names.map((name) => categories.find((cat) => cat.name === name)).filter(Boolean),
  )
  mocks.findTagBySlug.mockImplementation((_db: unknown, slug: string) => tags.find((tag) => tag.slug === slug))
  mocks.findTagByName.mockImplementation((_db: unknown, name: string) => tags.find((tag) => tag.name === name))
  mocks.listAllCategories.mockResolvedValue(categories)
  mocks.getTagsByNames.mockResolvedValue([])
  return {
    listPublicPostsWithContent: mocks.listPublicPostsWithContent,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
})

describe('services/feed — generateFeeds (channel envelope)', () => {
  it('produces both rss + atom strings even when there are zero posts', async () => {
    fakeCatalog()

    const feeds = await generateFeeds(db)

    expect(feeds.rss).toContain('<?xml version=')
    expect(feeds.atom).toContain('<?xml version=')
    expect(feeds.rss).toContain('<rss')
    expect(feeds.atom).toContain('<feed xml:lang="zh-CN" xmlns="http://www.w3.org/2005/Atom">')
  })

  it('declares zh-CN language on both feeds', async () => {
    fakeCatalog()
    const feeds = await generateFeeds(db)
    expect(feeds.rss).toContain('<language>zh-CN</language>')
    expect(feeds.atom).toContain('xml:lang="zh-CN"')
  })

  it('does not set a custom generator string (uses the feed library default)', async () => {
    fakeCatalog()
    const feeds = await generateFeeds(db)
    expect(feeds.rss).not.toContain('<generator>WordPress 3.2.1</generator>')
  })

  it('selects hidden posts by default while still excluding scheduled posts', async () => {
    const catalog = fakeCatalog()

    await generateFeeds(db)

    expect(catalog.listPublicPostsWithContent).toHaveBeenCalledWith(expect.any(Object), {
      includeHidden: true,
      includeScheduled: false,
      limit: 20,
    })
  })

  it('uses the same hidden-inclusive visibility for scoped RSS/Atom feeds', async () => {
    const catalog = fakeCatalog({
      categories: [{ name: '技术', slug: 'tech' }],
      tags: [{ name: 'React', slug: 'react' }],
    })

    await generateFeeds(db, { category: 'tech' })

    expect(catalog.listPublicPostsWithContent).toHaveBeenLastCalledWith(expect.any(Object), {
      includeHidden: true,
      includeScheduled: false,
      category: '技术',
      limit: 20,
    })

    await generateFeeds(db, { tag: 'react' })

    expect(catalog.listPublicPostsWithContent).toHaveBeenLastCalledWith(expect.any(Object), {
      includeHidden: true,
      includeScheduled: false,
      tag: 'React',
      limit: 20,
    })
  })

  it('does not emit `xml-stylesheet` (client XSLT is deprecated in browsers)', async () => {
    fakeCatalog()
    const feeds = await generateFeeds(db)
    expect(feeds.rss).not.toMatch(/xml-stylesheet/i)
    expect(feeds.atom).not.toMatch(/xml-stylesheet/i)
  })

  it('emits one <category> per known catalog category', async () => {
    fakeCatalog({
      categories: [
        { name: '技术', slug: 'tech' },
        { name: '杂谈', slug: 'misc' },
      ],
    })
    const feeds = await generateFeeds(db)
    expect(feeds.rss).toContain('<category>技术</category>')
    expect(feeds.rss).toContain('<category>杂谈</category>')
  })

  it('uses /cats/<slug>/feed and /cats/<slug>/feed/atom URLs when scoped to a category', async () => {
    fakeCatalog({ categories: [{ name: '技术', slug: 'tech' }] })
    const feeds = await generateFeeds(db, { category: 'tech' })
    // The feedLinks self-references appear in the channel header.
    expect(feeds.atom).toContain('/cats/tech/feed')
  })

  it('rejects calls that pass both category and tag', async () => {
    fakeCatalog()
    await expect(generateFeeds(db, { category: 'tech', tag: 'react' })).rejects.toThrow(/at the same time/)
  })
})

describe('services/feed — feedResponse (HTTP wrapper)', () => {
  it('rss returns application/xml; charset=utf-8', async () => {
    fakeCatalog()
    const response = await feedResponse(db, 'rss')
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    const body = await response.text()
    expect(body.startsWith('<?xml')).toBe(true)
  })

  it('atom returns application/atom+xml; charset=utf-8', async () => {
    fakeCatalog()
    const response = await feedResponse(db, 'atom')
    expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8')
  })
})
