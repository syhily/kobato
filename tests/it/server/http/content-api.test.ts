import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { getBlogSettingsSnapshotSync } from '@/shared/config/getters'
import { isPublicMessageKey } from '@/shared/i18n/catalog-scope'
import { kobatoInklingLabelsZhCN } from '@/shared/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhTW } from '@/shared/i18n/inkling-labels/zh-TW'
import { serverMessagesZhCN } from '@/shared/i18n/messages/server/zh-CN'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'

// The `content.*` read procedures over the real RPCHandler JSON round-trip:
// union signals (redirect / not-modified), NOT_FOUNDs, and happy-path payloads.

const db = getTestDb()

/** A public document's message ids: the shared public allowlist. */
function publicUiKeys(catalog: Record<string, string>): string[] {
  return Object.keys(catalog)
    .filter((key) => isPublicMessageKey(key))
    .sort()
}

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

const publishedBody: LexicalEditorState = lexicalBodyWith([lexicalParagraph('Published body.')])

async function seedPost(
  opts: Partial<typeof postTable.$inferInsert> & { body?: LexicalEditorState } = {},
): Promise<number> {
  const { body, ...meta } = opts
  const rows = await db
    .insert(postTable)
    .values({
      slug: meta.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Untitled react notes',
      summary: 'react summary',
      published: meta.published ?? true,
      publishedAt: meta.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: meta.firstPublishedAt ?? new Date('2024-01-01'),
      visible: meta.visible ?? true,
      ...meta,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: body ?? lexicalBodyWith([]) })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

/** A draft post: unpublished, hidden, no published revision pointer, one draft revision. */
async function seedDraftPost(slug: string, title: string, authorId: number | null = null): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title, published: false, visible: false, publishedRevisionId: null, authorId })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'draft', body: publishedBody })
  return postId
}

