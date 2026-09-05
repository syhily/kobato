import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { selectFeedPosts } from '@/server/domains/posts/services/feed'
import { resolveCategoryBySlugOrName } from '@/server/domains/taxonomies/categories/services/query'
import { resolveTagBySlugOrName } from '@/server/domains/taxonomies/tags/service'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

// selectFeedPosts against the real engine: visibility policy, published-
// revision hydration, and the real scope resolvers.
const db = getTestDb()

const RESOLVERS = { resolveCategory: resolveCategoryBySlugOrName, resolveTag: resolveTagBySlugOrName }

beforeEach(async () => {
  await clearAllTables(db)
})

function paragraphBody(text: string): LexicalEditorState {
  return lexicalBodyWith([lexicalParagraph(text)])
}

async function seedPost(opts: {
  slug: string
  title?: string
  visible?: boolean
  scheduled?: boolean
  categoryId?: number
  body?: LexicalEditorState
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
  const bodyText = `body of ${opts.slug}`
  const revisions = await db
    .insert(contentTable)
    .values({
      type: 'post',
      ownerId: postId,
      revisionNo: 1,
      status: 'published',
      body: opts.body ?? paragraphBody(bodyText),
      // Saved projections stand in for the save-pipeline output; the feed
      // reads `body_html_feed` verbatim.
      bodyHtml: `<p>${bodyText}</p>`,
      bodyText,
      bodyHtmlFeed: `<p>${bodyText}</p>`,
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
    // Feed items carry the saved feed-variant projection of the published revision.
    const visible = posts.find((p) => p.slug === 'visible-post')
    expect(visible?.bodyHtmlFeed).toContain('body of visible-post')
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
