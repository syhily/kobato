import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/server/infra/db/pool'
import { category, post, tag } from '@/server/infra/db/schema'

vi.mock('@/server/domains/images/image-meta', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

beforeEach(async () => {
  await db.delete(post)
  await db.delete(category)
  await db.delete(tag)
})

describe('listAllCategories', () => {
  it('returns categories with permalink format /cats/slug', async () => {
    await db.insert(category).values({
      name: 'Tech',
      slug: 'tech',
      cover: '/tech.jpg',
      description: 'Tech stuff',
      sortOrder: 0,
    })

    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/service')
    const cats = await listAllCategories()

    expect(cats).toHaveLength(1)
    expect(cats[0].permalink).toBe('/cats/tech')
    expect(cats[0].name).toBe('Tech')
  })

  it('hydrates category cover images', async () => {
    await db.insert(category).values({
      name: 'A',
      slug: 'a',
      cover: '/a.jpg',
      description: '',
      sortOrder: 0,
    })

    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/service')
    await listAllCategories()

    const { hydrateImageRefs } = await import('@/server/render/image-enhance')
    expect(hydrateImageRefs).toHaveBeenCalled()
  })

  it('empty result → empty array', async () => {
    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/service')
    const cats = await listAllCategories()
    expect(cats).toEqual([])
  })
})

describe('getCategoryLinks', () => {
  it('returns Record<name, link> for matched names', async () => {
    await db.insert(category).values([
      { name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 },
      { name: 'Life', slug: 'life', cover: '', description: '', sortOrder: 0 },
    ])

    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/service')
    const links = await getCategoryLinks(['Tech', 'Life'])

    expect(links['Tech']).toBe('/cats/tech')
    expect(links['Life']).toBe('/cats/life')
  })

  it('filters out null/empty names', async () => {
    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/service')
    const links = await getCategoryLinks(['', null as unknown as string, undefined as unknown as string])
    expect(Object.keys(links)).toHaveLength(0)
  })

  it('deduplicates names', async () => {
    await db.insert(category).values({ name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 })

    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/service')
    const links = await getCategoryLinks(['Tech', 'Tech', 'Tech'])

    expect(Object.keys(links)).toHaveLength(1)
  })
})

describe('getCategoryLink', () => {
  it('returns /cats/slug for an existing category', async () => {
    await db.insert(category).values({ name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 })

    const { getCategoryLink } = await import('@/server/domains/taxonomies/categories/service')
    const link = await getCategoryLink('Tech')
    expect(link).toBe('/cats/tech')
  })

  it('returns empty string for a non-existent category', async () => {
    const { getCategoryLink } = await import('@/server/domains/taxonomies/categories/service')
    const link = await getCategoryLink('Unknown')
    expect(link).toBe('')
  })
})

describe('listAllTags', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns tags with permalink /tags/slug', async () => {
    await db.insert(tag).values({ name: 'React', slug: 'react' })

    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags()

    expect(tags).toHaveLength(1)
    expect(tags[0].permalink).toBe('/tags/react')
  })

  it('tags with zero posts have counts = 0', async () => {
    await db.insert(tag).values({ name: 'Rust', slug: 'rust' })

    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags()

    expect(tags[0].counts).toBe(0)
  })
})

describe('getTagsByNames', () => {
  it('returns tags in input name order', async () => {
    await db.insert(tag).values([
      { name: 'Vue', slug: 'vue' },
      { name: 'React', slug: 'react' },
    ])

    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(['Vue', 'React'])

    expect(tags[0].name).toBe('Vue')
    expect(tags[1].name).toBe('React')
  })

  it('filters out unknown names', async () => {
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(['Unknown'])
    expect(tags).toEqual([])
  })

  it('empty input → empty array', async () => {
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames([])
    expect(tags).toEqual([])
  })

  it('deduplicates input names', async () => {
    await db.insert(tag).values({ name: 'React', slug: 'react' })

    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(['React', 'React', 'React'])

    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('React')
  })
})

describe('listAllFriends', () => {
  it('is exported from friends service', async () => {
    const { listAllFriends } = await import('@/server/domains/friends/service')
    expect(typeof listAllFriends).toBe('function')
  })
})
