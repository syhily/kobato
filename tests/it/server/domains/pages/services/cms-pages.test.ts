import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PageMetaWithAuthor } from '@/server/domains/pages/repo'
import type { ContentRow } from '@/server/infra/db/types'

// CMS page service — drives the save/publish state machine through
// the repository's mocked transactional helpers. The repository
// itself is mocked to keep this test layer focused on:
//   1. DomainError surfacing (slug validation, missing rows),
//   2. body validation through the PortableText perimeter,
//   3. DTO projection (CmsPage, AdminPageDto, AdminRevisionDto),
//   4. conflict-vs-saved branching translated to the wire shape.

vi.mock('@/server/domains/pages/repo', () => ({
  countPageMetas: vi.fn(async () => 0),
  findContentById: vi.fn(),
  findLatestDraft: vi.fn(),
  findLatestRevision: vi.fn(),
  findPageMetaById: vi.fn(),
  findPageMetaBySlug: vi.fn(),
  findPublicPageMetaBySlug: vi.fn(),
  insertPageMeta: vi.fn(),
  listPageMetas: vi.fn(async () => []),
  listPublicPageMetas: vi.fn(async () => []),
  listRevisions: vi.fn(async () => []),
  publishLatestRevision: vi.fn(),
  restorePageMeta: vi.fn(),
  saveDraftRevision: vi.fn(),
  softDeletePageMeta: vi.fn(),
  updatePageMetaById: vi.fn(),
}))

// `listPagesForAdmin` ensures a metric row per listed page and reads
// counter rows back. Stub those out so this test focuses on repository
// orchestration without needing the metric DB.
vi.mock('@/server/infra/db/operations/metric', () => ({
  ensureMetric: vi.fn(async () => ({})),
  ensureMetricsBatch: vi.fn(async () => undefined),
  findMetricByPublicId: vi.fn(),
  findMetricByTarget: vi.fn(),
}))
vi.mock('@/server/infra/db/operations/like', () => ({
  metricsByOwnerIds: vi.fn(async () => []),
  commentCountsByOwnerIds: vi.fn(async () => []),
}))
vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  insertSlugRegistry: vi.fn(async () => ({})),
  updateSlugRegistryByEntity: vi.fn(async () => ({})),
  deleteSlugRegistryByEntity: vi.fn(async () => {
    void 0
  }),
  findSlugRegistryBySlug: vi.fn(async () => null),
}))

const db = {
  transaction: async <T>(fn: (tx: NodePgDatabase) => Promise<T>) => fn(db as NodePgDatabase),
} as unknown as NodePgDatabase

const repo = await import('@/server/domains/pages/repo')
const { DomainError } = await import('@/server/infra/http/errors')
const adminQuery = await import('@/server/domains/pages/services/admin-query')
const mutate = await import('@/server/domains/pages/services/mutate')
const draft = await import('@/server/domains/pages/services/draft')
const catalog = await import('@/server/domains/pages/services/catalog')

function metaRow(overrides: Partial<PageMetaWithAuthor> = {}): PageMetaWithAuthor {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 1n,
    slug: overrides.slug ?? 'about',
    title: overrides.title ?? '关于我',
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    showFriends: overrides.showFriends ?? false,
    publishedAt: overrides.publishedAt ?? now,
    publishedRevisionId: overrides.publishedRevisionId ?? null,
    firstPublishedAt: overrides.firstPublishedAt ?? null,
    authorId: overrides.authorId ?? null,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
    authorName: overrides.authorName ?? null,
  }
}

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 100n,
    type: overrides.type ?? 'page',
    ownerId: overrides.ownerId ?? 1n,
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'draft',
    body: overrides.body ?? [],
    imageSources: overrides.imageSources ?? [],
    headings: overrides.headings ?? [],
    authorId: overrides.authorId ?? null,
    clientRevisionToken: overrides.clientRevisionToken ?? '00000000-0000-0000-0000-000000000001',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

