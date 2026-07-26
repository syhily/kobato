import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'
import type { ContentRow } from '@/server/infra/db/types'

import { DomainError } from '@/server/infra/http/errors'

// Merged-lifecycle contract tests with a fake entity adapter. The repo
// layer and the image-library sync are mocked so the suite pins the
// pipeline contract: canonicalize → sync (degraded) → repo write →
// force-overwrite audit → afterPublish side effect.

vi.mock('@/server/domains/content/repos/mutate', () => ({
  saveDraftRevision: vi.fn(),
  publishLatestRevision: vi.fn(),
}))
vi.mock('@/server/domains/content/revisions', () => ({
  findContentById: vi.fn(async () => null),
  findLatestDraft: vi.fn(async () => null),
  findLatestRevision: vi.fn(async () => null),
}))
vi.mock('@/server/domains/content/services/image-sync', () => ({
  syncLibraryImageBlocks: vi.fn(async () => undefined),
}))

const { loadDraftPreviewBySlug, previewBody, saveBody } = await import('@/server/domains/content/lifecycle')
const { publishLatestRevision, saveDraftRevision } = await import('@/server/domains/content/repos/mutate')
const query = await import('@/server/domains/content/revisions')
const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')

const db = {} as NodePgDatabase

interface FakeMeta {
  id: bigint
  publishedRevisionId: bigint | null
}

interface FakePreview {
  id: string
}

function makeAdapter() {
  const recordForceOverwrite = vi.fn()
  const afterPublish = vi.fn(async () => undefined)
  const adapter: ContentEntityAdapter<FakeMeta, FakePreview> = {
    entityType: 'post',
    findMetaById: vi.fn(async () => ({ id: 1n, publishedRevisionId: null })),
    findPublicMetaBySlug: vi.fn(async () => null),
    assertAccess(meta: FakeMeta | null): asserts meta is FakeMeta {
      if (meta === null) {
        throw new DomainError('NOT_FOUND', 'missing')
      }
    },
    canPreviewDraft: vi.fn(() => true),
    getId: (meta) => meta.id,
    getPublishedRevisionId: (meta) => meta.publishedRevisionId,
    projectPreview: (meta) => ({ id: meta.id.toString() }),
    recordForceOverwrite,
    afterPublish,
  }
  return { adapter, recordForceOverwrite, afterPublish }
}

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 100n,
    type: overrides.type ?? 'post',
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
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(query.findLatestRevision).mockResolvedValue(null)
  vi.mocked(query.findLatestDraft).mockResolvedValue(null)
  vi.mocked(syncLibraryImageBlocks).mockResolvedValue(undefined)
})

