import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentEntityAdapter, ForceOverwriteEntry } from '@/server/domains/content/lifecycle'
import type { ContentRow } from '@/server/infra/db/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'

// Merged-lifecycle contract tests against the real engine: the repo
// layer (`saveDraftRevision` / `publishLatestRevision` / the revision
// queries) runs against real `content` / `post` rows, so every former
// `toHaveBeenCalledWith` repo assertion is now a table-state assertion.
// The entity adapter stays fake — it is the SUT's declared seam, so
// `recordForceOverwrite` callback assertions are kept. `image-sync`
// runs in spy mode: the real sync executes everywhere except the one
// degraded-save case, which forces a single rejection through the spy
// (no seedable data state makes the real sync throw — a body block
// referencing a missing library image is skipped by design, see
// image-sync.test.ts).
vi.mock('@/server/domains/content/services/image-sync', { spy: true })
vi.mock('@/server/domains/content/revisions', { spy: true })

const { loadDraftPreviewBySlug, previewBody, saveBody } = await import('@/server/domains/content/lifecycle')
const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')
const { findLatestRevision } = await import('@/server/domains/content/revisions')

const db = getTestDb()

interface FakeMeta {
  id: number
  publishedRevisionId: number | null
}

interface FakePreview {
  id: string
}

function makeAdapter(meta: FakeMeta | null) {
  const recordForceOverwrite = vi.fn()
  const afterPublish = vi.fn(async () => undefined)
  const adapter: ContentEntityAdapter<FakeMeta, FakePreview> = {
    entityType: 'post',
    findMetaById: () => meta,
    findPublicMetaBySlug: () => meta,
    assertAccess(found: FakeMeta | null): asserts found is FakeMeta {
      if (found === null) {
        throw new DomainError('NOT_FOUND', 'missing')
      }
    },
    canPreviewDraft: () => true,
    getId: (m) => m.id,
    getPublishedRevisionId: (m) => m.publishedRevisionId,
    projectPreview: (m) => ({ id: m.id.toString() }),
    recordForceOverwrite,
    afterPublish,
  }
  return { adapter, recordForceOverwrite, afterPublish }
}

const VALID_BODY = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
  },
]

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedPost(): Promise<typeof postMetaTable.$inferSelect> {
  const rows = await db
    .insert(postMetaTable)
    .values({ slug: `post-${Math.random().toString(36).slice(2)}`, title: 'Test', published: false })
    .returning()
  return rows[0]!
}

async function seedRevision(
  ownerId: number,
  overrides: Partial<typeof contentTable.$inferInsert> = {},
): Promise<ContentRow> {
  const rows = await db
    .insert(contentTable)
    .values({
      type: 'post',
      ownerId,
      revisionNo: 1,
      status: 'published',
      body: [],
      imageSources: [],
      headings: [],
      ...overrides,
    })
    .returning()
  return rows[0]!
}

async function revisionsOf(ownerId: number): Promise<ContentRow[]> {
  return db.select().from(contentTable).where(eq(contentTable.ownerId, ownerId)).orderBy(asc(contentTable.revisionNo))
}

async function allRevisions(): Promise<ContentRow[]> {
  return db.select().from(contentTable)
}