const VALID_BODY = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'h2',
    children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
  },
]

beforeEach(() => {
  for (const fn of Object.values(repo)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
})

describe('cms/pages/service — listPagesForAdmin / getPageDetailForAdmin', () => {
  it('hasMore = true while another page exists, false when the offset+rows reaches total', async () => {
    vi.mocked(repo.listPageMetas).mockResolvedValue([metaRow({ id: 1n }), metaRow({ id: 2n, slug: 'links' })])
    vi.mocked(repo.countPageMetas).mockResolvedValue(5)

    const more = await adminQuery.listPagesForAdmin(db, { offset: 0, limit: 2 })
    expect(more.total).toBe(5)
    expect(more.hasMore).toBe(true)
    expect(more.pages.map((p) => p.slug)).toEqual(['about', 'links'])

    vi.mocked(repo.listPageMetas).mockResolvedValue([metaRow({ id: 5n, slug: 'guestbook' })])
    vi.mocked(repo.countPageMetas).mockResolvedValue(5)
    const last = await adminQuery.listPagesForAdmin(db, { offset: 4, limit: 2 })
    expect(last.hasMore).toBe(false)
  })

  it('getPageDetailForAdmin returns null for missing rows (route then 404s)', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(null)
    expect(await adminQuery.getPageDetailForAdmin(db, 99n)).toBeNull()
  })

  it('getPageDetailForAdmin projects latest + published revisions independently', async () => {
    const meta = metaRow({ id: 7n, publishedRevisionId: 200n })
    const draft = contentRow({ id: 201n, ownerId: 7n, revisionNo: 4, status: 'draft' })
    const published = contentRow({ id: 200n, ownerId: 7n, revisionNo: 3, status: 'published' })
    vi.mocked(repo.findPageMetaById).mockResolvedValue(meta)
    vi.mocked(repo.findLatestRevision).mockResolvedValue(draft)
    vi.mocked(repo.findContentById).mockResolvedValue(published)

    const detail = await adminQuery.getPageDetailForAdmin(db, 7n)
    expect(detail?.page.id).toBe('7')
    expect(detail?.latestRevision?.revisionNo).toBe(4)
    expect(detail?.latestRevision?.status).toBe('draft')
    expect(detail?.publishedRevision?.revisionNo).toBe(3)
    expect(detail?.publishedRevision?.status).toBe('published')
  })
})

