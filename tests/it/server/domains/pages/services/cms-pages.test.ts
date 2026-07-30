import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import * as lifecycle from '@/server/domains/content/lifecycle'
import * as adminQuery from '@/server/domains/pages/services/admin-query'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import * as mutate from '@/server/domains/pages/services/mutate'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { DomainError } from '@/server/infra/http/errors'

// CMS page service — drives the save/publish state machine through the
// real in-memory engine: meta rows, revision rows, slug registry,
// metrics fan-out, and cache invalidation all land in real tables.
//
// The ONLY surviving double is the audit-scope logger: the test env runs
// pino at `silent`, so the `force_overwrite_save` line (informational
// stdout, never a DB row — see the convention note in infra/logger.ts)
// would be unobservable without intercepting `getLogger('audit.cms.pages')`.
const { auditInfoMock } = vi.hoisted(() => ({ auditInfoMock: vi.fn() }))

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: (scope: string) => {
      const real = actual.getLogger(scope)
      return scope === 'audit.cms.pages' ? { ...real, info: auditInfoMock } : real
    },
  }
})

const db = getTestDb()

async function seedPage(overrides: Partial<typeof pageMetaTable.$inferInsert> = {}) {
  const rows = await db
    .insert(pageMetaTable)
    .values({
      slug: overrides.slug ?? `page-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? 'Test',
      ...overrides,
    })
    .returning()
  return rows[0]!
}

async function seedRevision(ownerId: number, overrides: Partial<typeof contentTable.$inferInsert> = {}) {
  const rows = await db
    .insert(contentTable)
    .values({
      type: 'page',
      ownerId,
      revisionNo: overrides.revisionNo ?? 1,
      status: overrides.status ?? 'draft',
      body: [],
      imageSources: [],
      headings: [],
      ...overrides,
    })
    .returning()
  return rows[0]!
}

async function contentRows(ownerId: number) {
  return db.select().from(contentTable).where(eq(contentTable.ownerId, ownerId))
}

const VALID_BODY = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'h2',
    children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
  },
]

beforeEach(async () => {
  await clearAllTables(db)
  auditInfoMock.mockClear()
})

describe('cms/pages/service — listPagesForAdmin / getPageDetailForAdmin', () => {
  it('hasMore = true while another page exists, false when the offset+rows reaches total', async () => {
    // Stagger updated_at so the desc(updatedAt) ordering is deterministic.
    const base = Date.now()
    for (let i = 1; i <= 5; i++) {
      await seedPage({ slug: `page-${i}`, updatedAt: new Date(base + i * 60_000) })
    }

    const more = await adminQuery.listPagesForAdmin(db, { offset: 0, limit: 2 })
    expect(more.total).toBe(5)
    expect(more.hasMore).toBe(true)
    expect(more.pages.map((p) => p.slug)).toEqual(['page-5', 'page-4'])

    const last = await adminQuery.listPagesForAdmin(db, { offset: 4, limit: 2 })
    expect(last.total).toBe(5)
    expect(last.hasMore).toBe(false)
    expect(last.pages.map((p) => p.slug)).toEqual(['page-1'])
  })

  it('getPageDetailForAdmin projects latest + published revisions independently', async () => {
    const published = await seedRevision(0, { revisionNo: 3, status: 'published' })
    const meta = await seedPage({ publishedRevisionId: published.id })
    const draft = await seedRevision(meta.id, { revisionNo: 4, status: 'draft' })
    await db.update(contentTable).set({ ownerId: meta.id }).where(eq(contentTable.id, published.id))

    const detail = await adminQuery.getPageDetailForAdmin(db, meta.id)
    expect(detail.page.id).toBe(String(meta.id))
    expect(detail.latestRevision?.revisionNo).toBe(4)
    expect(detail.latestRevision?.status).toBe('draft')
    expect(detail.latestRevision?.id).toBe(String(draft.id))
    expect(detail.publishedRevision?.revisionNo).toBe(3)
    expect(detail.publishedRevision?.status).toBe('published')
  })
})

describe('cms/pages/service — createPage / updatePageMeta validation', () => {
  it('rejects slugs that contain illegal characters', async () => {
    await expect(mutate.createPage(db, { slug: 'About Me', title: 'x' }, null)).rejects.toBeInstanceOf(DomainError)
    expect(await db.select().from(pageMetaTable)).toHaveLength(0)
  })

  it('rejects reserved slugs that would shadow public routes', async () => {
    for (const slug of ['posts', 'cats', 'tags', 'admin', 'api']) {
      await expect(mutate.createPage(db, { slug, title: 't' }, null)).rejects.toBeInstanceOf(DomainError)
    }
    expect(await db.select().from(pageMetaTable)).toHaveLength(0)
  })

  it('updatePageMeta tolerates a same-slug edit (no collision check fires)', async () => {
    const meta = await seedPage({ slug: 'about', title: 'old' })

    const dto = await mutate.updatePageMeta(db, { id: meta.id, slug: 'about', title: 'new' })

    expect(dto.title).toBe('new')
    const row = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, meta.id))
    expect(row[0]?.title).toBe('new')
    expect(row[0]?.slug).toBe('about')
  })

  it('createPage always inserts status=draft even when input says true', async () => {
    const dto = await mutate.createPage(db, { title: 'New Page', published: true }, null)

    expect(dto.published).toBe(false)
    const rows = await db.select().from(pageMetaTable)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.published).toBe(false)
  })

  it('updatePageMeta never touches published even when input includes it', async () => {
    const meta = await seedPage({ slug: 'about', published: true })

    const dto = await mutate.updatePageMeta(db, {
      id: meta.id,
      slug: 'about',
      title: 'Updated',
      published: false,
    })

    expect(dto.title).toBe('Updated')
    expect(dto.published).toBe(true)
    const row = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, meta.id))
    expect(row[0]?.published).toBe(true)
  })
})

describe('cms/pages lifecycle — saveBody draft / publish body validation', () => {
  it('rejects a malformed body (zod issues become DomainError 400) and writes no revision', async () => {
    const meta = await seedPage()

    await expect(
      lifecycle.saveBody(
        db,
        pageLifecycleAdapter,
        { entityId: meta.id, body: [{ _type: 'unknown', _key: 'k' }], authorId: null },
        'draft',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await contentRows(meta.id)).toHaveLength(0)
  })

  it('rejects when the page row is missing without touching the revisions table', async () => {
    await expect(
      lifecycle.saveBody(db, pageLifecycleAdapter, { entityId: 999, body: VALID_BODY, authorId: null }, 'draft'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await db.select().from(contentTable)).toHaveLength(0)
  })

  it('persists the body with derived imageSources and headings on the revision row', async () => {
    const meta = await seedPage()

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
    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: meta.id, body, authorId: 42 },
      'draft',
    )
    expect(result.status).toBe('saved')

    const rows = await contentRows(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.imageSources).toEqual(['images/2026/05/foo.jpg'])
    expect(rows[0]?.headings).toEqual([{ depth: 2, text: 'Hello', slug: 'hello' }])
    expect(rows[0]?.authorId).toBe(42)
  })

  it('translates a repository "conflict" into the wire shape with the latest revision DTO', async () => {
    const meta = await seedPage()
    const latest = await seedRevision(meta.id, {
      revisionNo: 5,
      status: 'draft',
      clientRevisionToken: '11111111-2222-3333-4444-555555555555',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'stale-token',
      },
      'draft',
    )
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe(String(latest.id))
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe(latest.clientRevisionToken)
    }
    // The conflicting save wrote nothing — the draft row is untouched.
    const rows = await contentRows(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.clientRevisionToken).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('publish projects the saved revision back as a "saved" wire DTO and flips the meta row', async () => {
    const meta = await seedPage({ published: false, publishedRevisionId: null })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: meta.id, body: VALID_BODY, authorId: 5 },
      'publish',
    )
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.revision.status).toBe('published')
      expect(result.revision.revisionNo).toBe(1)
    }

    const row = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, meta.id))
    expect(row[0]?.published).toBe(true)
    expect(row[0]?.publishedRevisionId).not.toBeNull()
    expect(row[0]?.firstPublishedAt).not.toBeNull()
  })
})

describe('cms/pages lifecycle — saveBody CAS + force', () => {
  it('saveBody with a matching expectation token saves instead of conflicting', async () => {
    const meta = await seedPage()
    const latest = await seedRevision(meta.id, {
      revisionNo: 3,
      status: 'draft',
      clientRevisionToken: 'expected-token-abc',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'expected-token-abc',
      },
      'draft',
    )

    expect(result.status).toBe('saved')
    // The draft was updated in place (no new revision row) and the token rotated.
    const rows = await contentRows(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(latest.id)
    expect(rows[0]?.clientRevisionToken).not.toBe('expected-token-abc')
  })

  it('saveBody with force=true bypasses CAS and writes an audit log line', async () => {
    const meta = await seedPage()
    const overwritten = await seedRevision(meta.id, {
      revisionNo: 9,
      status: 'draft',
      clientRevisionToken: 'server-side-newer',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: 42,
        expectedClientRevisionToken: 'client-thought-this',
        force: true,
      },
      'draft',
    )
    expect(result.status).toBe('saved')

    // Audit log emitted exactly once for the genuine overwrite.
    expect(auditInfoMock).toHaveBeenCalledTimes(1)
    const [message, context] = auditInfoMock.mock.calls[0]!
    expect(message).toBe('force_overwrite_save')
    // The draft update happens in place, so the overwritten row and the
    // result row share one id — only the token rotated.
    const rows = await contentRows(meta.id)
    expect(rows).toHaveLength(1)
    expect(context).toMatchObject({
      mode: 'draft',
      actor: '42',
      pageMetaId: String(meta.id),
      overwrittenRevisionId: String(overwritten.id),
      overwrittenRevisionToken: 'server-side-newer',
      clientExpectedToken: 'client-thought-this',
      resultRevisionId: String(rows[0]!.id),
    })
    expect(rows[0]?.clientRevisionToken).not.toBe('server-side-newer')
  })

  it('saveBody with force=true on a no-op overwrite (matching tokens) skips the audit log', async () => {
    const meta = await seedPage()
    await seedRevision(meta.id, {
      revisionNo: 3,
      status: 'draft',
      clientRevisionToken: 'aligned-token',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'aligned-token',
        force: true,
      },
      'draft',
    )

    expect(result.status).toBe('saved')
    expect(auditInfoMock).not.toHaveBeenCalled()
  })

  it('publish translates a conflict back into the wire shape and leaves the meta row unpublished', async () => {
    const meta = await seedPage({ published: false, publishedRevisionId: null })
    const stale = await seedRevision(meta.id, {
      revisionNo: 4,
      status: 'draft',
      clientRevisionToken: 'newer-than-client',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'stale-client',
        force: false,
      },
      'publish',
    )
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe(String(stale.id))
      expect(result.expectedToken).toBe('newer-than-client')
    }

    const row = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, meta.id))
    expect(row[0]?.published).toBe(false)
    expect(row[0]?.publishedRevisionId).toBeNull()
  })

  it('publish with force=true writes the audit log with mode="publish" and publishes the revision', async () => {
    const meta = await seedPage({ published: false, publishedRevisionId: null })
    const overwritten = await seedRevision(meta.id, {
      revisionNo: 12,
      status: 'draft',
      clientRevisionToken: 'srv-token',
    })

    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: 99,
        expectedClientRevisionToken: 'cli-token',
        force: true,
      },
      'publish',
    )
    expect(result.status).toBe('saved')

    expect(auditInfoMock).toHaveBeenCalledTimes(1)
    const [message, context] = auditInfoMock.mock.calls[0]!
    expect(message).toBe('force_overwrite_save')
    expect(context).toMatchObject({
      mode: 'publish',
      actor: '99',
      pageMetaId: String(meta.id),
      overwrittenRevisionId: String(overwritten.id),
      overwrittenRevisionToken: 'srv-token',
      clientExpectedToken: 'cli-token',
    })

    const row = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, meta.id))
    expect(row[0]?.published).toBe(true)
    expect(row[0]?.publishedRevisionId).toBe(overwritten.id)
  })
})
