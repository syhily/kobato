import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { image } from '@/server/infra/db/schema/media'
import { post } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category, tag } from '@/server/infra/db/schema/taxonomy'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
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

    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/services/query')
    const cats = await listAllCategories(db)

    expect(cats).toHaveLength(1)
    expect(cats[0].permalink).toBe('/cats/tech')
    expect(cats[0].name).toBe('Tech')
  })

  it('hydrates category cover images', async () => {
    await db.insert(category).values({
      name: 'A',
      slug: 'a',
      cover: '/storage/images/categories/coding.jpg',
      description: '',
      sortOrder: 0,
    })
    const [row] = await db
      .insert(image)
      .values({
        storagePath: 'images/categories/coding.jpg',
        mimeType: 'image/jpeg',
        width: 1280,
        height: 425,
        byteSize: 0,
        thumbhash: 'cover-hash',
      })
      .returning()

    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/services/query')
    const cats = await listAllCategories(db)

    // Real hydration: the cover resolves against the seeded image row and
    // the DTO picks up the thumbhash + versioned public URL.
    expect(cats[0].coverThumbhash).toBe('cover-hash')
    expect(cats[0].cover).toBe(`https://assets.example.com/images/categories/coding.jpg?v=${row.updatedAt.getTime()}`)
  })

  it('empty result → empty array', async () => {
    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/services/query')
    const cats = await listAllCategories(db)
    expect(cats).toEqual([])
  })

  it('counts only live posts per category (scheduled and revision-less excluded)', async () => {
    const [gatedCat] = await db
      .insert(category)
      .values({ name: 'GatedCat', slug: 'gated-cat', cover: '', description: '', sortOrder: 0 })
      .returning()
    await db.insert(post).values([
      { slug: 'live-c', title: 'Live', categoryId: gatedCat.id, publishedRevisionId: 1 },
      {
        slug: 'sched-c',
        title: 'Sched',
        categoryId: gatedCat.id,
        publishedRevisionId: 2,
        publishedAt: new Date(Date.now() + 86_400_000),
      },
      { slug: 'norev-c', title: 'NoRev', categoryId: gatedCat.id },
    ])

    const { listAllCategories } = await import('@/server/domains/taxonomies/categories/services/query')
    const cats = await listAllCategories(db)
    expect(cats.find((c) => c.name === 'GatedCat')?.counts).toBe(1)
  })
})

describe('getCategoryLinks', () => {
  it('returns Record<name, link> for matched names', async () => {
    await db.insert(category).values([
      { name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 },
      { name: 'Life', slug: 'life', cover: '', description: '', sortOrder: 0 },
    ])

    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/services/query')
    const links = await getCategoryLinks(db, ['Tech', 'Life'])

    expect(links.Tech).toBe('/cats/tech')
    expect(links.Life).toBe('/cats/life')
  })

  it('filters out null/empty names', async () => {
    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/services/query')
    const links = await getCategoryLinks(db, ['', null as unknown as string, undefined as unknown as string])
    expect(Object.keys(links)).toHaveLength(0)
  })

  it('deduplicates names', async () => {
    await db.insert(category).values({ name: 'Tech', slug: 'tech', cover: '', description: '', sortOrder: 0 })

    const { getCategoryLinks } = await import('@/server/domains/taxonomies/categories/services/query')
    const links = await getCategoryLinks(db, ['Tech', 'Tech', 'Tech'])

    expect(Object.keys(links)).toHaveLength(1)
  })
})

describe('listAllTags', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns tags with permalink /tags/slug', async () => {
    await db.insert(tag).values({ name: 'React', slug: 'react' })

    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags(db)

    expect(tags).toHaveLength(1)
    expect(tags[0].permalink).toBe('/tags/react')
  })

  it('tags with zero posts have counts = 0', async () => {
    await db.insert(tag).values({ name: 'Rust', slug: 'rust' })

    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags(db)

    expect(tags[0].counts).toBe(0)
  })

  it('counts only live posts per tag (scheduled and revision-less excluded)', async () => {
    const [tagRow] = await db.insert(tag).values({ name: 'Gated', slug: 'gated' }).returning()
    const [livePost] = await db
      .insert(post)
      .values({ slug: 'live-t', title: 'Live', publishedRevisionId: 1 })
      .returning()
    const [schedPost] = await db
      .insert(post)
      .values({
        slug: 'sched-t',
        title: 'Sched',
        publishedRevisionId: 2,
        publishedAt: new Date(Date.now() + 86_400_000),
      })
      .returning()
    const [noRevPost] = await db.insert(post).values({ slug: 'norev-t', title: 'NoRev' }).returning()
    await db.insert(postTag).values([
      { postId: livePost.id, tagId: tagRow.id },
      { postId: schedPost.id, tagId: tagRow.id },
      { postId: noRevPost.id, tagId: tagRow.id },
    ])

    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags(db)
    expect(tags.find((t) => t.name === 'Gated')?.counts).toBe(1)
  })
})

describe('getTagsByNames', () => {
  it('returns tags in input name order', async () => {
    await db.insert(tag).values([
      { name: 'Vue', slug: 'vue' },
      { name: 'React', slug: 'react' },
    ])

    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(db, ['Vue', 'React'])

    expect(tags[0].name).toBe('Vue')
    expect(tags[1].name).toBe('React')
  })

  it('filters out unknown names', async () => {
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(db, ['Unknown'])
    expect(tags).toEqual([])
  })

  it('empty input → empty array', async () => {
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(db, [])
    expect(tags).toEqual([])
  })

  it('deduplicates input names', async () => {
    await db.insert(tag).values({ name: 'React', slug: 'react' })

    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(db, ['React', 'React', 'React'])

    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('React')
  })
})

describe('countPostsByTaxonomy — names narrowing', () => {
  it('counts only the requested terms, not the whole taxonomy', async () => {
    const [react] = await db.insert(tag).values({ name: 'React', slug: 'react' }).returning()
    const [vue] = await db.insert(tag).values({ name: 'Vue', slug: 'vue' }).returning()
    const [p1] = await db.insert(post).values({ slug: 'p1', title: 'P1', publishedRevisionId: 1 }).returning()
    const [p2] = await db.insert(post).values({ slug: 'p2', title: 'P2', publishedRevisionId: 2 }).returning()
    await db.insert(postTag).values([
      { postId: p1.id, tagId: react.id },
      { postId: p2.id, tagId: vue.id },
    ])

    const { countPostsByTaxonomy } = await import('@/server/domains/posts/services/taxonomy')
    const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'public', names: ['React'] })

    // The unrequested term never enters the aggregate (its posts are
    // invisible to the query), and the requested term counts its own.
    expect(counts.get('React')).toBe(1)
    expect(counts.has('Vue')).toBe(false)
  })

  it('returns an empty map for an empty names list without querying', async () => {
    const { countPostsByTaxonomy } = await import('@/server/domains/posts/services/taxonomy')
    const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'public', names: [] })
    expect(counts.size).toBe(0)
  })
})

describe('listAllFriends', () => {
  it('is exported from friends service', async () => {
    const { listAllFriends } = await import('@/server/domains/friends/service')
    expect(typeof listAllFriends).toBe('function')
  })
})
