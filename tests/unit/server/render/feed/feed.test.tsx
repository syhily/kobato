import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// `generateFeeds` threads a real `feed` package output, the
// content catalog, and `prerenderToNodeStream` together. We mock the catalog
// (no real Postgres), keep the actual `feed` package, and pin the channel-level
// envelope so a future refactor of `generator.tsx` cannot silently change
// the RSS/Atom output that downstream subscribers depend on.

const mocks = vi.hoisted(() => ({
  selectFeedPosts: vi.fn(),
  findCategoryBySlug: vi.fn(),
  findCategoryByName: vi.fn(),
  findCategoriesByNames: vi.fn(),
  findTagBySlug: vi.fn(),
  findTagByName: vi.fn(),
  listAllCategories: vi.fn(),
  getTagsByNames: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/feed', () => ({
  selectFeedPosts: mocks.selectFeedPosts,
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  listAllCategories: mocks.listAllCategories,
  resolveCategoryBySlugOrName: async (db: unknown, value: string) =>
    (await mocks.findCategoryBySlug(db, value)) ?? (await mocks.findCategoryByName(db, value)),
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  getTagsByNames: mocks.getTagsByNames,
  resolveTagBySlugOrName: async (db: unknown, value: string) =>
    (await mocks.findTagBySlug(db, value)) ?? (await mocks.findTagByName(db, value)),
}))
vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoriesByNames: mocks.findCategoriesByNames,
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

const { generateFeeds } = await import('@/server/render/feed/generator')

function fakeCatalog(
  opts: {
    posts?: unknown[]
    categories?: { id?: bigint; name: string; slug: string }[]
    tags?: { name: string; slug: string }[]
  } = {},
) {
  const categories = opts.categories ?? []
  const tags = opts.tags ?? []
  mocks.selectFeedPosts.mockResolvedValue(opts.posts ?? [])
  mocks.findCategoryBySlug.mockImplementation((_db: unknown, slug: string) =>
    categories.find((cat) => cat.slug === slug),
  )
  mocks.findCategoryByName.mockImplementation(
    (_db: unknown, name: string) => categories.find((cat) => cat.name === name) ?? null,
  )
  mocks.findCategoriesByNames.mockImplementation((_db: unknown, names: string[]) =>
    names.map((name) => categories.find((cat) => cat.name === name)).filter(Boolean),
  )
  mocks.findTagBySlug.mockImplementation((_db: unknown, slug: string) => tags.find((tag) => tag.slug === slug))
  mocks.findTagByName.mockImplementation((_db: unknown, name: string) => tags.find((tag) => tag.name === name))
  mocks.listAllCategories.mockResolvedValue(categories)
  mocks.getTagsByNames.mockResolvedValue([])
  return {
    selectFeedPosts: mocks.selectFeedPosts,
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

  it('delegates post selection to the posts domain with the configured page size', async () => {
    // The visibility policy itself (hidden included, scheduled excluded)
    // is pinned at the domain seam in
    // tests/unit/server/domains/posts/services/feed.test.ts.
    const catalog = fakeCatalog()

    await generateFeeds(db)

    expect(catalog.selectFeedPosts).toHaveBeenCalledWith(
      expect.any(Object),
      { category: undefined, tag: undefined, limit: 20 },
      { resolveCategory: expect.any(Function), resolveTag: expect.any(Function) },
    )
  })

  it('passes the category/tag scopes through to the domain selection', async () => {
    const catalog = fakeCatalog()

    await generateFeeds(db, { category: 'tech' })
    expect(catalog.selectFeedPosts).toHaveBeenLastCalledWith(
      expect.any(Object),
      { category: 'tech', tag: undefined, limit: 20 },
      expect.any(Object),
    )

    await generateFeeds(db, { tag: 'react' })
    expect(catalog.selectFeedPosts).toHaveBeenLastCalledWith(
      expect.any(Object),
      { category: undefined, tag: 'react', limit: 20 },
      expect.any(Object),
    )
  })

  it('wires the taxonomy slug-or-name resolvers into the domain selection', async () => {
    const catalog = fakeCatalog()
    const categoriesService = await import('@/server/domains/taxonomies/categories/services/query')
    const tagsService = await import('@/server/domains/taxonomies/tags/service')

    await generateFeeds(db)

    const resolvers = catalog.selectFeedPosts.mock.calls[0]![2] as {
      resolveCategory: unknown
      resolveTag: unknown
    }
    expect(resolvers.resolveCategory).toBe(categoriesService.resolveCategoryBySlugOrName)
    expect(resolvers.resolveTag).toBe(tagsService.resolveTagBySlugOrName)
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

  it('uses /tags/<slug>/feed and /tags/<slug>/feed/atom URLs when scoped to a tag', async () => {
    fakeCatalog({ tags: [{ name: 'React', slug: 'react' }] })
    const feeds = await generateFeeds(db, { tag: 'react' })
    // The feedLinks self-references appear in the channel header.
    expect(feeds.atom).toContain('/tags/react/feed')
  })

  it('rejects calls that pass both category and tag', async () => {
    fakeCatalog()
    await expect(generateFeeds(db, { category: 'tech', tag: 'react' })).rejects.toThrow(/at the same time/)
  })
})