describe('content/lifecycle — saveBody validation', () => {
  it('rejects a malformed body with BAD_REQUEST before touching the repo', async () => {
    const { adapter } = makeAdapter({ id: 1, publishedRevisionId: null })
    await expect(
      saveBody(db, adapter, { entityId: 1, body: [{ _type: 'unknown', _key: 'k' }], authorId: null }, 'draft'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // No revision row was written.
    expect(await allRevisions()).toHaveLength(0)
  })

  it('propagates the adapter access gate (missing meta → NOT_FOUND)', async () => {
    const { adapter } = makeAdapter(null)
    await expect(
      saveBody(db, adapter, { entityId: 1, body: VALID_BODY, authorId: null }, 'draft'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await allRevisions()).toHaveLength(0)
  })
})

describe('content/lifecycle — saveBody degraded sync', () => {
  it('continues with a warning when the image-library sync fails', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(syncLibraryImageBlocks).mockRejectedValueOnce(new Error('boom'))

    const result = await saveBody(db, adapter, { entityId: meta.id, body: VALID_BODY, authorId: null }, 'draft')

    expect(result.status).toBe('saved')
    expect(result.warning).toBe('图片库同步失败，部分图片可能无法正常显示。')
    // The draft revision was still written despite the degraded sync.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('draft')
    expect(rows[0]!.revisionNo).toBe(1)
  })
})

describe('content/lifecycle — saveBody force overwrite', () => {
  it('records the overwrite against the latest revision when tokens mismatch', async () => {
    const meta = await seedPost()
    // Seed a PUBLISHED revision as the latest: the overwrite context must
    // come from the latest revision of any status, not the latest draft —
    // with only a published row present, a `findLatestDraft` context would
    // find nothing and skip the audit entirely.
    const overwritten = await seedRevision(meta.id, {
      revisionNo: 9,
      status: 'published',
      clientRevisionToken: 'server-side-newer',
    })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: overwritten.id })

    await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: 42,
        expectedClientRevisionToken: 'client-thought-this',
        force: true,
      },
      'draft',
    )

    expect(recordForceOverwrite).toHaveBeenCalledTimes(1)
    const entry = recordForceOverwrite.mock.calls[0]![0] as ForceOverwriteEntry<FakeMeta>
    expect(entry.mode).toBe('draft')
    expect(entry.authorId).toBe(42)
    expect(entry.meta.id).toBe(meta.id)
    // The overwritten context is the seeded published row.
    expect(entry.overwritten.id).toBe(overwritten.id)
    expect(entry.overwritten.clientRevisionToken).toBe('server-side-newer')
    expect(entry.expectedClientRevisionToken).toBe('client-thought-this')

    // The result row is the freshly inserted draft revision in the table.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(2)
    const latest = rows[1]!
    expect(latest.status).toBe('draft')
    expect(latest.revisionNo).toBe(10)
    expect(latest.authorId).toBe(42)
    expect(entry.resultRow.id).toBe(latest.id)
  })

  it('skips the overwrite record when the expected token matches the latest revision', async () => {
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'published', clientRevisionToken: 'aligned-token' })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'aligned-token',
        force: true,
      },
      'draft',
    )

    expect(recordForceOverwrite).not.toHaveBeenCalled()
    // The force save still wrote a new draft revision.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(2)
    expect(rows[1]!.status).toBe('draft')
  })

  it('propagates a revision-read failure on the force path instead of silently dropping audit context', async () => {
    // Audit P1-25: "read failed" must not be treated as "no prior
    // revision" — on the force path (the one that most needs the audit
    // trail) a transient DB error aborts the save loudly. Spy mode keeps
    // the real query everywhere else; only this one read rejects (no
    // seedable table state makes the real read throw on a live engine).
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'published', clientRevisionToken: 'server-token' })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(findLatestRevision).mockRejectedValueOnce(new Error('transient read failure'))

    await expect(
      saveBody(db, adapter, { entityId: meta.id, body: VALID_BODY, authorId: 42, force: true }, 'draft'),
    ).rejects.toThrow('transient read failure')

    // The save aborted before the repo write: only the seeded revision
    // remains, and no force-overwrite audit was recorded.
    expect(await revisionsOf(meta.id)).toHaveLength(1)
    expect(recordForceOverwrite).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — saveBody result projection', () => {
  it('passes a repo conflict through with the latest revision DTO', async () => {
    const meta = await seedPost()
    const latest = await seedRevision(meta.id, {
      revisionNo: 5,
      status: 'draft',
      clientRevisionToken: '11111111-2222-3333-4444-555555555555',
    })
    const { adapter, recordForceOverwrite, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, expectedClientRevisionToken: 'stale-token' },
      'draft',
    )

    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe(latest.id.toString())
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe('11111111-2222-3333-4444-555555555555')
    }
    expect(recordForceOverwrite).not.toHaveBeenCalled()
    expect(afterPublish).not.toHaveBeenCalled()
    // The conflicted save wrote nothing: the seeded draft is untouched.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.clientRevisionToken).toBe('11111111-2222-3333-4444-555555555555')
    expect(rows[0]!.body).toEqual([])
  })
})

describe('content/lifecycle — saveBody publish side effects', () => {
  it('runs afterPublish on a successful publish', async () => {
    const meta = await seedPost()
    const { adapter, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(db, adapter, { entityId: meta.id, body: VALID_BODY, authorId: 5 }, 'publish')

    expect(result.status).toBe('saved')
    expect(afterPublish).toHaveBeenCalledTimes(1)
    // The publish landed: revision row is published and the post meta
    // points at it.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('published')
    const metaRows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, meta.id))
    expect(metaRows[0]!.published).toBe(true)
    expect(metaRows[0]!.publishedRevisionId).toBe(rows[0]!.id)
  })

  it('does not run afterPublish for a draft save', async () => {
    const meta = await seedPost()
    const { adapter, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    await saveBody(db, adapter, { entityId: meta.id, body: VALID_BODY, authorId: null }, 'draft')

    expect(afterPublish).not.toHaveBeenCalled()
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('draft')
    const metaRows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, meta.id))
    expect(metaRows[0]!.publishedRevisionId).toBeNull()
  })
})

describe('content/lifecycle — loadDraftPreviewBySlug', () => {
  it('returns null when the slug does not resolve to a meta row', async () => {
    const { adapter } = makeAdapter(null)
    expect(await loadDraftPreviewBySlug(db, adapter, 'nope')).toBeNull()
  })

  it('projects the adapter preview with the draft flag', async () => {
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'draft' })
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await loadDraftPreviewBySlug(db, adapter, 'hello')

    expect(result).not.toBeNull()
    expect(result!.preview.id).toBe(meta.id.toString())
    expect(result!.hasNewerDraft).toBe(true)
  })
})

describe('content/lifecycle — previewBody', () => {
  it('canonicalizes, renders, and collects headings through one pipeline', async () => {
    const body = [
      {
        _type: 'block',
        _key: 'h1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
      },
    ]
    const render = vi.fn(async () => '<h2>Hello</h2>')

    const result = await previewBody(body, render)

    expect(result.html).toBe('<h2>Hello</h2>')
    expect(result.headings).toEqual([{ depth: 2, text: 'Hello', slug: 'hello' }])
    expect(render).toHaveBeenCalledTimes(1)
  })
})