describe('cms/pages/service — createPage / updatePageMeta validation', () => {
  it('rejects slugs that contain illegal characters', async () => {
    await expect(mutate.createPage(db, { slug: 'About Me', title: 'x' }, null)).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects reserved slugs that would shadow public routes', async () => {
    for (const slug of ['posts', 'cats', 'tags', 'admin', 'api']) {
      await expect(mutate.createPage(db, { slug, title: 't' }, null)).rejects.toBeInstanceOf(DomainError)
    }
  })

  it('rejects an existing slug on create with HTTP 409 semantics', async () => {
    vi.mocked(repo.findPageMetaBySlug).mockResolvedValue(metaRow({ slug: 'about' }))
    await expect(mutate.createPage(db, { slug: 'about', title: 't' }, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('updatePageMeta tolerates a same-slug edit (no collision check fires)', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 7n, slug: 'about', title: 'old' }))
    vi.mocked(repo.updatePageMetaById).mockResolvedValue(metaRow({ id: 7n, slug: 'about', title: 'new' }))
    const dto = await mutate.updatePageMeta(db, { id: 7n, slug: 'about', title: 'new' })
    expect(dto.title).toBe('new')
    expect(repo.findPageMetaBySlug).not.toHaveBeenCalled()
  })

  it('updatePageMeta blocks renaming to a slug already used by a different page', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 7n, slug: 'about' }))
    vi.mocked(repo.findPageMetaBySlug).mockResolvedValue(metaRow({ id: 99n, slug: 'guestbook' }))
    await expect(mutate.updatePageMeta(db, { id: 7n, slug: 'guestbook', title: 't' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('updatePageMeta returns 404 when the row was already deleted', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(null)
    await expect(mutate.updatePageMeta(db, { id: 7n, slug: 'about', title: 't' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('createPage always inserts status=draft even when input says true', async () => {
    vi.mocked(repo.findPageMetaBySlug).mockResolvedValue(null)
    vi.mocked(repo.insertPageMeta).mockResolvedValue(metaRow({ slug: 'new-page', published: false }))

    await mutate.createPage(db, { title: 'New Page', published: true }, null)

    const patch = vi.mocked(repo.insertPageMeta).mock.calls[0][1]
    expect(patch.published).toBe(false)
  })

  it('createPage inserts status=draft when input omits the field', async () => {
    vi.mocked(repo.findPageMetaBySlug).mockResolvedValue(null)
    vi.mocked(repo.insertPageMeta).mockResolvedValue(metaRow({ slug: 'new-page', published: false }))

    await mutate.createPage(db, { title: 'New Page' }, null)

    const patch = vi.mocked(repo.insertPageMeta).mock.calls[0][1]
    expect(patch.published).toBe(false)
  })

  it('updatePageMeta never touches published even when input includes it', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 7n, slug: 'about', published: true }))
    vi.mocked(repo.findPageMetaBySlug).mockResolvedValue(null)
    vi.mocked(repo.updatePageMetaById).mockResolvedValue(
      metaRow({ id: 7n, slug: 'about', published: true, title: 'Updated' }),
    )

    const dto = await mutate.updatePageMeta(db, {
      id: 7n,
      slug: 'about',
      title: 'Updated',
      published: false,
    })
    expect(dto.title).toBe('Updated')

    const patch = vi.mocked(repo.updatePageMetaById).mock.calls[0][2]
    expect(patch).not.toHaveProperty('published')
  })
})

describe('cms/pages/service — saveDraft / publishLatest body validation', () => {
  it('rejects a malformed body (zod issues become DomainError 400)', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    await expect(
      draft.saveDraft(db, { pageId: 1n, body: [{ _type: 'unknown', _key: 'k' }], authorId: null }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(repo.saveDraftRevision).not.toHaveBeenCalled()
  })

  it('rejects when the page row is missing without touching the transaction', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(null)
    await expect(draft.saveDraft(db, { pageId: 1n, body: VALID_BODY, authorId: null })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(repo.saveDraftRevision).not.toHaveBeenCalled()
  })

  it('forwards body, derived imageSources, and derived headings into the repository call', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    vi.mocked(repo.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ revisionNo: 1, status: 'draft' }),
    })

    const body = [
      {
        _type: 'block',
        _key: 'h1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
      },
      {
        _type: 'image',
        _key: 'i1',
        src: 'https://cdn/example.jpg',
        storagePath: 'images/2026/05/foo.jpg',
      },
    ]
    await draft.saveDraft(db, { pageId: 1n, body, authorId: 42n })

    const arg = vi.mocked(repo.saveDraftRevision).mock.calls[0][2]
    expect(arg.ownerId).toBe(1n)
    expect(arg.imageSources).toEqual(['images/2026/05/foo.jpg'])
    expect(arg.headings).toEqual([{ depth: 2, text: 'Hello', slug: 'hello' }])
    expect(arg.authorId).toBe(42n)
  })

  it('translates a repository "conflict" into the wire shape with the latest revision DTO', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    const latest = contentRow({
      id: 999n,
      revisionNo: 5,
      status: 'draft',
      clientRevisionToken: '11111111-2222-3333-4444-555555555555',
    })
    vi.mocked(repo.saveDraftRevision).mockResolvedValue({
      status: 'conflict',
      latest,
      expectedToken: latest.clientRevisionToken,
    })

    const result = await draft.saveDraft(db, {
      pageId: 1n,
      body: VALID_BODY,
      authorId: null,
      expectedClientRevisionToken: 'stale-token',
    })
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe('999')
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe(latest.clientRevisionToken)
    }
  })

  it('publishLatest projects the saved revision back as a "saved" wire DTO', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    vi.mocked(repo.publishLatestRevision).mockResolvedValue({
      status: 'published',
      row: contentRow({ revisionNo: 7, status: 'published' }),
    })
    const result = await draft.publishLatest(db, { pageId: 1n, body: VALID_BODY, authorId: 5n })
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.revision.status).toBe('published')
      expect(result.revision.revisionNo).toBe(7)
    }
  })
})

