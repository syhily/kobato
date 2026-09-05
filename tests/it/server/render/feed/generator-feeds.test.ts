import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { generateFeeds } from '@/server/render/feed/generator'

// `generateFeeds` perimeter against the real engine: the RSS/Atom envelope
// plus `selectFeedPosts` wiring (scope, size, miss → empty-feed policy), and
// the end-to-end state → save-time projections → columns → feed XML path.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  // The projections absolutize media srcs against siteIdentity.website.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedCategory(name: string, slug: string): Promise<number> {
  const rows = await db.insert(categoryTable).values({ name, slug, cover: '' }).returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug: string): Promise<number> {
  const rows = await db.insert(tagTable).values({ name, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

async function seedPost(opts: {
  slug: string
  title: string
  summary?: string
  categoryId?: number
  body?: LexicalEditorState
}): Promise<number> {
  const body = opts.body ?? lexicalBodyWith([lexicalParagraph('')])
  const projections = await computeBodyProjections(body)
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title,
      summary: opts.summary ?? '',
      published: true,
      publishedAt: new Date('2024-01-01'),
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
      body,
      bodyHtml: projections.bodyHtml,
      bodyText: projections.bodyText,
      bodyHtmlFeed: projections.bodyHtmlFeed,
    })
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

describe('render/feed/generator — generateFeeds', () => {
  it('generates a feed with no posts', async () => {
    const result = await generateFeeds(db)
    expect(result.rss).toContain('<?xml')
    expect(result.atom).toContain('xml:lang="zh-CN"')
    expect(itemCount(result.rss)).toBe(0)
  })

  it('generates a feed with one post including its rendered content', async () => {
    const categoryId = await seedCategory('默认分类', 'default')
    const tagId = await seedTag('react', 'react')
    const postId = await seedPost({
      slug: 'hello',
      title: 'Hello',
      summary: 'A summary',
      categoryId,
      body: lexicalBodyWith([lexicalParagraph('body text')]),
    })
    await linkTag(postId, tagId)

    const result = await generateFeeds(db)
    expect(result.rss).toContain('Hello')
    expect(result.rss).toContain('body text')
    expect(itemCount(result.rss)).toBe(1)
  })

  it("lands a code block's code text in the feed XML (RN-1 regression)", async () => {
    // Feed must keep the code text: sanitize-html used to drop CDATA-wrapped highlightedHtml.
    await seedPost({
      slug: 'with-code',
      title: 'With Code',
      body: lexicalBodyWith([
        {
          type: 'codeblock',
          version: 1,
          code: 'const answer = 42;',
          language: 'ts',
          caption: '',
          highlightedHtml: '<pre class="shiki"><code><span>const answer = 42;</span></code></pre>',
        },
      ]),
    })

    const result = await generateFeeds(db)
    expect(itemCount(result.rss)).toBe(1)
    expect(result.rss).toContain('const answer = 42;')
    expect(result.atom).toContain('const answer = 42;')
    // The feed variant never carries the Shiki markup.
    expect(result.rss).not.toContain('shiki')
  })

  it('degrades math, two-column, and music-player cards end-to-end in the RSS XML', async () => {
    await seedPost({
      slug: 'rich',
      title: 'Rich',
      body: lexicalBodyWith([
        { type: 'math', version: 1, tex: 'E=mc^2', mathml: '<math><mi>E</mi></math>', svg: '' },
        { type: 'two-column', version: 1, left: '<p>左栏</p>', right: '<p>右栏</p>' },
        {
          type: 'music-player',
          version: 1,
          playerId: 'p1',
          name: 'Song',
          artist: 'Artist',
          cover: '/storage/music/cover.png',
          audioUrl: '/storage/music/song.mp3',
          lyric: '',
        },
      ]),
    })

    const result = await generateFeeds(db)
    expect(itemCount(result.rss)).toBe(1)
    // Math → escaped TeX pre/code, never MathML/SVG.
    expect(result.rss).toContain('E=mc^2')
    expect(result.rss).not.toContain('<math>')
    // Two-column flattens to left + right panes.
    expect(result.rss).toContain('左栏')
    expect(result.rss).toContain('右栏')
    expect(result.rss).not.toContain('data-pt-two-column')
    // Music player → static figure with origin-absolutized media srcs.
    expect(result.rss).toContain('🎵 Song — Artist')
    expect(result.rss).toContain('https://example.com/storage/music/song.mp3')
  })

  it('throws DomainError when both category and tag are provided', async () => {
    await expect(generateFeeds(db, { category: 'c', tag: 't' })).rejects.toMatchObject({ name: 'DomainError' })
  })

  it('scopes the selection to the category and honors the configured feed size', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      content: { ...TEST_BLOG_SETTINGS_BUNDLE.content!, feed: { full: true, size: 2 } },
    })
    const techId = await seedCategory('技术', 'tech')
    const miscId = await seedCategory('杂谈', 'misc')
    for (let i = 0; i < 3; i++) {
      await seedPost({ slug: `tech-${i}`, title: `Tech ${i}`, categoryId: techId })
    }
    await seedPost({ slug: 'misc-0', title: 'Misc 0', categoryId: miscId })

    const result = await generateFeeds(db, { category: 'tech' })
    expect(itemCount(result.rss)).toBe(2)
    expect(result.rss).toContain('Tech')
    expect(result.rss).not.toContain('Misc 0')
  })

  it('scopes the selection to the tag', async () => {
    const tagId = await seedTag('react', 'react')
    const tagged = await seedPost({ slug: 'tagged', title: 'Tagged Post' })
    await linkTag(tagged, tagId)
    await seedPost({ slug: 'untagged', title: 'Untagged Post' })

    const result = await generateFeeds(db, { tag: 'react' })
    expect(itemCount(result.rss)).toBe(1)
    expect(result.rss).toContain('Tagged Post')
    expect(result.rss).not.toContain('Untagged Post')
  })

  it('renders an empty feed when the scope resolves to nothing', async () => {
    await seedPost({ slug: 'hello', title: 'Hello' })

    const result = await generateFeeds(db, { category: 'missing' })
    expect(result.rss).toContain('<?xml')
    expect(itemCount(result.rss)).toBe(0)
    expect(result.rss).not.toContain('Hello')
  })
})
