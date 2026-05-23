import { beforeEach, describe, expect, it, vi } from 'vitest'

// `feedResponse` and `generateFeeds` thread a real `feed` package output, the
// content catalog, and `prerenderToNodeStream` together. We mock the catalog
// (no real MDX), keep the actual `feed` package, and pin the channel-level
// envelope so a future refactor of `index.server.tsx` cannot silently change
// the RSS/Atom output that downstream subscribers depend on.

const mocks = vi.hoisted(() => ({
  listPublicPostsWithContent: vi.fn(),
  findCategoryBySlug: vi.fn(),
  findCategoryByName: vi.fn(),
  findTagBySlug: vi.fn(),
  findTagByName: vi.fn(),
  listAllCategories: vi.fn(),
  getTagsByNames: vi.fn(),
}))

vi.mock('@/server/domains/posts/repos/public-query', () => ({
  listPublicPostsWithContent: mocks.listPublicPostsWithContent,
}))
vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryBySlug: mocks.findCategoryBySlug,
  findCategoryByName: mocks.findCategoryByName,
}))
vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagBySlug: mocks.findTagBySlug,
  findTagByName: mocks.findTagByName,
}))
vi.mock('@/server/domains/taxonomies/categories/service', () => ({
  listAllCategories: mocks.listAllCategories,
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  getTagsByNames: mocks.getTagsByNames,
}))

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
  mocks.findCategoryBySlug.mockImplementation((slug: string) => categories.find((cat) => cat.slug === slug))
  mocks.findCategoryByName.mockImplementation((name: string) => categories.find((cat) => cat.name === name))
  mocks.findTagBySlug.mockImplementation((slug: string) => tags.find((tag) => tag.slug === slug))
  mocks.findTagByName.mockImplementation((name: string) => tags.find((tag) => tag.name === name))
  mocks.listAllCategories.mockResolvedValue(categories)
  mocks.getTagsByNames.mockResolvedValue([])
  return {
    listPublicPostsWithContent: mocks.listPublicPostsWithContent,
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
})

describe('services/feed — generateFeeds (channel envelope)', () => {
  it('produces both rss + atom strings even when there are zero posts', async () => {
    fakeCatalog()

    const feeds = await generateFeeds()

    expect(feeds.rss).toContain('<?xml version=')
    expect(feeds.atom).toContain('<?xml version=')
    expect(feeds.rss).toContain('<rss')
    expect(feeds.atom).toContain('<feed xml:lang="zh-CN" xmlns="http://www.w3.org/2005/Atom">')
  })

  it('declares zh-CN language on both feeds', async () => {
    fakeCatalog()
    const feeds = await generateFeeds()
    expect(feeds.rss).toContain('<language>zh-CN</language>')
    expect(feeds.atom).toContain('xml:lang="zh-CN"')
  })

  it('ships the legacy `WordPress 3.2.1` generator string (subscriber compat)', async () => {
    fakeCatalog()
    const feeds = await generateFeeds()
    expect(feeds.rss).toContain('<generator>WordPress 3.2.1</generator>')
  })

  it('selects hidden posts by default while still excluding scheduled posts', async () => {
    const catalog = fakeCatalog()

    await generateFeeds()

    expect(catalog.listPublicPostsWithContent).toHaveBeenCalledWith({
      includeHidden: true,
      includeScheduled: false,
    })
  })

  it('uses the same hidden-inclusive visibility for scoped RSS/Atom feeds', async () => {
    const catalog = fakeCatalog({
      categories: [{ name: '技术', slug: 'tech' }],
      tags: [{ name: 'React', slug: 'react' }],
    })

    await generateFeeds({ category: 'tech' })

    expect(catalog.listPublicPostsWithContent).toHaveBeenLastCalledWith({
      includeHidden: true,
      includeScheduled: false,
      category: '技术',
    })

    await generateFeeds({ tag: 'react' })

    expect(catalog.listPublicPostsWithContent).toHaveBeenLastCalledWith({
      includeHidden: true,
      includeScheduled: false,
      tag: 'React',
    })
  })

  it('does not emit `xml-stylesheet` (client XSLT is deprecated in browsers)', async () => {
    fakeCatalog()
    const feeds = await generateFeeds()
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
    const feeds = await generateFeeds()
    expect(feeds.rss).toContain('<category>技术</category>')
    expect(feeds.rss).toContain('<category>杂谈</category>')
  })

  it('uses /cats/<slug>/feed and /cats/<slug>/feed/atom URLs when scoped to a category', async () => {
    fakeCatalog({ categories: [{ name: '技术', slug: 'tech' }] })
    const feeds = await generateFeeds({ category: 'tech' })
    // The feedLinks self-references appear in the channel header.
    expect(feeds.atom).toContain('/cats/tech/feed')
  })

  it('rejects calls that pass both category and tag', async () => {
    fakeCatalog()
    await expect(generateFeeds({ category: 'tech', tag: 'react' })).rejects.toThrow(/at the same time/)
  })
})

describe('services/feed — feedResponse (HTTP wrapper)', () => {
  it('rss returns application/xml; charset=utf-8', async () => {
    fakeCatalog()
    const response = await feedResponse('rss')
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    const body = await response.text()
    expect(body.startsWith('<?xml')).toBe(true)
  })

  it('atom returns application/atom+xml; charset=utf-8', async () => {
    fakeCatalog()
    const response = await feedResponse('atom')
    expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8')
  })
})
