import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { emptyLexicalBody, lexicalBodyWith, lexicalImage, lexicalParagraph } from '#/_helpers/lexical'
import {
  backfillStorageAssetUrls,
  runAssetUrlBackfillOnceAtBoot,
} from '@/server/domains/content/services/asset-url-backfill'
import { setting } from '@/server/infra/db/schema/config'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { friend as friendTable } from '@/server/infra/db/schema/friend'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'

// The default test bundle pins the current CDN base: https://assets.example.com.
const CDN = 'https://assets.example.com'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPostWithBody(opts: { slug: string; cover?: string; body: unknown }): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.slug,
      cover: opts.cover ?? '',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: opts.body })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function postCover(id: number): Promise<string> {
  const rows = await db.select({ cover: postTable.cover }).from(postTable).where(eq(postTable.id, id))
  return rows[0]!.cover
}

function contentRowOf(postId: number) {
  return db.select().from(contentTable).where(eq(contentTable.ownerId, postId)).all()[0]!
}

async function contentBodyOf(postId: number): Promise<unknown> {
  return contentRowOf(postId).body
}

describe('content/services/asset-url-backfill — backfillStorageAssetUrls', () => {
  it('rewrites baked CDN-absolute URLs in bodies and cover/poster columns', async () => {
    const postId = await seedPostWithBody({
      slug: 'p1',
      cover: `${CDN}/images/cover.jpg`,
      body: lexicalBodyWith([
        lexicalImage({ src: `${CDN}/images/baked.jpg`, storagePath: 'images/baked.jpg', width: null, height: null }),
        lexicalImage({ src: `${CDN}/images/resolved.jpg`, width: null, height: null }),
        lexicalImage({ src: 'https://external.example/hotlink.jpg', width: null, height: null }),
      ]),
    })
    await db.insert(pageTable).values({
      slug: 'pg1',
      title: 'pg1',
      cover: 'https://moved.example/storage/images/page-cover.jpg',
      published: true,
      publishedAt: new Date('2024-01-01'),
    })
    await db.insert(friendTable).values({
      website: 'F',
      homepage: 'https://f.example',
      poster: 'https://friend.example/poster.jpg',
    })
    await db.insert(categoryTable).values({ name: 'Cat', slug: 'cat', cover: `${CDN}/images/cat.jpg` })
    // First-party site route — never rewritten.
    await db.insert(categoryTable).values({ name: 'Og', slug: 'og', cover: '/images/og/cats/og.png' })

    const result = await backfillStorageAssetUrls(db)

    expect(result).toEqual({ contentRows: 1, posts: 1, pages: 1, friends: 0, categories: 1, skippedContentRows: 0 })
    expect(await postCover(postId)).toBe('/storage/images/cover.jpg')
    const body = (await contentBodyOf(postId)) as LexicalEditorState
    const srcs = body.root.children.map((node) => (node as unknown as { src: string }).src)
    expect(srcs[0]).toBe('/storage/images/baked.jpg')
    expect(srcs[1]).toBe('/storage/images/resolved.jpg')
    expect(srcs[2]).toBe('https://external.example/hotlink.jpg')

    const pages = await db.select({ cover: pageTable.cover }).from(pageTable)
    expect(pages[0]!.cover).toBe('/storage/images/page-cover.jpg')
    const friends = await db.select({ poster: friendTable.poster }).from(friendTable)
    expect(friends[0]!.poster).toBe('https://friend.example/poster.jpg')
    const categories = await db.select({ cover: categoryTable.cover }).from(categoryTable).orderBy(categoryTable.id)
    expect(categories[0]!.cover).toBe('/storage/images/cat.jpg')
    expect(categories[1]!.cover).toBe('/images/og/cats/og.png')
  })

  it('is idempotent — a second run rewrites nothing', async () => {
    await seedPostWithBody({
      slug: 'p1',
      cover: `${CDN}/images/cover.jpg`,
      body: lexicalBodyWith([lexicalImage({ src: `${CDN}/images/baked.jpg`, width: null, height: null })]),
    })

    const first = await backfillStorageAssetUrls(db)
    expect(first.contentRows).toBe(1)
    expect(first.posts).toBe(1)

    const second = await backfillStorageAssetUrls(db)
    expect(second).toEqual({ contentRows: 0, posts: 0, pages: 0, friends: 0, categories: 0, skippedContentRows: 0 })
  })
})