async function seedPage(
  opts: Partial<typeof pageTable.$inferInsert> & { body?: LexicalEditorState; draftBody?: LexicalEditorState } = {},
): Promise<number> {
  const { body, draftBody, ...meta } = opts
  const rows = await db
    .insert(pageTable)
    .values({
      slug: meta.slug ?? `page-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Untitled',
      published: meta.published ?? true,
      publishedAt: meta.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: meta.firstPublishedAt ?? new Date('2024-01-01'),
      ...meta,
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  if (meta.published ?? true) {
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: body ?? lexicalBodyWith([]) })
      .returning({ id: contentTable.id })
    await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  }
  if (draftBody !== undefined) {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: pageId,
      revisionNo: (meta.published ?? true) ? 2 : 1,
      status: 'draft',
      body: draftBody,
    })
  }
  return pageId
}

type RpcError = { code: string; status: number; message: string }

/** Shrink the `resource` bucket so the second hit in a window trips. */
function seedSingleAttemptResourceBucket() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: { ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!, resource: { windowSeconds: 60, maxAttempts: 1 } },
  })
}

describe('content.bootstrap', () => {
  it('returns the root data segment (identity, redacted bundle, fonts, csrf token)', async () => {
    const res = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      admin: boolean
      currentUser: unknown
      blogSettings: { siteIdentity: { title: string } } | null
      fonts: { global: unknown[]; post: unknown[]; code: unknown[] } | null
      theme: string | null
      csrfToken: string
    }>(res)

    expect(json.admin).toBe(false)
    expect(json.currentUser).toBeNull()
    expect(json.blogSettings?.siteIdentity.title).toBe('且听书吟')
    // The fixture's font slots are empty — the resolver answers the empty shape.
    expect(json.fonts).toEqual({ global: [], post: [], code: [] })
    expect(json.csrfToken).toBe('test-csrf-token')
  })

  it('parses the theme cookie inside the procedure (dark / light)', async () => {
    const dark = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'kobato-blog-theme=dark' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(dark)).theme).toBe('dark')

    const light = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'other=1; kobato-blog-theme=light' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(light)).theme).toBe('light')
  })

  it('ships exactly the public namespace allowlist and the settings revision for a public document', async () => {
    const res = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    const json = await parseRpcJson<{
      i18n: { locale: string; messages: Record<string, string>; revision: string }
    }>(res)

    expect(json.i18n.locale).toBe('zh-CN')
    expect(json.i18n.messages['common.action.save']).toBe('保存')
    // Workspace-only families stay home — not just `admin.*`:
    expect(json.i18n.messages['admin.settings.general.title']).toBeUndefined()
    expect(json.i18n.messages['backup.error.notFound']).toBeUndefined()
    expect(json.i18n.messages['storage.error.invalidPath']).toBeUndefined()
    expect(
      Object.keys(json.i18n.messages).filter((key) => key.startsWith('admin.') && !key.startsWith('admin.toast.')),
    ).toEqual([])
    // Exactly the allowlisted public UI subset — email/notification/server keys never cross the wire.
    expect(Object.keys(json.i18n.messages).sort()).toEqual(publicUiKeys(uiMessagesZhCN))
    for (const key of Object.keys(serverMessagesZhCN)) {
      expect(Object.hasOwn(json.i18n.messages, key)).toBe(false)
    }
    // The representation token travels with the payload so peers can dedupe.
    expect(json.i18n.revision).toBe(getBlogSettingsSnapshotSync().revision)
  })

  it('ships the full catalog and the active locale Inkling labels to a SIGNED-IN workspace document', async () => {
    for (const path of ['/admin/settings', '/editor/post/new']) {
      const res = await callRpc(
        '/content/bootstrap',
        undefined,
        makeAuthedCtx({ db, csrfToken: 'test-csrf-token', url: `http://localhost${path}` }),
      )
      const json = await parseRpcJson<{
        i18n: { locale: string; messages: Record<string, string>; inklingLabels: Record<string, string> }
      }>(res)

      expect(Object.keys(json.i18n.messages).sort(), path).toEqual(Object.keys(uiMessagesZhCN).sort())
      expect(json.i18n.messages['meta.title.admin.dashboard'], path).toBe('欢迎')
      expect(json.i18n.messages['backup.error.notFound'], path).toBeDefined()
      // One complete table for the ACTIVE locale (the editor chrome's own tokens).
      expect(json.i18n.inklingLabels, path).toEqual(kobatoInklingLabelsZhCN)
      expect(json.i18n.inklingLabels['placeholder.editor'], path).toBe('开始撰写内容…')
      expect(json.i18n.inklingLabels['menu.host.solution.label'], path).toBe('解答块')
      // The other locales' tables never travel with the payload.
      expect(JSON.stringify(json.i18n.inklingLabels), path).not.toContain('程式碼區塊') // zh-TW
      expect(JSON.stringify(json.i18n.inklingLabels), path).not.toContain('「開始撰寫內容」')
    }

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'zh-TW' },
    })
    const localized = await callRpc(
      '/content/bootstrap',
      undefined,
      makeAuthedCtx({ db, csrfToken: 'test-csrf-token', url: 'http://localhost/admin/settings' }),
    )
    const localizedJson = await parseRpcJson<{ i18n: { locale: string; inklingLabels: Record<string, string> } }>(
      localized,
    )
    expect(localizedJson.i18n.locale).toBe('zh-TW')
    expect(localizedJson.i18n.inklingLabels).toEqual(kobatoInklingLabelsZhTW)
    expect(JSON.stringify(localizedJson.i18n.inklingLabels)).not.toContain('开始撰写内容…') // zh-CN
  })

  it('keeps auth/setup on the workspace catalog but without an editor label table', async () => {
    for (const path of ['/admin/signin', '/admin/setup']) {
      const res = await callRpc(
        '/content/bootstrap',
        undefined,
        makePublicCtx({ db, csrfToken: 'test-csrf-token', url: `http://localhost${path}` }),
      )
      const json = await parseRpcJson<{
        i18n: { messages: Record<string, string>; inklingLabels?: Record<string, string> }
      }>(res)

      // Auth copy is workspace-scoped: the whole catalog (sign-in, OTP, setup).
      expect(Object.keys(json.i18n.messages).sort(), path).toEqual(Object.keys(uiMessagesZhCN).sort())
      expect(json.i18n.messages['auth.setup.intro'], path).toBeDefined()
      // No signed-in editor exists on these pages → no label table.
      expect(json.i18n, path).not.toHaveProperty('inklingLabels')
    }
  })

  it('public documents never carry an Inkling label table', async () => {
    const res = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    const json = await parseRpcJson<{ i18n: Record<string, unknown> }>(res)

    expect(json.i18n).not.toHaveProperty('inklingLabels')
    expect(JSON.stringify(json.i18n)).not.toContain('开始撰写内容…')
  })

  it('follows the configured locale, and defaults pre-install', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
    })
    const localized = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token' }),
    )
    const localizedJson = await parseRpcJson<{ i18n: { locale: string; messages: Record<string, string> } }>(localized)
    expect(localizedJson.i18n.locale).toBe('en-US')
    expect(Object.keys(localizedJson.i18n.messages).sort()).toEqual(publicUiKeys(uiMessagesEnUS))
    expect(localizedJson.i18n.messages['common.action.save']).toBe('Save')

    // Pre-install: no settings row at all — the default locale still ships a scoped catalog.
    setBlogSettingsBundleForTests(null)
    const preinstall = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token' }),
    )
    const preinstallJson = await parseRpcJson<{ i18n: { locale: string; messages: Record<string, string> } }>(
      preinstall,
    )
    expect(preinstallJson.i18n.locale).toBe('zh-CN')
    expect(Object.keys(preinstallJson.i18n.messages).sort()).toEqual(publicUiKeys(uiMessagesZhCN))
  })

  it('answers a null theme when the cookie is absent or invalid', async () => {
    const absent = await callRpc('/content/bootstrap', undefined, makePublicCtx({ db, csrfToken: 'test-csrf-token' }))
    expect((await parseRpcJson<{ theme: string | null }>(absent)).theme).toBeNull()

    const invalid = await callRpc(
      '/content/bootstrap',
      undefined,
      makePublicCtx({ db, csrfToken: 'test-csrf-token', cookie: 'kobato-blog-theme=neon' }),
    )
    expect((await parseRpcJson<{ theme: string | null }>(invalid)).theme).toBeNull()
  })
})

