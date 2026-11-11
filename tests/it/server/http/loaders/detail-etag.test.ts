import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { metric as metricTable } from '@/server/infra/db/schema/metric'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

// Detail representation ETags through the real oRPC read path: the tag fingerprints the COMPLETE
// payload (post/page shell, body html, tags, sidebar, interaction critical) plus the published
// revision and the request's localization/settings revision. Only an identical representation may
// answer not-modified.

const db = getTestDb()

beforeEach(async () => {
  // Fake ONLY the clock: the sidebar rotation bucket is the site calendar day.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T04:00:00.000Z')) // 12:00 Asia/Shanghai
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.useRealTimers()
})

function sidebarBundle(counts: { recentPosts: number; randomTags: number }): BlogSettingsBundle {
  const sidebar = TEST_BLOG_SETTINGS_BUNDLE.sidebar!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    sidebar: {
      sidebar: {
        ...sidebar.sidebar,
        widgets: sidebar.sidebar.widgets.map((widget) =>
          widget.type === 'recentPosts' || widget.type === 'randomTags'
            ? Object.assign({}, widget, { count: counts[widget.type] })
            : widget,
        ),
      },
    },
  }
}

const body: LexicalEditorState = lexicalBodyWith([lexicalParagraph('Body.')])

const LOCALIZATION: AppLocalization = {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-MM-dd',
  revision: 'test-boot:0000000001',
  revisions: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE),
}

async function seedPost(slug: string): Promise<number> {
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
  return postId
}

async function seedPage(slug: string, draftBody?: LexicalEditorState): Promise<number> {
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
  if (draftBody !== undefined) {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: pageId,
      revisionNo: 2,
      status: 'draft',
      body: draftBody,
    })
  }
  return pageId
}

type SidebarPost = { permalink: string }
type DetailResult = {
  kind: string
  etag?: string | null
  payload?: { sidebarPosts: SidebarPost[]; tags: { slug: string }[] }
}

interface DetailCallOptions {
  ifNoneMatch?: string
  localization?: AppLocalization
  settings?: BlogSettingsBundle | null
}

function sidebarPostSlugs(result: DetailResult): string[] {
  return (result.payload?.sidebarPosts ?? []).map((post) => post.permalink)
}

function sidebarTagSlugs(result: DetailResult): string[] {
  return (result.payload?.tags ?? []).map((tag) => tag.slug)
}

async function readPost(slug: string, options: DetailCallOptions = {}): Promise<DetailResult> {
  const res = await callRpc(
    '/content/posts/bySlug',
    options.ifNoneMatch === undefined ? { slug } : { slug, ifNoneMatch: options.ifNoneMatch },
    makePublicCtx({
      db,
      localization: options.localization ?? LOCALIZATION,
      ...(options.settings === undefined ? {} : { settings: options.settings }),
    }),
  )
  return parseRpcJson<DetailResult>(res)
}

async function readPage(slug: string, options: DetailCallOptions & { draft?: boolean } = {}): Promise<DetailResult> {
  const input = { slug, ...(options.draft === true ? { draft: true } : {}) }
  const res = await callRpc(
    '/content/pages/bySlug',
    options.ifNoneMatch === undefined ? input : { ...input, ifNoneMatch: options.ifNoneMatch },
    options.draft === true
      ? makeAuthedCtx({ role: 'admin', db, localization: options.localization ?? LOCALIZATION })
      : makePublicCtx({
          db,
          localization: options.localization ?? LOCALIZATION,
          ...(options.settings === undefined ? {} : { settings: options.settings }),
        }),
  )
  return parseRpcJson<DetailResult>(res)
}