describe('content/services/asset-url-backfill — Lexical bodies', () => {
  it('rewrites Lexical image nodes and nested card HTML, re-deriving the projection columns', async () => {
    const postId = await seedPostWithBody({
      slug: 'lex1',
      body: lexicalBodyWith([
        // No width/height: the full-fidelity render would otherwise emit a
        // transform srcset derived from the (test-pinned) asset host.
        lexicalImage({ src: `${CDN}/images/baked.jpg`, storagePath: 'images/baked.jpg', width: null, height: null }),
        {
          type: 'solution',
          version: 1,
          content: `<figure><img src="${CDN}/images/nested.jpg" alt="n" /></figure>`,
        },
      ]),
    })

    const result = await backfillStorageAssetUrls(db)

    expect(result.contentRows).toBe(1)
    expect(result.skippedContentRows).toBe(0)
    const row = contentRowOf(postId)
    const body = row.body as LexicalEditorState
    expect((body.root.children[0] as unknown as { src: string }).src).toBe('/storage/images/baked.jpg')
    expect((body.root.children[1] as unknown as { content: string }).content).toContain(
      'src="/storage/images/nested.jpg"',
    )
    expect(row.bodyHtmlFeed).toContain('/storage/images/baked.jpg')
    expect(row.bodyHtmlFeed).toContain('/storage/images/nested.jpg')
    expect(row.bodyHtmlFeed).not.toContain(CDN)
    // The image node's alt text feeds the plain-text projection.
    expect(row.bodyText).toContain('cover')
  })

  it('is idempotent on Lexical rows — a second run rewrites nothing', async () => {
    await seedPostWithBody({
      slug: 'lex1',
      body: lexicalBodyWith([
        lexicalImage({ src: `${CDN}/images/baked.jpg`, width: null, height: null }),
        { type: 'solution', version: 1, content: `<figure><img src="${CDN}/images/nested.jpg" alt="n" /></figure>` },
      ]),
    })

    const first = await backfillStorageAssetUrls(db)
    expect(first.contentRows).toBe(1)

    const second = await backfillStorageAssetUrls(db)
    expect(second).toEqual({ contentRows: 0, posts: 0, pages: 0, friends: 0, categories: 0, skippedContentRows: 0 })
  })

  it('counts rows whose body is not a Lexical state as skipped and backfills the rest', async () => {
    const garbageId = await seedPostWithBody({ slug: 'garbage', body: { not: 'a-body' } })
    const okId = await seedPostWithBody({
      slug: 'ok',
      body: lexicalBodyWith([
        lexicalParagraph('hello'),
        lexicalImage({ src: `${CDN}/images/x.jpg`, width: null, height: null }),
      ]),
    })

    const result = await backfillStorageAssetUrls(db)

    expect(result.skippedContentRows).toBe(1)
    expect(result.contentRows).toBe(1)
    expect(await contentBodyOf(garbageId)).toEqual({ not: 'a-body' })
    const body = (await contentBodyOf(okId)) as LexicalEditorState
    expect((body.root.children[1] as unknown as { src: string }).src).toBe('/storage/images/x.jpg')
  })
})

describe('content/services/asset-url-backfill — boot flag', () => {
  const FLAG_SCOPE = 'system.asset-url-backfill'

  it('runs once, persists the flag, and no-ops on later boots', async () => {
    const postId = await seedPostWithBody({ slug: 'p1', cover: `${CDN}/images/cover.jpg`, body: emptyLexicalBody() })

    await runAssetUrlBackfillOnceAtBoot(db)
    expect(await postCover(postId)).toBe('/storage/images/cover.jpg')
    expect(findFlag()).not.toBeNull()

    // A row dirtied AFTER the flag proves the second boot call is a no-op.
    const lateId = await seedPostWithBody({ slug: 'p2', cover: `${CDN}/images/late.jpg`, body: emptyLexicalBody() })
    await runAssetUrlBackfillOnceAtBoot(db)
    expect(await postCover(lateId)).toBe(`${CDN}/images/late.jpg`)

    // The ungated engine (migration hook) still rewrites it.
    await backfillStorageAssetUrls(db)
    expect(await postCover(lateId)).toBe('/storage/images/late.jpg')
  })

  it('withholds the flag while rows are skipped, then writes it once a clean run passes', async () => {
    const garbageId = await seedPostWithBody({ slug: 'garbage', body: { not: 'a-body' } })

    await runAssetUrlBackfillOnceAtBoot(db)
    expect(findFlag()).toBeNull()

    // Repair the row — the next boot retries the whole corpus and succeeds.
    await db
      .update(contentTable)
      .set({ body: lexicalBodyWith([lexicalParagraph('repaired')]) })
      .where(eq(contentTable.ownerId, garbageId))
    await runAssetUrlBackfillOnceAtBoot(db)
    expect(findFlag()).not.toBeNull()
  })

  function findFlag() {
    const rows = db.select().from(setting).where(eq(setting.scope, FLAG_SCOPE)).all()
    return rows[0] ?? null
  }
})
