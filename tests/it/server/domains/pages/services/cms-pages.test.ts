import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PageMetaWithAuthor } from '@/server/domains/pages/repo'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow } from '@/server/infra/db/types'

// CMS page service — drives the save/publish state machine through
// the repository's mocked transactional helpers. The repository
// itself is mocked to keep this test layer focused on:
//   1. DomainError surfacing (slug validation, missing rows),
//   2. body validation through the PortableText perimeter,
//   3. DTO projection (Page, AdminPageDto, AdminRevisionDto),
//   4. conflict-vs-saved branching translated to the wire shape.

vi.mock('@/server/domains/pages/repo', () => ({
  countPageMetas: vi.fn(async () => 0),
  findPageMetaById: vi.fn(),
  findPageMetaBySlug: vi.fn(),
  findPageMetaBySlugForUpdate: vi.fn(async () => null),
  insertPageMeta: vi.fn(),
  listPageMetas: vi.fn(async () => []),
  restorePageMeta: vi.fn(),
  softDeletePageMeta: vi.fn(),
  updatePageMetaById: vi.fn(),
}))
vi.mock('@/server/domains/pages/services/public-query', () => ({
  findPublicPageMetaBySlug: vi.fn(),
  listPublicPageMetas: vi.fn(async () => []),
}))
vi.mock('@/server/domains/content/revisions', () => ({
  findContentById: vi.fn(),
  findContentsByIds: vi.fn(async () => []),
  findLatestDraft: vi.fn(),
  findLatestRevision: vi.fn(),
  listRevisions: vi.fn(async () => []),
}))
vi.mock('@/server/domains/content/repos/mutate', () => ({
  publishLatestRevision: vi.fn(),
  saveDraftRevision: vi.fn(),
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
  insertSlugRegistry: vi.fn(() => ({})),
  updateSlugRegistryByEntity: vi.fn(() => ({})),
  deleteSlugRegistryByEntity: vi.fn(() => {
    void 0
  }),
  findSlugRegistryBySlug: vi.fn(() => null),
  findSlugRegistryBySlugForUpdate: vi.fn(() => null),
}))

const { auditInfoMock, getLogger } = vi.hoisted(() => {
  const auditInfoMock = vi.fn()
  const createLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createLogger()),
    withScope: vi.fn(() => createLogger()),
  })
  return {
    auditInfoMock,
    getLogger: vi.fn((scope: string) =>
      scope === 'audit.cms.pages' ? { ...createLogger(), info: auditInfoMock } : createLogger(),
    ),
  }
})

vi.mock('@/server/infra/logger', () => ({
  getLogger,
  L3_KEYS: new Set([
    'email',
    'ip',
    'clientAddress',
    'remoteAddress',
    'userAgent',
    'phone',
    'authorEmail',
    'authorIp',
    'cookie',
    'deviceId',
    'name',
  ]),
}))

const db = {
  transaction: <T>(fn: (tx: Database) => T) => fn(db as Database),
} as unknown as Database

const repo = await import('@/server/domains/pages/repo')
const query = await import('@/server/domains/content/revisions')
const contentMutate = await import('@/server/domains/content/repos/mutate')
const { DomainError } = await import('@/server/infra/http/errors')
const adminQuery = await import('@/server/domains/pages/services/admin-query')
const mutate = await import('@/server/domains/pages/services/mutate')
const lifecycle = await import('@/server/domains/content/lifecycle')
const { pageLifecycleAdapter } = await import('@/server/domains/pages/services/lifecycle-adapter')

function metaRow(overrides: Partial<PageMetaWithAuthor> = {}): PageMetaWithAuthor {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 1,
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
    id: overrides.id ?? 100,
    type: overrides.type ?? 'page',
    ownerId: overrides.ownerId ?? 1,
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
  for (const fn of Object.values(contentMutate)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
})

