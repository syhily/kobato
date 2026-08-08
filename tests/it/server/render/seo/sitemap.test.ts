import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { buildSitemapXml } from '@/server/render/seo/sitemap'

// Sitemap XML from the real slim projections + live gate; the worker-seeded
// settings pin `siteIdentity.website = https://example.com`.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(opts: {
  slug: string
  firstPublishedAt?: Date | null
  publishedAt: Date
  published?: boolean
  withRevision?: boolean
}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.slug,
      published: opts.published ?? true,
      publishedAt: opts.publishedAt,
      firstPublishedAt: opts.firstPublishedAt ?? null,
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  if (opts.withRevision ?? true) {
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
  return postId
}

async function seedPage(opts: { slug: string; firstPublishedAt?: Date | null; publishedAt: Date }): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug: opts.slug,
      title: opts.slug,
      published: true,
      publishedAt: opts.publishedAt,
      firstPublishedAt: opts.firstPublishedAt ?? null,
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

describe('buildSitemapXml', () => {
  it('emits a valid xml preamble + urlset shell when there are no posts or pages', async () => {
    const xml = await buildSitemapXml(db)

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://example.com/</loc></url>',
        '</urlset>',
      ].join('\n'),
    )
  })

  it('renders a <url> entry per post with /posts/ prefix and lastmod from firstPublishedAt', async () => {
    const published = new Date('2024-06-01T00:00:00.000Z')
    await seedPost({ slug: 'hello-world', firstPublishedAt: published, publishedAt: published })

    const xml = await buildSitemapXml(db)

    expect(xml).toContain(
      `  <url><loc>https://example.com/posts/hello-world</loc><lastmod>${published.toISOString()}</lastmod></url>`,
    )
  })

  it('falls back to publishedAt when firstPublishedAt is null', async () => {
    const publishedAt = new Date('2024-07-15T12:00:00.000Z')
    await seedPost({ slug: 'no-first', firstPublishedAt: null, publishedAt })

    const xml = await buildSitemapXml(db)

    expect(xml).toContain(
      `  <url><loc>https://example.com/posts/no-first</loc><lastmod>${publishedAt.toISOString()}</lastmod></url>`,
    )
  })

  it('renders page entries with the /<slug> prefix (no /posts segment)', async () => {
    const date = new Date('2024-08-01T00:00:00.000Z')
    await seedPage({ slug: 'about', firstPublishedAt: date, publishedAt: date })

    const xml = await buildSitemapXml(db)

    expect(xml).toContain(`  <url><loc>https://example.com/about</loc><lastmod>${date.toISOString()}</lastmod></url>`)
    expect(xml).not.toContain('https://example.com/posts/about')
  })

  it('excludes drafts and scheduled posts through the real live gate', async () => {
    const date = new Date('2024-09-01T00:00:00.000Z')
    await seedPost({ slug: 'only-published', firstPublishedAt: date, publishedAt: date })
    // published = false — the live gate's `published` leg drops it.
    await seedPost({ slug: 'draft-post', published: false, publishedAt: date, withRevision: false })
    // Published with a revision but dated in the future — the `publishedAt <= now` leg drops it.
    await seedPost({ slug: 'scheduled-post', publishedAt: new Date('2099-01-01') })

    const xml = await buildSitemapXml(db)

    const postUrls = xml.match(/<loc>https:\/\/example\.com\/posts\/[^<]+<\/loc>/g) ?? []
    expect(postUrls).toEqual(['<loc>https://example.com/posts/only-published</loc>'])
  })

  it('escapes special XML characters in loc', async () => {
    // Slugs are URL-safe by validation, but the builder must still escape `&`/`<`/`>` for well-formed XML.
    const date = new Date('2024-10-01T00:00:00.000Z')
    await seedPost({ slug: 'a&b<c>', firstPublishedAt: date, publishedAt: date })

    const xml = await buildSitemapXml(db)

    expect(xml).toContain('<loc>https://example.com/posts/a&amp;b&lt;c&gt;</loc>')
    expect(xml).not.toContain('posts/a&b<c>')
  })
})
