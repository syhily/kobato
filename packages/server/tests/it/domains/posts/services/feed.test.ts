import type { PortableTextBody } from '@kobato/shared/legacy-pt/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { selectFeedPosts } from '@kobato/server/domains/posts/services/feed'
import { resolveCategoryBySlugOrName } from '@kobato/server/domains/taxonomies/categories/services/query'
import { resolveTagBySlugOrName } from '@kobato/server/domains/taxonomies/tags/service'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { postTag } from '@kobato/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@kobato/server/infra/db/schema/taxonomy'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// selectFeedPosts against the real engine: the feed channel's visibility
// policy (hidden included, scheduled excluded), the published-revision
// hydration, and the scope-resolution rules run on seeded rows — the
// resolvers are the same real ones the feed generator wires.
const db = getTestDb()

const RESOLVERS = { resolveCategory: resolveCategoryBySlugOrName, resolveTag: resolveTagBySlugOrName }

beforeEach(async () => {
  await clearAllTables(db)
})

function paragraphBody(text: string): PortableTextBody {
  return [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: 's1', text, marks: [] }],
    },
  ]
}

async function seedPost(opts: {
  slug: string
  title?: string
  visible?: boolean
  scheduled?: boolean
  categoryId?: number
  body?: PortableTextBody
}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      summary: '',
      published: true,
      visible: opts.visible ?? true,
      publishedAt: opts.scheduled ? new Date(Date.now() + 86_400_000) : new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      categoryId: opts.categoryId ?? null,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({
      type: 'post',
      ownerId: postId,
      revisionNo: 1,
      status: 'published',
      body: opts.body ?? paragraphBody(`body of ${opts.slug}`),
    })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

describe('selectFeedPosts — feed-channel visibility policy', () => {
  it('includes hidden posts, excludes scheduled ones, and hydrates published bodies', async () => {
    await seedPost({ slug: 'visible-post' })
    await seedPost({ slug: 'hidden-post', visible: false })
    await seedPost({ slug: 'scheduled-post', scheduled: true })

    const posts = await selectFeedPosts(db, { limit: 20 }, RESOLVERS)
    const slugs = posts.map((p) => p.slug)

    expect(slugs).toContain('visible-post')
    expect(slugs).toContain('hidden-post')
    expect(slugs).not.toContain('scheduled-post')
    // Feed items carry hydrated bodies from the published revision.
    const visible = posts.find((p) => p.slug === 'visible-post')
    expect(JSON.stringify(visible?.body)).toContain('body of visible-post')
  })

  it('respects the configured limit', async () => {
    for (let i = 0; i < 5; i++) {
      await seedPost({ slug: `post-${i}` })
    }

    const posts = await selectFeedPosts(db, { limit: 2 }, RESOLVERS)

    expect(posts).toHaveLength(2)
  })
})

describe('selectFeedPosts — category/tag scoping', () => {
  it('filters by the resolved category', async () => {
    const tech = (await db.insert(categoryTable).values({ name: 'Tech', slug: 'tech', cover: '' }).returning())[0]!
    await seedPost({ slug: 'in-tech', categoryId: tech.id })
    await seedPost({ slug: 'elsewhere' })

    const posts = await selectFeedPosts(db, { category: 'tech', limit: 20 }, RESOLVERS)

    expect(posts.map((p) => p.slug)).toEqual(['in-tech'])
  })

  it('returns an empty selection when the category scope misses', async () => {
    await seedPost({ slug: 'elsewhere' })

    const posts = await selectFeedPosts(db, { category: 'missing', limit: 20 }, RESOLVERS)

    expect(posts).toEqual([])
  })

  it('filters by the resolved tag', async () => {
    const react = (await db.insert(tagTable).values({ name: 'React', slug: 'react' }).returning())[0]!
    const tagged = await seedPost({ slug: 'tagged' })
    await db.insert(postTag).values({ postId: tagged, tagId: react.id })
    await seedPost({ slug: 'untagged' })

    const posts = await selectFeedPosts(db, { tag: 'react', limit: 20 }, RESOLVERS)

    expect(posts.map((p) => p.slug)).toEqual(['tagged'])
  })

  it('returns an empty selection when the tag scope misses', async () => {
    await seedPost({ slug: 'elsewhere' })

    const posts = await selectFeedPosts(db, { tag: 'missing', limit: 20 }, RESOLVERS)

    expect(posts).toEqual([])
  })

  it('lets the category scope win when both are given', async () => {
    const tech = (await db.insert(categoryTable).values({ name: 'Tech', slug: 'tech', cover: '' }).returning())[0]!
    await db.insert(tagTable).values({ name: 'React', slug: 'react' })
    await seedPost({ slug: 'in-tech', categoryId: tech.id })
    await seedPost({ slug: 'elsewhere' })

    const posts = await selectFeedPosts(db, { category: 'tech', tag: 'react', limit: 20 }, RESOLVERS)

    expect(posts.map((p) => p.slug)).toEqual(['in-tech'])
  })
})