describe('cms/pages/service — listPagesForAdmin / getPageDetailForAdmin', () => {
  it('hasMore = true while another page exists, false when the offset+rows reaches total', async () => {
    vi.mocked(repo.listPageMetas).mockResolvedValue([metaRow({ id: 1 }), metaRow({ id: 2, slug: 'links' })])
    vi.mocked(repo.countPageMetas).mockResolvedValue(5)

    const more = await adminQuery.listPagesForAdmin(db, { offset: 0, limit: 2 })
    expect(more.total).toBe(5)
    expect(more.hasMore).toBe(true)
    expect(more.pages.map((p) => p.slug)).toEqual(['about', 'links'])

    vi.mocked(repo.listPageMetas).mockResolvedValue([metaRow({ id: 5, slug: 'guestbook' })])
    vi.mocked(repo.countPageMetas).mockResolvedValue(5)
    const last = await adminQuery.listPagesForAdmin(db, { offset: 4, limit: 2 })
    expect(last.hasMore).toBe(false)
  })

  it('getPageDetailForAdmin throws NOT_FOUND for missing rows (same contract as posts)', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(null)
    await expect(adminQuery.getPageDetailForAdmin(db, 99)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('getPageDetailForAdmin projects latest + published revisions independently', async () => {
    const meta = metaRow({ id: 7, publishedRevisionId: 200 })
    const draft = contentRow({ id: 201, ownerId: 7, revisionNo: 4, status: 'draft' })
    const published = contentRow({ id: 200, ownerId: 7, revisionNo: 3, status: 'published' })
    vi.mocked(repo.findPageMetaById).mockReturnValue(meta)
    vi.mocked(query.findLatestRevision).mockResolvedValue(draft)
    vi.mocked(query.findContentById).mockReturnValue(published)

    const detail = await adminQuery.getPageDetailForAdmin(db, 7)
    expect(detail.page.id).toBe('7')
    expect(detail.latestRevision?.revisionNo).toBe(4)
    expect(detail.latestRevision?.status).toBe('draft')
    expect(detail.publishedRevision?.revisionNo).toBe(3)
    expect(detail.publishedRevision?.status).toBe('published')
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
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockReturnValue(metaRow({ slug: 'about' }))
    await expect(mutate.createPage(db, { slug: 'about', title: 't' }, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('updatePageMeta tolerates a same-slug edit (no collision check fires)', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 7, slug: 'about', title: 'old' }))
    vi.mocked(repo.updatePageMetaById).mockReturnValue(metaRow({ id: 7, slug: 'about', title: 'new' }))
    const dto = await mutate.updatePageMeta(db, { id: 7, slug: 'about', title: 'new' })
    expect(dto.title).toBe('new')
    expect(repo.findPageMetaBySlugForUpdate).not.toHaveBeenCalled()
  })

  it('updatePageMeta blocks renaming to a slug already used by a different page', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 7, slug: 'about' }))
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockReturnValue(metaRow({ id: 99, slug: 'guestbook' }))
    await expect(mutate.updatePageMeta(db, { id: 7, slug: 'guestbook', title: 't' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('updatePageMeta returns 404 when the row was already deleted', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(null)
    await expect(mutate.updatePageMeta(db, { id: 7, slug: 'about', title: 't' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('createPage always inserts status=draft even when input says true', async () => {
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockReturnValue(null)
    vi.mocked(repo.insertPageMeta).mockReturnValue(metaRow({ slug: 'new-page', published: false }))

    await mutate.createPage(db, { title: 'New Page', published: true }, null)

    const patch = vi.mocked(repo.insertPageMeta).mock.calls[0][1]
    expect(patch.published).toBe(false)
  })

  it('createPage inserts status=draft when input omits the field', async () => {
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockReturnValue(null)
    vi.mocked(repo.insertPageMeta).mockReturnValue(metaRow({ slug: 'new-page', published: false }))

    await mutate.createPage(db, { title: 'New Page' }, null)

    const patch = vi.mocked(repo.insertPageMeta).mock.calls[0][1]
    expect(patch.published).toBe(false)
  })

  it('updatePageMeta never touches published even when input includes it', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 7, slug: 'about', published: true }))
    vi.mocked(repo.findPageMetaBySlug).mockReturnValue(null)
    vi.mocked(repo.updatePageMetaById).mockReturnValue(
      metaRow({ id: 7, slug: 'about', published: true, title: 'Updated' }),
    )

    const dto = await mutate.updatePageMeta(db, {
      id: 7,
      slug: 'about',
      title: 'Updated',
      published: false,
    })
    expect(dto.title).toBe('Updated')

    const patch = vi.mocked(repo.updatePageMetaById).mock.calls[0][2]
    expect(patch).not.toHaveProperty('published')
  })
})

describe('cms/pages lifecycle — saveBody draft / publish body validation', () => {
  it('rejects a malformed body (zod issues become DomainError 400)', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    await expect(
      lifecycle.saveBody(
        db,
        pageLifecycleAdapter,
        { entityId: 1, body: [{ _type: 'unknown', _key: 'k' }], authorId: null },
        'draft',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(contentMutate.saveDraftRevision).not.toHaveBeenCalled()
  })

  it('rejects when the page row is missing without touching the transaction', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(null)
    await expect(
      lifecycle.saveBody(db, pageLifecycleAdapter, { entityId: 1, body: VALID_BODY, authorId: null }, 'draft'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(contentMutate.saveDraftRevision).not.toHaveBeenCalled()
  })

  it('forwards body, derived imageSources, and derived headings into the repository call', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    vi.mocked(contentMutate.saveDraftRevision).mockResolvedValue({
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
    await lifecycle.saveBody(db, pageLifecycleAdapter, { entityId: 1, body, authorId: 42 }, 'draft')

    const arg = vi.mocked(contentMutate.saveDraftRevision).mock.calls[0][2]
    expect(arg.ownerId).toBe(1)
    expect(arg.imageSources).toEqual(['images/2026/05/foo.jpg'])
    expect(arg.headings).toEqual([{ depth: 2, text: 'Hello', slug: 'hello' }])
    expect(arg.authorId).toBe(42)
  })

  it('translates a repository "conflict" into the wire shape with the latest revision DTO', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    const latest = contentRow({
      id: 999,
      revisionNo: 5,
      status: 'draft',
      clientRevisionToken: '11111111-2222-3333-4444-555555555555',
    })
    vi.mocked(contentMutate.saveDraftRevision).mockResolvedValue({
      status: 'conflict',
      latest,
      expectedToken: latest.clientRevisionToken,
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 1,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'stale-token',
      },
      'draft',
    )
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe('999')
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe(latest.clientRevisionToken)
    }
  })

  it('publish projects the saved revision back as a "saved" wire DTO', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    vi.mocked(contentMutate.publishLatestRevision).mockResolvedValue({
      status: 'published',
      row: contentRow({ revisionNo: 7, status: 'published' }),
    })
    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: 1, body: VALID_BODY, authorId: 5 },
      'publish',
    )
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.revision.status).toBe('published')
      expect(result.revision.revisionNo).toBe(7)
    }
  })
})