describe('detail representation ETags', () => {
  it('post: the same representation still answers not-modified', async () => {
    await seedPost('etag-post')
    const first = await readPost('etag-post')
    expect(first.kind).toBe('ok')
    expect(first.etag).toBeTruthy()

    const repeated = await readPost('etag-post', { ifNoneMatch: first.etag! })
    expect(repeated.kind).toBe('not-modified')
    expect(repeated.etag).toBe(first.etag)
  })

  it('post: a 6+ candidate sidebar pool still answers not-modified on a repeat request', async () => {
    await seedPost('etag-post')
    for (let i = 0; i < 6; i++) {
      await seedPost(`filler-${i}`)
    }

    const first = await readPost('etag-post')
    // The pool (7) overflows the widget count (5): the pick is a real sample.
    expect(first.payload?.sidebarPosts).toHaveLength(5)

    const repeated = await readPost('etag-post', { ifNoneMatch: first.etag! })
    expect(repeated.kind).toBe('not-modified')
    expect(repeated.etag).toBe(first.etag)
  })

  it('post: the sidebar is stable within one site day and rotates on the next', async () => {
    await seedPost('etag-post')
    for (let i = 0; i < 6; i++) {
      await seedPost(`filler-${i}`)
    }

    const morning = await readPost('etag-post')
    vi.setSystemTime(new Date('2026-11-08T13:00:00.000Z')) // still 11-08 in Shanghai
    const evening = await readPost('etag-post')
    expect(sidebarPostSlugs(evening)).toEqual(sidebarPostSlugs(morning))

    const rotations = new Set<string>()
    for (let day = 9; day <= 15; day++) {
      vi.setSystemTime(new Date(`2026-11-${day}T04:00:00.000Z`))
      rotations.add(sidebarPostSlugs(await readPost('etag-post')).join(','))
    }
    // A new site calendar day is a new rotation bucket — and therefore a new ETag.
    expect(rotations.size).toBeGreaterThan(1)
  })

  it('post: the sidebar rotation bucket follows the site time zone', async () => {
    await seedPost('etag-post')
    for (let i = 0; i < 6; i++) {
      await seedPost(`filler-${i}`)
    }

    // 17:30Z is still 11-08 in UTC but already 11-09 in Shanghai.
    vi.setSystemTime(new Date('2026-11-08T17:30:00.000Z'))
    const shanghai = await readPost('etag-post', {
      localization: { ...LOCALIZATION, timeZone: 'Asia/Shanghai' },
    })
    const utc = await readPost('etag-post', { localization: { ...LOCALIZATION, timeZone: 'UTC' } })

    expect(sidebarPostSlugs(utc)).not.toEqual(sidebarPostSlugs(shanghai))
  })

  it('post: random tags are stable within a day and rotate with the calendar day', async () => {
    setBlogSettingsBundleForTests(sidebarBundle({ recentPosts: 2, randomTags: 3 }))
    const postId = await seedPost('etag-post')

    for (let i = 0; i < 10; i++) {
      const tagRows = await db
        .insert(tagTable)
        .values({ name: `tag-${i}`, slug: `tag-${i}` })
        .returning({ id: tagTable.id })
      await db.insert(postTag).values({ postId, tagId: tagRows[0]!.id })
    }

    const first = await readPost('etag-post')
    const sameDay = await readPost('etag-post')
    expect(sidebarTagSlugs(sameDay)).toEqual(sidebarTagSlugs(first))
    expect(sidebarTagSlugs(first)).toHaveLength(3)

    const rotations = new Set<string>()
    for (let day = 9; day <= 15; day++) {
      vi.setSystemTime(new Date(`2026-11-${day}T04:00:00.000Z`))
      rotations.add(sidebarTagSlugs(await readPost('etag-post')).join(','))
    }
    expect(rotations.size).toBeGreaterThan(1)
  })

  it('post: sidebar widgets read the request-pinned settings, not the global snapshot', async () => {
    const postId = await seedPost('etag-post')
    const tagRows = await db.insert(tagTable).values({ name: 'pinned', slug: 'pinned' }).returning({ id: tagTable.id })
    await db.insert(postTag).values({ postId, tagId: tagRows[0]!.id })

    // Global settings keep recentPosts=5 / randomTags=10; the pinned bundle
    // disables both — the payload must follow the pinned capture.
    const pinned = sidebarBundle({ recentPosts: 0, randomTags: 0 })
    const res = await callRpc(
      '/content/posts/bySlug',
      { slug: 'etag-post' },
      makePublicCtx({ db, settings: pinned, localization: LOCALIZATION }),
    )
    const json = await parseRpcJson<DetailResult>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload?.sidebarPosts ?? []).toEqual([])
    expect(json.payload?.tags ?? []).toEqual([])
  })

  it.each<[string, Partial<AppLocalization>]>([
    ['locale', { locale: 'en-US' }],
    ['time zone', { timeZone: 'America/New_York' }],
    ['display format', { timeFormat: 'yyyy-LL-dd' }],
    ['settings revision', { revisions: { ...LOCALIZATION.revisions, detail: 'test-boot:0000000002' } }],
  ])('post: a %s change invalidates the old ETag', async (_name, override) => {
    await seedPost('etag-post')
    const base = await readPost('etag-post')

    const afterChange = await readPost('etag-post', {
      ifNoneMatch: base.etag!,
      localization: { ...LOCALIZATION, ...override },
    })
    expect(afterChange.kind).toBe('ok')
    expect(afterChange.etag).not.toBe(base.etag)
  })

  it('post: a sidebar, likes or comment-key change invalidates the old ETag', async () => {
    const postId = await seedPost('etag-post')
    const base = await readPost('etag-post')

    // Sidebar candidates are read by the controller on every request.
    await seedPost('sidebar-filler')
    const withSidebar = await readPost('etag-post', { ifNoneMatch: base.etag! })
    expect(withSidebar.kind).toBe('ok')
    expect(withSidebar.etag).not.toBe(base.etag)

    // Interaction critical: likes + the opaque comment page key.
    const metricWhere = and(eq(metricTable.type, 'post'), eq(metricTable.ownerId, postId))
    await db.update(metricTable).set({ voteUp: 4 }).where(metricWhere)
    const withLikes = await readPost('etag-post', { ifNoneMatch: withSidebar.etag! })
    expect(withLikes.kind).toBe('ok')
    expect(withLikes.etag).not.toBe(withSidebar.etag)

    await db.update(metricTable).set({ publicId: randomUUID() }).where(metricWhere)
    const withNewKey = await readPost('etag-post', { ifNoneMatch: withLikes.etag! })
    expect(withNewKey.kind).toBe('ok')
    expect(withNewKey.etag).not.toBe(withLikes.etag)
  })

  it('post: a real settings save (new snapshot revision) invalidates the old ETag', async () => {
    await seedPost('etag-post')
    // Both reads use the real lazy request capture, not an explicit projection.
    const first = await callRpc('/content/posts/bySlug', { slug: 'etag-post' }, makePublicCtx({ db }))
    const base = await parseRpcJson<DetailResult>(first)

    // Site-name style settings never appear in the detail payload — the
    // snapshot revision is what makes their change invalidate the tag.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Renamed site' },
    })
    const res = await callRpc(
      '/content/posts/bySlug',
      { slug: 'etag-post', ifNoneMatch: base.etag! },
      makePublicCtx({ db }),
    )
    const afterSave = await parseRpcJson<DetailResult>(res)

    expect(afterSave.kind).toBe('ok')
    expect(afterSave.etag).not.toBe(base.etag)
  })

  it('post: a draft preview never carries or honours the published ETag', async () => {
    const rows = await db
      .insert(postTable)
      .values({ slug: 'secret', title: 'Secret', published: false, visible: false, authorId: 1 })
      .returning({ id: postTable.id })
    await db.insert(contentTable).values({
      type: 'post',
      ownerId: rows[0]!.id,
      revisionNo: 1,
      status: 'draft',
      body,
    })

    const readDraft = (ifNoneMatch?: string) =>
      callRpc(
        '/content/posts/bySlug',
        ifNoneMatch === undefined ? { slug: 'secret' } : { slug: 'secret', ifNoneMatch },
        makeAuthedCtx({ role: 'author', userId: '1', db, localization: LOCALIZATION }),
      ).then((res) => parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string } }>(res))

    const first = await readDraft()
    expect(first.kind).toBe('ok')
    expect(first.etag).toBeNull()
    expect(first.payload.draftMarker).toBe('draft')

    // A draft body may differ from the published representation: any stored
    // published tag must be ignored, and no new tag is stamped.
    const repeated = await readDraft('W/"stale"')
    expect(repeated.kind).toBe('ok')
    expect(repeated.etag).toBeNull()
    expect(repeated.payload.draftMarker).toBe('draft')
  })

  it('page: the same representation still answers not-modified', async () => {
    await seedPage('etag-page')
    const first = await readPage('etag-page')
    expect(first.kind).toBe('ok')

    const repeated = await readPage('etag-page', { ifNoneMatch: first.etag! })
    expect(repeated.kind).toBe('not-modified')
  })

  it.each<[string, Partial<AppLocalization>]>([
    ['locale', { locale: 'zh-TW' }],
    ['settings revision', { revisions: { ...LOCALIZATION.revisions, detail: 'test-boot:0000000003' } }],
  ])('page: a %s change invalidates the old ETag', async (_name, override) => {
    await seedPage('etag-page')
    const base = await readPage('etag-page')

    const afterChange = await readPage('etag-page', {
      ifNoneMatch: base.etag!,
      localization: { ...LOCALIZATION, ...override },
    })
    expect(afterChange.kind).toBe('ok')
    expect(afterChange.etag).not.toBe(base.etag)
  })

  it('page: a drafts revision change invalidates the published ETag', async () => {
    const pageId = await seedPage('etag-page')
    const base = await readPage('etag-page')

    const revisions = await db
      .insert(contentTable)
      .values({ type: 'page', ownerId: pageId, revisionNo: 2, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))

    const republished = await readPage('etag-page', { ifNoneMatch: base.etag! })
    expect(republished.kind).toBe('ok')
    expect(republished.etag).not.toBe(base.etag)
  })

  it('page: a `?draft=true` preview always renders, even with a matching published tag', async () => {
    await seedPage('about', lexicalBodyWith([lexicalParagraph('Draft body.')]))
    const published = await readPage('about')

    const draft = await readPage('about', { draft: true, ifNoneMatch: published.etag! })
    expect(draft.kind).toBe('ok')
    expect(draft.etag).toBeNull()
  })
})