describe('content/lifecycle — saveBody validation', () => {
  it('rejects a malformed body with BAD_REQUEST before touching the repo', async () => {
    const { adapter } = makeAdapter()
    await expect(
      saveBody(db, adapter, { entityId: 1n, body: [{ _type: 'unknown', _key: 'k' }], authorId: null }, 'draft'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(saveDraftRevision).not.toHaveBeenCalled()
  })

  it('propagates the adapter access gate (missing meta → NOT_FOUND)', async () => {
    const { adapter } = makeAdapter()
    vi.mocked(adapter.findMetaById).mockResolvedValue(null)
    await expect(
      saveBody(db, adapter, { entityId: 1n, body: VALID_BODY, authorId: null }, 'draft'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(saveDraftRevision).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — saveBody degraded sync', () => {
  it('continues with a warning when the image-library sync fails', async () => {
    const { adapter } = makeAdapter()
    vi.mocked(syncLibraryImageBlocks).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(saveDraftRevision).mockResolvedValue({ status: 'saved', row: contentRow() })

    const result = await saveBody(db, adapter, { entityId: 1n, body: VALID_BODY, authorId: null }, 'draft')

    expect(result.status).toBe('saved')
    expect(result.warning).toBe('图片库同步失败，部分图片可能无法正常显示。')
    expect(saveDraftRevision).toHaveBeenCalledTimes(1)
  })
})

describe('content/lifecycle — saveBody force overwrite', () => {
  it('records the overwrite against the latest revision when tokens mismatch', async () => {
    const { adapter, recordForceOverwrite } = makeAdapter()
    vi.mocked(query.findLatestRevision).mockResolvedValue(
      contentRow({ id: 600n, revisionNo: 9, clientRevisionToken: 'server-side-newer' }),
    )
    vi.mocked(saveDraftRevision).mockResolvedValue({
      status: 'saved',
      row: contentRow({ id: 601n, revisionNo: 9 }),
    })

    await saveBody(
      db,
      adapter,
      {
        entityId: 1n,
        body: VALID_BODY,
        authorId: 42n,
        expectedClientRevisionToken: 'client-thought-this',
        force: true,
      },
      'draft',
    )

    // The overwrite context comes from `findLatestRevision` (any status),
    // never from `findLatestDraft` — publishing over a published revision
    // is audited the same way as overwriting a draft.
    expect(query.findLatestRevision).toHaveBeenCalledWith(db, 'post', 1n)
    expect(query.findLatestDraft).not.toHaveBeenCalled()

    expect(recordForceOverwrite).toHaveBeenCalledTimes(1)
    const entry = recordForceOverwrite.mock.calls[0]![0] as {
      mode: string
      authorId: bigint | null
      meta: FakeMeta
      overwritten: ContentRow
      expectedClientRevisionToken?: string | null
      resultRow: ContentRow
    }
    expect(entry.mode).toBe('draft')
    expect(entry.authorId).toBe(42n)
    expect(entry.meta.id).toBe(1n)
    expect(entry.overwritten.id).toBe(600n)
    expect(entry.overwritten.clientRevisionToken).toBe('server-side-newer')
    expect(entry.expectedClientRevisionToken).toBe('client-thought-this')
    expect(entry.resultRow.id).toBe(601n)
  })

  it('skips the overwrite record when the expected token matches the latest revision', async () => {
    const { adapter, recordForceOverwrite } = makeAdapter()
    vi.mocked(query.findLatestRevision).mockResolvedValue(
      contentRow({ id: 700n, clientRevisionToken: 'aligned-token' }),
    )
    vi.mocked(saveDraftRevision).mockResolvedValue({ status: 'saved', row: contentRow({ id: 701n }) })

    await saveBody(
      db,
      adapter,
      { entityId: 1n, body: VALID_BODY, authorId: null, expectedClientRevisionToken: 'aligned-token', force: true },
      'draft',
    )

    expect(recordForceOverwrite).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — saveBody result projection', () => {
  it('passes a repo conflict through with the latest revision DTO', async () => {
    const { adapter, recordForceOverwrite, afterPublish } = makeAdapter()
    const latest = contentRow({ id: 999n, revisionNo: 5, clientRevisionToken: '11111111-2222-3333-4444-555555555555' })
    vi.mocked(saveDraftRevision).mockResolvedValue({
      status: 'conflict',
      latest,
      expectedToken: latest.clientRevisionToken,
    })

    const result = await saveBody(
      db,
      adapter,
      { entityId: 1n, body: VALID_BODY, authorId: null, expectedClientRevisionToken: 'stale-token' },
      'draft',
    )

    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe('999')
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe(latest.clientRevisionToken)
    }
    expect(recordForceOverwrite).not.toHaveBeenCalled()
    expect(afterPublish).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — saveBody publish side effects', () => {
  it('runs afterPublish on a successful publish', async () => {
    const { adapter, afterPublish } = makeAdapter()
    vi.mocked(publishLatestRevision).mockResolvedValue({
      status: 'published',
      row: contentRow({ revisionNo: 7, status: 'published' }),
    })

    const result = await saveBody(db, adapter, { entityId: 1n, body: VALID_BODY, authorId: 5n }, 'publish')

    expect(result.status).toBe('saved')
    expect(afterPublish).toHaveBeenCalledTimes(1)
    expect(vi.mocked(publishLatestRevision).mock.calls[0]![1]).toBe('post')
  })

  it('does not run afterPublish for a draft save', async () => {
    const { adapter, afterPublish } = makeAdapter()
    vi.mocked(saveDraftRevision).mockResolvedValue({ status: 'saved', row: contentRow() })

    await saveBody(db, adapter, { entityId: 1n, body: VALID_BODY, authorId: null }, 'draft')

    expect(afterPublish).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — loadDraftPreviewBySlug', () => {
  it('returns null when the slug does not resolve to a meta row', async () => {
    const { adapter } = makeAdapter()
    expect(await loadDraftPreviewBySlug(db, adapter, 'nope')).toBeNull()
  })

  it('projects the adapter preview with the draft flag', async () => {
    const { adapter } = makeAdapter()
    vi.mocked(adapter.findPublicMetaBySlug).mockResolvedValue({ id: 3n, publishedRevisionId: null })
    vi.mocked(query.findLatestDraft).mockResolvedValue(contentRow({ ownerId: 3n }))

    const result = await loadDraftPreviewBySlug(db, adapter, 'hello')

    expect(result).not.toBeNull()
    expect(result!.preview.id).toBe('3')
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
