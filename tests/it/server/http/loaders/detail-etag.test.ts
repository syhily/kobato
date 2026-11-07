import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'

// Detail-page representation ETags through the real oRPC read path: the slim
// probe and the full-path re-check share one fingerprint (content row +
// APP_VERSION + locale + site time zone + display format). A settings change
// must stop an old `If-None-Match` from answering 304.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

const body: LexicalEditorState = lexicalBodyWith([lexicalParagraph('Body.')])

async function seedPost(slug: string): Promise<void> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: 'Etag post',
      summary: 'summary',
      published: true,
      visible: true,
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      firstPublishedAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
}

async function seedPage(slug: string): Promise<void> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug,
      title: 'Etag page',
      published: true,
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      firstPublishedAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
}

type DetailResult = { kind: string; etag?: string }

async function readPost(slug: string, ifNoneMatch?: string): Promise<DetailResult> {
  const res = await callRpc(
    '/content/posts/bySlug',
    ifNoneMatch === undefined ? { slug } : { slug, ifNoneMatch },
    makePublicCtx({ db }),
  )
  return parseRpcJson<DetailResult>(res)
}

async function readPage(slug: string, ifNoneMatch?: string): Promise<DetailResult> {
  const res = await callRpc(
    '/content/pages/bySlug',
    ifNoneMatch === undefined ? { slug } : { slug, ifNoneMatch },
    makePublicCtx({ db }),
  )
  return parseRpcJson<DetailResult>(res)
}

function withIdentity(overrides: { locale?: 'en-US'; timeZone?: string; timeFormat?: string | null }) {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, ...overrides },
  }
}

describe('detail representation ETags', () => {
  it('post: the same representation still answers not-modified', async () => {
    await seedPost('etag-post')
    const first = await readPost('etag-post')
    expect(first.kind).toBe('ok')
    expect(first.etag).toBeTruthy()

    const repeated = await readPost('etag-post', first.etag)
    expect(repeated.kind).toBe('not-modified')
    expect(repeated.etag).toBe(first.etag)
  })

  it('post: locale, time zone and display-format changes invalidate the old ETag', async () => {
    await seedPost('etag-post')
    const base = await readPost('etag-post')

    for (const settings of [
      withIdentity({ locale: 'en-US' }),
      withIdentity({ timeZone: 'America/New_York' }),
      withIdentity({ timeFormat: 'yyyy-LL-dd' }),
    ]) {
      setBlogSettingsBundleForTests(settings)
      const afterChange = await readPost('etag-post', base.etag)
      expect(afterChange.kind).toBe('ok')
      expect(afterChange.etag).not.toBe(base.etag)
      // Restore for the next dimension.
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })

  it('page: the same representation still answers not-modified', async () => {
    await seedPage('etag-page')
    const first = await readPage('etag-page')
    expect(first.kind).toBe('ok')

    const repeated = await readPage('etag-page', first.etag)
    expect(repeated.kind).toBe('not-modified')
  })

  it('page: locale and display-format changes invalidate the old ETag', async () => {
    await seedPage('etag-page')
    const base = await readPage('etag-page')

    for (const settings of [withIdentity({ locale: 'en-US' }), withIdentity({ timeFormat: null })]) {
      setBlogSettingsBundleForTests(settings)
      const afterChange = await readPage('etag-page', base.etag)
      expect(afterChange.kind).toBe('ok')
      expect(afterChange.etag).not.toBe(base.etag)
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })
})