describe('cms/pages/service — saveDraft / publishLatest CAS + force', () => {
  it('saveDraft forwards expectedClientRevisionToken untouched into the repo call', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    vi.mocked(repo.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ revisionNo: 1, status: 'draft' }),
    })

    await draft.saveDraft(db, {
      pageId: 1n,
      body: VALID_BODY,
      authorId: null,
      expectedClientRevisionToken: 'expected-token-abc',
    })

    const arg = vi.mocked(repo.saveDraftRevision).mock.calls[0][2]
    expect(arg.expectedClientRevisionToken).toBe('expected-token-abc')
    expect(arg.force).toBeUndefined()
  })

  it('saveDraft with force=true bypasses CAS at the repo and writes an audit log row', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 7n }))
    vi.mocked(repo.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 600n,
        ownerId: 7n,
        revisionNo: 9,
        status: 'draft',
        clientRevisionToken: 'server-side-newer',
      }),
    )
    vi.mocked(repo.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ id: 601n, ownerId: 7n, revisionNo: 9, status: 'draft' }),
    })

    await draft.saveDraft(db, {
      pageId: 7n,
      body: VALID_BODY,
      authorId: 42n,
      expectedClientRevisionToken: 'client-thought-this',
      force: true,
    })

    const repoArg = vi.mocked(repo.saveDraftRevision).mock.calls[0][2]
    expect(repoArg.force).toBe(true)

    // Audit log line emitted exactly once for the genuine overwrite.
    const auditLines = writeSpy.mock.calls
      .map(([chunk]) => (typeof chunk === 'string' ? chunk : ''))
      .filter((line) => line.includes('"scope":"audit.cms.pages"'))
    expect(auditLines.length).toBe(1)
    const parsed = JSON.parse(auditLines[0]!)
    expect(parsed.msg).toBe('force_overwrite_save')
    expect(parsed.mode).toBe('draft')
    expect(parsed.actor).toBe('42')
    expect(parsed.pageMetaId).toBe('7')
    expect(parsed.overwrittenRevisionId).toBe('600')
    expect(parsed.overwrittenRevisionToken).toBe('server-side-newer')
    expect(parsed.clientExpectedToken).toBe('client-thought-this')
    expect(parsed.resultRevisionId).toBe('601')

    writeSpy.mockRestore()
  })

  it('saveDraft with force=true on a no-op overwrite (matching tokens) skips the audit log', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      /* noop */
    })

    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 7n }))
    const same = 'aligned-token'
    vi.mocked(repo.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 700n,
        ownerId: 7n,
        revisionNo: 3,
        status: 'draft',
        clientRevisionToken: same,
      }),
    )
    vi.mocked(repo.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ id: 701n, ownerId: 7n, revisionNo: 3, status: 'draft' }),
    })

    await draft.saveDraft(db, {
      pageId: 7n,
      body: VALID_BODY,
      authorId: null,
      expectedClientRevisionToken: same,
      force: true,
    })

    const auditLines = consoleSpy.mock.calls
      .map(([first]) => (typeof first === 'string' ? first : ''))
      .filter((line) => line.includes('"scope":"audit.cms.pages"'))
    expect(auditLines.length).toBe(0)

    consoleSpy.mockRestore()
  })

  it('publishLatest forwards force=true and translates a conflict back into the wire shape', async () => {
    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 1n }))
    const stale = contentRow({
      id: 800n,
      revisionNo: 4,
      status: 'draft',
      clientRevisionToken: 'newer-than-client',
    })
    vi.mocked(repo.publishLatestRevision).mockResolvedValue({
      status: 'conflict',
      latest: stale,
      expectedToken: stale.clientRevisionToken,
    })

    const result = await draft.publishLatest(db, {
      pageId: 1n,
      body: VALID_BODY,
      authorId: null,
      expectedClientRevisionToken: 'stale-client',
      force: false,
    })
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe('800')
      expect(result.expectedToken).toBe('newer-than-client')
    }

    const repoArg = vi.mocked(repo.publishLatestRevision).mock.calls[0][2]
    expect(repoArg.force).toBe(false)
    expect(repoArg.expectedClientRevisionToken).toBe('stale-client')
  })

  it('publishLatest with force=true writes audit log with mode="publish"', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    vi.mocked(repo.findPageMetaById).mockResolvedValue(metaRow({ id: 11n }))
    vi.mocked(repo.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 900n,
        ownerId: 11n,
        revisionNo: 12,
        status: 'draft',
        clientRevisionToken: 'srv-token',
      }),
    )
    vi.mocked(repo.publishLatestRevision).mockResolvedValue({
      status: 'published',
      row: contentRow({ id: 901n, ownerId: 11n, revisionNo: 12, status: 'published' }),
    })

    await draft.publishLatest(db, {
      pageId: 11n,
      body: VALID_BODY,
      authorId: 99n,
      expectedClientRevisionToken: 'cli-token',
      force: true,
    })

    const auditLines = writeSpy.mock.calls
      .map(([chunk]) => (typeof chunk === 'string' ? chunk : ''))
      .filter((line) => line.includes('"scope":"audit.cms.pages"'))
    expect(auditLines.length).toBe(1)
    const parsed = JSON.parse(auditLines[0]!)
    expect(parsed.mode).toBe('publish')
    expect(parsed.resultRevisionId).toBe('901')

    writeSpy.mockRestore()
  })
})