describe('cms/pages lifecycle — saveBody CAS + force', () => {
  it('saveBody forwards expectedClientRevisionToken untouched into the repo call', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    vi.mocked(contentMutate.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ revisionNo: 1, status: 'draft' }),
    })

    await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 1,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'expected-token-abc',
      },
      'draft',
    )

    const arg = vi.mocked(contentMutate.saveDraftRevision).mock.calls[0][2]
    expect(arg.expectedClientRevisionToken).toBe('expected-token-abc')
    expect(arg.force).toBeUndefined()
  })

  it('saveBody with force=true bypasses CAS at the repo and writes an audit log row', async () => {
    auditInfoMock.mockClear()

    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 7 }))
    vi.mocked(query.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 600,
        ownerId: 7,
        revisionNo: 9,
        status: 'draft',
        clientRevisionToken: 'server-side-newer',
      }),
    )
    vi.mocked(contentMutate.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ id: 601, ownerId: 7, revisionNo: 9, status: 'draft' }),
    })

    await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 7,
        body: VALID_BODY,
        authorId: 42,
        expectedClientRevisionToken: 'client-thought-this',
        force: true,
      },
      'draft',
    )

    const repoArg = vi.mocked(contentMutate.saveDraftRevision).mock.calls[0][2]
    expect(repoArg.force).toBe(true)

    // Audit log emitted exactly once for the genuine overwrite.
    expect(auditInfoMock).toHaveBeenCalledTimes(1)
    const [message, context] = auditInfoMock.mock.calls[0]!
    expect(message).toBe('force_overwrite_save')
    expect(context).toMatchObject({
      mode: 'draft',
      actor: '42',
      pageMetaId: '7',
      overwrittenRevisionId: '600',
      overwrittenRevisionToken: 'server-side-newer',
      clientExpectedToken: 'client-thought-this',
      resultRevisionId: '601',
    })
  })

  it('saveBody with force=true on a no-op overwrite (matching tokens) skips the audit log', async () => {
    auditInfoMock.mockClear()

    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 7 }))
    const same = 'aligned-token'
    vi.mocked(query.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 700,
        ownerId: 7,
        revisionNo: 3,
        status: 'draft',
        clientRevisionToken: same,
      }),
    )
    vi.mocked(contentMutate.saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ id: 701, ownerId: 7, revisionNo: 3, status: 'draft' }),
    })

    await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 7,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: same,
        force: true,
      },
      'draft',
    )

    expect(auditInfoMock).not.toHaveBeenCalled()
  })

  it('publish forwards force and translates a conflict back into the wire shape', async () => {
    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 1 }))
    const stale = contentRow({
      id: 800,
      revisionNo: 4,
      status: 'draft',
      clientRevisionToken: 'newer-than-client',
    })
    vi.mocked(contentMutate.publishLatestRevision).mockResolvedValue({
      status: 'conflict',
      latest: stale,
      expectedToken: stale.clientRevisionToken,
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 1,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'stale-client',
        force: false,
      },
      'publish',
    )
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe('800')
      expect(result.expectedToken).toBe('newer-than-client')
    }

    const repoArg = vi.mocked(contentMutate.publishLatestRevision).mock.calls[0][2]
    expect(repoArg.force).toBe(false)
    expect(repoArg.expectedClientRevisionToken).toBe('stale-client')
  })

  it('publish with force=true writes audit log with mode="publish"', async () => {
    auditInfoMock.mockClear()

    vi.mocked(repo.findPageMetaById).mockReturnValue(metaRow({ id: 11 }))
    vi.mocked(query.findLatestRevision).mockResolvedValue(
      contentRow({
        id: 900,
        ownerId: 11,
        revisionNo: 12,
        status: 'draft',
        clientRevisionToken: 'srv-token',
      }),
    )
    vi.mocked(contentMutate.publishLatestRevision).mockResolvedValue({
      status: 'published',
      row: contentRow({ id: 901, ownerId: 11, revisionNo: 12, status: 'published' }),
    })

    await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: 11,
        body: VALID_BODY,
        authorId: 99,
        expectedClientRevisionToken: 'cli-token',
        force: true,
      },
      'publish',
    )

    expect(auditInfoMock).toHaveBeenCalledTimes(1)
    const [message, context] = auditInfoMock.mock.calls[0]!
    expect(message).toBe('force_overwrite_save')
    expect(context).toMatchObject({
      mode: 'publish',
      actor: '99',
      pageMetaId: '11',
      overwrittenRevisionId: '900',
      overwrittenRevisionToken: 'srv-token',
      clientExpectedToken: 'cli-token',
      resultRevisionId: '901',
    })
  })
})