describe('content.home', () => {
  it('returns the ok listing payload', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc('/content/home', {}, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      listing: { pageNum: number; totalPage: number; resolvedPosts: unknown[] }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.listing.pageNum).toBe(1)
    expect(json.listing.totalPage).toBe(2)
    expect(json.listing.resolvedPosts).toHaveLength(6)
  })

  it('answers the overflow redirect as a union member (302 to the last page)', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc('/content/home', { num: '9999' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/page/2', status: 302 })
  })

  it('collapses /page/1 to the canonical root as a redirect union member', async () => {
    const res = await callRpc('/content/home', { num: '1' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/', status: 302 })
  })
})

describe('content.posts.list', () => {
  it('returns the tag-scoped listing', async () => {
    const tagId = await seedTag('typescript', 'typescript')
    const postId = await seedPost({ slug: 'tagged-post' })
    await db.insert(postTag).values({ postId, tagId })

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'tag', slug: 'typescript' } },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; listing: { title?: string; resolvedPosts: { slug: string }[] } }>(
      res,
    )

    expect(json.kind).toBe('ok')
    expect(json.listing.title).toBe('typescript')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('tagged-post')
  })

  it('returns the category-scoped listing', async () => {
    const categoryId = await seedCategory('general', 'general')
    await seedPost({ slug: 'categorized-post', categoryId })

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'category', slug: 'general' } },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      listing: { rootPath: string; title?: string; resolvedPosts: { slug: string }[] }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.listing.rootPath).toBe('/cats/general')
    expect(json.listing.title).toBe('general')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('categorized-post')
  })

  it('answers the category overflow redirect as a union member', async () => {
    const categoryId = await seedCategory('general', 'general')
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `post-${i}`, categoryId, publishedAt: new Date(Date.UTC(2024, 0, i + 1)) })
    }

    const res = await callRpc(
      '/content/posts/list',
      { scope: { type: 'category', slug: 'general' }, num: '9999' },
      makePublicCtx({ db }),
    )
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/cats/general/page/2', status: 302 })
  })

  it('answers NOT_FOUND for an unknown taxonomy slug', async () => {
    const res = await callRpc('/content/posts/list', { scope: { type: 'tag', slug: 'missing' } }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })
})