describe('cms/pages/service — public catalog projection', () => {
  it('loadCatalogPageBySlug 404s on soft-deleted rows', async () => {
    vi.mocked(repo.findPublicPageMetaBySlug).mockResolvedValue(null)
    expect(await catalog.loadCatalogPageBySlug(db, 'gone')).toBeNull()
  })

  it('loadCatalogPageBySlug 404s when meta.status=draft', async () => {
    vi.mocked(repo.findPublicPageMetaBySlug).mockResolvedValue(metaRow({ published: false }))
    expect(await catalog.loadCatalogPageBySlug(db, 'about')).toBeNull()
  })

  it('loadCatalogPageBySlug 404s when publishedRevisionId is null (no revision promoted)', async () => {
    vi.mocked(repo.findPublicPageMetaBySlug).mockResolvedValue(metaRow({ id: 1n, publishedRevisionId: null }))
    expect(await catalog.loadCatalogPageBySlug(db, 'about')).toBeNull()
  })

  it('loadCatalogPageBySlug joins the published revision body when present', async () => {
    vi.mocked(repo.findPublicPageMetaBySlug).mockResolvedValue(metaRow({ id: 1n, publishedRevisionId: 200n }))
    vi.mocked(repo.findContentById).mockResolvedValue(
      contentRow({
        id: 200n,
        revisionNo: 3,
        status: 'published',
        body: VALID_BODY,
        imageSources: ['images/2026/05/foo.jpg'],
        headings: [{ depth: 2, text: 'Hello', slug: 'hello' }],
      }),
    )
    const page = await catalog.loadCatalogPageBySlug(db, 'about')
    expect(page?.body).toEqual(VALID_BODY)
    expect(page?.imageSources).toEqual(['images/2026/05/foo.jpg'])
    expect(page?.headings).toEqual([{ depth: 2, text: 'Hello', slug: 'hello' }])
    expect(page?.publishedRevisionId).toBe(200n)
  })
})
