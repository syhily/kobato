import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { sqliteOf } from '@kobato/db/database'
import { updateCommentBodyAndContent } from '@kobato/db/operations/comment'
import { comment as commentTable } from '@kobato/db/schema/comment'
import { content as contentTable } from '@kobato/db/schema/content'
import { metric as metricTable } from '@kobato/db/schema/metric'
import { page as pageTable } from '@kobato/db/schema/page'
import { post as postTable } from '@kobato/db/schema/post'
import { postTag } from '@kobato/db/schema/post-tag'
import { tag as tagTable } from '@kobato/db/schema/taxonomy'
import { user as userTable } from '@kobato/db/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@kobato/inkling/headless/comment-schema'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T04:00:00.000Z'))
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.useRealTimers()
})

function sidebarBundle(counts: {
  recentPosts: number
  randomTags: number
  recentComments?: number
}): BlogSettingsBundle {
  const sidebar = TEST_BLOG_SETTINGS_BUNDLE.sidebar!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    sidebar: {
      sidebar: {
        ...sidebar.sidebar,
        widgets: sidebar.sidebar.widgets.map((widget) => {
          if (widget.type === 'recentPosts' || widget.type === 'randomTags') {
            return Object.assign({}, widget, { count: counts[widget.type] })
          }
          if (widget.type === 'recentComments' && counts.recentComments !== undefined) {
            return Object.assign({}, widget, { count: counts.recentComments })
          }
          return widget
        }),
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
  const rows = await sqliteOf(db)
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
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function seedComment(postId: number, content = 'first comment'): Promise<number> {
  const userRows = await sqliteOf(db)
    .insert(userTable)
    .values({ name: 'Commenter', email: `commenter-${randomUUID()}@example.com`, password: 'hashed' })
    .returning({ id: userTable.id })
  const rows = await sqliteOf(db)
    .insert(commentTable)
    .values({
      type: 'post',
      ownerId: postId,
      userId: userRows[0]!.id,
      content,
      body: EMPTY_COMMENT_EDITOR_STATE,
      rid: 0,
      rootId: 0,
      isPending: false,
    })
    .returning({ id: commentTable.id })
  return rows[0]!.id
}

async function seedPage(slug: string, draftBody?: LexicalEditorState): Promise<number> {
  const rows = await sqliteOf(db)
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
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  if (draftBody !== undefined) {
    await sqliteOf(db).insert(contentTable).values({
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
    '/public/content/posts/bySlug',
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
    '/public/content/pages/bySlug',
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
    vi.setSystemTime(new Date('2026-11-08T13:00:00.000Z'))
    const evening = await readPost('etag-post')
    expect(sidebarPostSlugs(evening)).toEqual(sidebarPostSlugs(morning))

    const rotations = new Set<string>()
    for (let day = 9; day <= 15; day++) {
      vi.setSystemTime(new Date(`2026-11-${day}T04:00:00.000Z`))
      rotations.add(sidebarPostSlugs(await readPost('etag-post')).join(','))
    }
    expect(rotations.size).toBeGreaterThan(1)
  })

  it('post: the sidebar rotation bucket follows the site time zone', async () => {
    await seedPost('etag-post')
    for (let i = 0; i < 6; i++) {
      await seedPost(`filler-${i}`)
    }

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
      const tagRows = await sqliteOf(db)
        .insert(tagTable)
        .values({ name: `tag-${i}`, slug: `tag-${i}` })
        .returning({ id: tagTable.id })
      await sqliteOf(db).insert(postTag).values({ postId, tagId: tagRows[0]!.id })
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
    const tagRows = await sqliteOf(db)
      .insert(tagTable)
      .values({ name: 'pinned', slug: 'pinned' })
      .returning({ id: tagTable.id })
    await sqliteOf(db).insert(postTag).values({ postId, tagId: tagRows[0]!.id })

    const pinned = sidebarBundle({ recentPosts: 0, randomTags: 0 })
    const res = await callRpc(
      '/public/content/posts/bySlug',
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

    await seedPost('sidebar-filler')
    const withSidebar = await readPost('etag-post', { ifNoneMatch: base.etag! })
    expect(withSidebar.kind).toBe('ok')
    expect(withSidebar.etag).not.toBe(base.etag)

    const metricWhere = and(eq(metricTable.type, 'post'), eq(metricTable.ownerId, postId))
    await sqliteOf(db).update(metricTable).set({ voteUp: 4 }).where(metricWhere)
    const withLikes = await readPost('etag-post', { ifNoneMatch: withSidebar.etag! })
    expect(withLikes.kind).toBe('ok')
    expect(withLikes.etag).not.toBe(withSidebar.etag)

    await sqliteOf(db).update(metricTable).set({ publicId: randomUUID() }).where(metricWhere)
    const withNewKey = await readPost('etag-post', { ifNoneMatch: withLikes.etag! })
    expect(withNewKey.kind).toBe('ok')
    expect(withNewKey.etag).not.toBe(withLikes.etag)
  })

  it('post: a new comment invalidates the old ETag even when the recent-comments widget is off', async () => {
    const bundle = sidebarBundle({ recentPosts: 5, randomTags: 10, recentComments: 0 })
    const localization: AppLocalization = {
      ...LOCALIZATION,
      revisions: representationRevisionsFor(bundle),
    }
    const postId = await seedPost('etag-post-comments')
    const base = await readPost('etag-post-comments', { settings: bundle, localization })

    await seedComment(postId)
    const afterReply = await readPost('etag-post-comments', {
      ifNoneMatch: base.etag!,
      settings: bundle,
      localization,
    })

    expect(afterReply.kind).toBe('ok')
    expect(afterReply.etag).not.toBe(base.etag)
  })

  it('post: a moderator comment edit invalidates the old ETag even when the sidebar is unchanged', async () => {
    const bundle = sidebarBundle({ recentPosts: 5, randomTags: 10, recentComments: 0 })
    const localization: AppLocalization = {
      ...LOCALIZATION,
      revisions: representationRevisionsFor(bundle),
    }
    const postId = await seedPost('etag-post-comment-edit')
    const commentId = await seedComment(postId, 'before moderation')
    const base = await readPost('etag-post-comment-edit', { settings: bundle, localization })

    await updateCommentBodyAndContent(db, commentId, EMPTY_COMMENT_EDITOR_STATE, 'after moderation')
    const afterEdit = await readPost('etag-post-comment-edit', {
      ifNoneMatch: base.etag!,
      settings: bundle,
      localization,
    })

    expect(afterEdit.kind).toBe('ok')
    expect(afterEdit.etag).not.toBe(base.etag)
  })

  it('post: the shipped comment fingerprint never takes the 64-hex anonymous CSRF token shape', async () => {
    const postId = await seedPost('etag-post-fingerprint-shape')
    await seedComment(postId)
    const result = await readPost('etag-post-fingerprint-shape')

    expect(result.kind).toBe('ok')
    const critical = (result.payload as { critical?: { commentsFingerprint?: string } } | undefined)?.critical
    expect(critical?.commentsFingerprint).toBeTruthy()
    expect(critical?.commentsFingerprint).not.toMatch(/[0-9a-f]{64}/)
  })

  it('post: a real settings save (new snapshot revision) invalidates the old ETag', async () => {
    await seedPost('etag-post')
    const first = await callRpc('/public/content/posts/bySlug', { slug: 'etag-post' }, makePublicCtx({ db }))
    const base = await parseRpcJson<DetailResult>(first)

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Renamed site' },
    })
    const res = await callRpc(
      '/public/content/posts/bySlug',
      { slug: 'etag-post', ifNoneMatch: base.etag! },
      makePublicCtx({ db }),
    )
    const afterSave = await parseRpcJson<DetailResult>(res)

    expect(afterSave.kind).toBe('ok')
    expect(afterSave.etag).not.toBe(base.etag)
  })

  it('post: a draft preview never carries or honours the published ETag', async () => {
    const rows = await sqliteOf(db)
      .insert(postTable)
      .values({ slug: 'secret', title: 'Secret', published: false, visible: false, authorId: 1 })
      .returning({ id: postTable.id })
    await sqliteOf(db).insert(contentTable).values({
      type: 'post',
      ownerId: rows[0]!.id,
      revisionNo: 1,
      status: 'draft',
      body,
    })

    const readDraft = (ifNoneMatch?: string) =>
      callRpc(
        '/public/content/posts/bySlug',
        ifNoneMatch === undefined ? { slug: 'secret' } : { slug: 'secret', ifNoneMatch },
        makeAuthedCtx({ role: 'author', userId: '1', db, localization: LOCALIZATION }),
      ).then((res) => parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string } }>(res))

    const first = await readDraft()
    expect(first.kind).toBe('ok')
    expect(first.etag).toBeNull()
    expect(first.payload.draftMarker).toBe('draft')

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

    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({ type: 'page', ownerId: pageId, revisionNo: 2, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))

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
