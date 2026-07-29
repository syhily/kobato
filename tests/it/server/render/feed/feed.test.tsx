import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { generateFeeds } from '@/server/render/feed/generator'

// `generateFeeds` threads a real `feed` package output, the content
// catalog, and the PT renderer together. Against the real engine this
// suite pins the channel-level envelope so a future refactor of
// `generator.tsx` cannot silently change the RSS/Atom output that
// downstream subscribers depend on.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedCategory(name: string, slug: string): Promise<number> {
  const rows = await db.insert(categoryTable).values({ name, slug, cover: '' }).returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug: string): Promise<number> {
  const rows = await db.insert(tagTable).values({ name, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

async function seedPost(opts: { slug: string; title: string; categoryId?: number }): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title,
      summary: '',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      categoryId: opts.categoryId ?? null,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function linkTag(postId: number, tagId: number): Promise<void> {
  await db.insert(postTag).values({ postId, tagId })
}

function itemCount(rss: string): number {
  return (rss.match(/<item>/g) ?? []).length
}

describe('services/feed — generateFeeds (channel envelope)', () => {
  it('produces both rss + atom strings even when there are zero posts', async () => {
    const feeds = await generateFeeds(db)

    expect(feeds.rss).toContain('<?xml version=')
    expect(feeds.atom).toContain('<?xml version=')
    expect(feeds.rss).toContain('<rss')
    expect(feeds.atom).toContain('<feed xml:lang="zh-CN" xmlns="http://www.w3.org/2005/Atom">')
  })

  it('declares zh-CN language on both feeds', async () => {
    const feeds = await generateFeeds(db)
    expect(feeds.rss).toContain('<language>zh-CN</language>')
    expect(feeds.atom).toContain('xml:lang="zh-CN"')
  })

  it('does not set a custom generator string (uses the feed library default)', async () => {
    const feeds = await generateFeeds(db)
    expect(feeds.rss).not.toContain('<generator>WordPress 3.2.1</generator>')
  })

  it('limits the selection to the configured feed page size', async () => {
    // The visibility policy itself (hidden included, scheduled excluded)
    // is pinned at the domain seam in
    // tests/unit/server/domains/posts/services/feed.test.ts.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      content: { ...TEST_BLOG_SETTINGS_BUNDLE.content!, feed: { full: true, size: 1 } },
    })
    await seedPost({ slug: 'first', title: 'First' })
    await seedPost({ slug: 'second', title: 'Second' })

    const feeds = await generateFeeds(db)
    expect(itemCount(feeds.rss)).toBe(1)
  })

  it('filters the selection by the category/tag scopes', async () => {
    const techId = await seedCategory('技术', 'tech')
    const tagId = await seedTag('react', 'react')
    await seedPost({ slug: 'in-tech', title: 'In Tech', categoryId: techId })
    const tagged = await seedPost({ slug: 'tagged-react', title: 'Tagged React' })
    await linkTag(tagged, tagId)

    const byCategory = await generateFeeds(db, { category: 'tech' })
    expect(itemCount(byCategory.rss)).toBe(1)
    expect(byCategory.rss).toContain('In Tech')

    const byTag = await generateFeeds(db, { tag: 'react' })
    expect(itemCount(byTag.rss)).toBe(1)
    expect(byTag.rss).toContain('Tagged React')
    expect(byTag.rss).not.toContain('In Tech')
  })

  it('resolves scopes by slug-or-name through the wired taxonomy resolvers', async () => {
    // Scoping by the display NAME (not the slug) only works when the
    // generator wires the real slug-or-name resolvers into the domain
    // selection.
    const techId = await seedCategory('技术', 'tech')
    const tagId = await seedTag('React', 'react')
    await seedPost({ slug: 'in-tech', title: 'In Tech', categoryId: techId })
    const tagged = await seedPost({ slug: 'tagged-react', title: 'Tagged React' })
    await linkTag(tagged, tagId)

    const byCategoryName = await generateFeeds(db, { category: '技术' })
    expect(itemCount(byCategoryName.rss)).toBe(1)
    expect(byCategoryName.rss).toContain('In Tech')

    const byTagName = await generateFeeds(db, { tag: 'React' })
    expect(itemCount(byTagName.rss)).toBe(1)
    expect(byTagName.rss).toContain('Tagged React')
  })

  it('does not emit `xml-stylesheet` (client XSLT is deprecated in browsers)', async () => {
    const feeds = await generateFeeds(db)
    expect(feeds.rss).not.toMatch(/xml-stylesheet/i)
    expect(feeds.atom).not.toMatch(/xml-stylesheet/i)
  })

  it('emits one <category> per known catalog category', async () => {
    await seedCategory('技术', 'tech')
    await seedCategory('杂谈', 'misc')

    const feeds = await generateFeeds(db)
    expect(feeds.rss).toContain('<category>技术</category>')
    expect(feeds.rss).toContain('<category>杂谈</category>')
  })

  it('uses /cats/<slug>/feed and /cats/<slug>/feed/atom URLs when scoped to a category', async () => {
    const feeds = await generateFeeds(db, { category: 'tech' })
    // The feedLinks self-references appear in the channel header.
    expect(feeds.atom).toContain('/cats/tech/feed')
  })

  it('uses /tags/<slug>/feed and /tags/<slug>/feed/atom URLs when scoped to a tag', async () => {
    const feeds = await generateFeeds(db, { tag: 'react' })
    // The feedLinks self-references appear in the channel header.
    expect(feeds.atom).toContain('/tags/react/feed')
  })

  it('rejects calls that pass both category and tag', async () => {
    await expect(generateFeeds(db, { category: 'tech', tag: 'react' })).rejects.toThrow(/at the same time/)
  })
})