describe('content.posts.bySlug', () => {
  it('returns the ok payload and stamps the weak ETag', async () => {
    await seedPost({ slug: 'hello', title: 'Hello', publishedAt: new Date('2024-01-01') })

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      etag: string
      payload: {
        post: { title: string; permalink: string }
        draftMarker: string | null
        critical: { commentKey: string }
      }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.etag).toMatch(/^W\/"[0-9a-f]{16}"$/)
    expect(json.payload.post.title).toBe('Hello')
    expect(json.payload.post.permalink).toBe('/posts/hello')
    expect(json.payload.draftMarker).toBeNull()
    expect(typeof json.payload.critical.commentKey).toBe('string')
  })

  it('answers not-modified when the carried If-None-Match matches the full-payload ETag', async () => {
    await seedPost({ slug: 'hello', publishedAt: new Date('2024-01-01') })
    const first = await callRpc('/content/posts/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    const { etag } = await parseRpcJson<{ etag: string }>(first)

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello', ifNoneMatch: etag }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string }>(res)

    expect(json).toEqual({ kind: 'not-modified', etag })
  })

  it('answers the canonical 301 for an alias slug', async () => {
    await seedPost({ slug: 'hello', alias: ['hello-old'] })

    const res = await callRpc('/content/posts/bySlug', { slug: 'hello-old' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/posts/hello', status: 301 })
  })

  it('answers NOT_FOUND for an unknown slug', async () => {
    const res = await callRpc('/content/posts/bySlug', { slug: 'missing' }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })

  it('gates the draft preview by role and ownership: anonymous 404s, the author sees their draft', async () => {
    // makeAuthedCtx defaults to user id 1 — the draft's author.
    await seedDraftPost('secret', 'Secret', 1)

    const anonymous = await callRpc('/content/posts/bySlug', { slug: 'secret' }, makePublicCtx({ db }))
    expect(anonymous.status).toBe(404)

    const author = await callRpc('/content/posts/bySlug', { slug: 'secret' }, makeAuthedCtx({ role: 'author', db }))
    expect(author.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      etag: string | null
      payload: { draftMarker: string | null; post: { title: string } }
    }>(author)
    expect(json.kind).toBe('ok')
    expect(json.etag).toBeNull()
    expect(json.payload.draftMarker).toBe('draft')
    expect(json.payload.post.title).toBe('Secret')
  })

  it('serves the saved body_html projection raw — sanitization is the render boundary', async () => {
    // Raw-at-rest invariant: the wire DTO carries the UNSANITIZED projection
    // and the public body renderer owns the 'body'-strategy sanitize pass.
    // Pin both directions — no server-side stripping (the payload survives
    // verbatim) and no server-side escaping (markup stays markup).
    const raw = '<p>raw <strong>body</strong></p><form action="https://evil.example"><button>x</button></form>'
    await seedPost({ slug: 'raw-body', publishedAt: new Date('2024-01-01') })
    await db.update(contentTable).set({ bodyHtml: raw })

    const res = await callRpc('/content/posts/bySlug', { slug: 'raw-body' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; payload: { bodyHtml: string } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.bodyHtml).toBe(raw)
  })

  it('404s an author previewing another author’s draft', async () => {
    await seedDraftPost('secret', 'Secret', 1)

    const other = await callRpc(
      '/content/posts/bySlug',
      { slug: 'secret' },
      makeAuthedCtx({ role: 'author', userId: '2', db }),
    )
    expect(other.status).toBe(404)
    expect((await parseRpcJson<RpcError>(other)).code).toBe('NOT_FOUND')
  })

  it('lets an admin preview any author’s draft', async () => {
    await seedDraftPost('secret', 'Secret', 2)

    const admin = await callRpc(
      '/content/posts/bySlug',
      { slug: 'secret' },
      makeAuthedCtx({ role: 'admin', userId: '1', db }),
    )
    expect(admin.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; payload: { draftMarker: string | null } }>(admin)
    expect(json.payload.draftMarker).toBe('draft')
  })
})

describe('content.pages.bySlug', () => {
  it('returns the ok payload (bodyHtml resolved inside the procedure)', async () => {
    await seedPage({ slug: 'about', title: 'About', publishedAt: new Date('2024-01-01') })

    const res = await callRpc('/content/pages/bySlug', { slug: 'about' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      etag: string | null
      payload: { page: { permalink: string }; showFriends: boolean; bodyHtml: string }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(typeof json.etag).toBe('string')
    expect(json.payload.page.permalink).toBe('/about')
    expect(json.payload.showFriends).toBe(false)
    // Seeded with an empty Lexical body and no projection columns, so the
    // compute-on-read fallback resolves to the empty string.
    expect(json.payload.bodyHtml).toBe('')
  })

  it('answers not-modified when the carried If-None-Match matches the full-payload ETag', async () => {
    await seedPage({ slug: 'about', publishedAt: new Date('2024-01-01') })
    const first = await callRpc('/content/pages/bySlug', { slug: 'about' }, makePublicCtx({ db }))
    const { etag } = await parseRpcJson<{ etag: string }>(first)

    const res = await callRpc('/content/pages/bySlug', { slug: 'about', ifNoneMatch: etag }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; etag: string }>(res)

    expect(json).toEqual({ kind: 'not-modified', etag })
  })

  it('301-redirects when the slug belongs to a live post', async () => {
    await seedPost({ slug: 'hello' })

    const res = await callRpc('/content/pages/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/posts/hello', status: 301 })
  })

  it('gates the draft preview by role: anonymous 404s on an unpublished page, admins see the draft', async () => {
    await seedPage({ slug: 'new-page', title: 'New Page Draft', published: false, draftBody: publishedBody })

    const anonymous = await callRpc('/content/pages/bySlug', { slug: 'new-page' }, makePublicCtx({ db }))
    expect(anonymous.status).toBe(404)

    const admin = await callRpc('/content/pages/bySlug', { slug: 'new-page' }, makeAuthedCtx({ role: 'admin', db }))
    expect(admin.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; payload: { draftMarker: string | null } }>(admin)
    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('draft')
  })

  it('never carries a public ETag on an admin draft preview (etag: null)', async () => {
    await seedPage({ slug: 'about', title: 'About', publishedAt: new Date('2024-01-01'), draftBody: publishedBody })

    const res = await callRpc(
      '/content/pages/bySlug',
      { slug: 'about', draft: true },
      makeAuthedCtx({ role: 'admin', db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string | null } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('unpublished-draft')
    expect(json.etag).toBeNull()
  })

  it('skips the published ETag on draft previews (ok even on a matching tag)', async () => {
    await seedPage({
      slug: 'about',
      title: 'About',
      publishedAt: new Date('2024-01-01'),
      draftBody: publishedBody,
    })
    const first = await callRpc('/content/pages/bySlug', { slug: 'about' }, makePublicCtx({ db }))
    const publishedEtag = (await parseRpcJson<{ etag: string }>(first)).etag

    // `draft: true` must skip revalidation, or a match answers `not-modified` and the draft never renders.
    const res = await callRpc(
      '/content/pages/bySlug',
      { slug: 'about', draft: true, ifNoneMatch: publishedEtag },
      makeAuthedCtx({ role: 'admin', db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; etag: string | null; payload: { draftMarker: string | null } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.draftMarker).toBe('unpublished-draft')
    expect(json.etag).toBeNull()
  })
})

describe('content.comments.byKey', () => {
  it('resolves the metric page_key from the detail critical', async () => {
    await seedPost({ slug: 'hello' })
    const detailRes = await callRpc('/content/posts/bySlug', { slug: 'hello' }, makePublicCtx({ db }))
    const detail = await parseRpcJson<{ payload: { critical: { commentKey: string } } }>(detailRes)

    const res = await callRpc(
      '/content/comments/byKey',
      { pageKey: detail.payload.critical.commentKey },
      makePublicCtx({ db }),
    )
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ commentData: { count: number } | null; commentItems: unknown[] }>(res)
    expect(json.commentData?.count ?? 0).toBe(0)
    expect(json.commentItems).toEqual([])
  })

  it('answers NOT_FOUND for an unknown page_key', async () => {
    const res = await callRpc('/content/comments/byKey', { pageKey: 'missing-key' }, makePublicCtx({ db }))
    expect(res.status).toBe(404)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('NOT_FOUND')
  })
})

describe('content.search', () => {
  it('answers the empty-keyword bounce as a redirect union member (302 to /)', async () => {
    const res = await callRpc('/content/search', { keyword: '   ' }, makePublicCtx({ db }))
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/', status: 302 })
  })

  it('returns the ok listing for a real query', async () => {
    await seedPost({ slug: 'react-post' })

    const res = await callRpc('/content/search', { keyword: 'react' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; listing: { title?: string; resolvedPosts: { slug: string }[] } }>(
      res,
    )

    expect(json.kind).toBe('ok')
    expect(json.listing.title).toContain('react')
    expect(json.listing.resolvedPosts.map((p) => p.slug)).toContain('react-post')
  })

  it('answers the overflow redirect as a union member (302 to the last page)', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `react-${i}` })
    }

    const res = await callRpc('/content/search', { keyword: 'react', num: '9999' }, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; to: string; status: number }>(res)

    expect(json).toEqual({ kind: 'redirect', to: '/search/react/page/2', status: 302 })
  })

  it('rejects a keyword over the contract cap before any scan', async () => {
    const res = await callRpc('/content/search', { keyword: 'x'.repeat(201) }, makePublicCtx({ db }))
    expect(res.status).toBe(400)
  })

  it('throttles through the shared resource bucket', async () => {
    __resetRateLimitsForTests()
    seedSingleAttemptResourceBucket()

    expect((await callRpc('/content/search', { keyword: 'react' }, makePublicCtx({ db }))).status).toBe(200)
    const throttled = await callRpc('/content/search', { keyword: 'react' }, makePublicCtx({ db }))
    expect(throttled.status).toBe(429)
    await expect(throttled.text()).resolves.toContain('TOO_MANY_REQUESTS')
  })
})

describe('content.categories.list', () => {
  it('returns every category', async () => {
    await seedCategory('general', 'general')

    const res = await callRpc('/content/categories/list', {}, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ kind: string; payload: { categories: { name: string; slug: string }[] } }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.categories.map((c) => c.slug)).toContain('general')
  })
})

describe('content.archives', () => {
  it('returns every live post (hidden included, scheduled excluded)', async () => {
    await seedPost({
      slug: 'visible-post',
      publishedAt: new Date('2024-01-02'),
      firstPublishedAt: new Date('2024-01-02'),
    })
    await seedPost({
      slug: 'hidden-post',
      visible: false,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    await seedPost({
      slug: 'scheduled-post',
      publishedAt: new Date('2099-01-01'),
      firstPublishedAt: new Date('2024-01-03'),
    })

    const res = await callRpc('/content/archives', {}, makePublicCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      kind: string
      payload: { resolvedPosts: { slug: string }[]; listingNowIso: string }
    }>(res)

    expect(json.kind).toBe('ok')
    expect(json.payload.resolvedPosts.map((p) => p.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(json.payload.listingNowIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('throttles the 10k-post fan-out through the shared resource bucket', async () => {
    __resetRateLimitsForTests()
    seedSingleAttemptResourceBucket()

    expect((await callRpc('/content/archives', {}, makePublicCtx({ db }))).status).toBe(200)
    const throttled = await callRpc('/content/archives', {}, makePublicCtx({ db }))
    expect(throttled.status).toBe(429)
    await expect(throttled.text()).resolves.toContain('TOO_MANY_REQUESTS')
  })
})
