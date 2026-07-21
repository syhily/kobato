import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { describe, expect, it } from 'vitest'

import type { ContentRow } from '@/server/infra/db/types'

import { checkTokenConflict, lockMetaAndLoadLatest } from '@/server/domains/content/repos/mutate'

/** The tx handle handed to a `db.transaction(...)` callback — same alias as in the module under test. */
type RevisionTx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0]

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
    clientRevisionToken: overrides.clientRevisionToken ?? 'server-token',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('content/repos/mutate — checkTokenConflict', () => {
  it('returns a conflict when the client token differs from the latest row token', () => {
    const latest = contentRow({ clientRevisionToken: 'server-token' })
    const conflict = checkTokenConflict(latest, { expectedClientRevisionToken: 'stale-token' })
    expect(conflict).toEqual({ status: 'conflict', latest, expectedToken: 'server-token' })
  })

  it('returns null when force=true even with a mismatched token', () => {
    const latest = contentRow()
    expect(checkTokenConflict(latest, { expectedClientRevisionToken: 'stale-token', force: true })).toBeNull()
  })

  it('returns null when there is no latest revision', () => {
    expect(checkTokenConflict(undefined, { expectedClientRevisionToken: 'stale-token' })).toBeNull()
  })

  it('returns null when the client sent no expectation token', () => {
    expect(checkTokenConflict(contentRow(), {})).toBeNull()
    expect(checkTokenConflict(contentRow(), { expectedClientRevisionToken: undefined })).toBeNull()
  })

  it('returns null when the tokens match', () => {
    const latest = contentRow({ clientRevisionToken: 'same-token' })
    expect(checkTokenConflict(latest, { expectedClientRevisionToken: 'same-token' })).toBeNull()
  })

  it('treats a null expectation as a real token value (conflict on mismatch)', () => {
    const latest = contentRow({ clientRevisionToken: 'server-token' })
    const conflict = checkTokenConflict(latest, { expectedClientRevisionToken: null })
    expect(conflict).not.toBeNull()
    expect(conflict?.expectedToken).toBe('server-token')
  })
})

interface FakeTxOptions {
  /** Meta rows returned by the locking select; empty means the owner is gone. */
  lockRows: { id: bigint; firstPublishedAt: Date | null }[]
  /** Latest-revision rows returned by the content select. */
  latestRows: ContentRow[]
}

/**
 * Minimal structural fake of the drizzle tx: the first `select(fields)`
 * call (with a selection object) is the meta-row lock, the second
 * `select()` (no args) is the latest-revision lookup. Every chain step
 * returns an awaitable that resolves to the configured rows.
 */
function makeFakeTx(options: FakeTxOptions): RevisionTx {
  const lockChain = {
    from: () => lockChain,
    where: () => lockChain,
    for: () => lockChain,
    then: (resolve: (rows: FakeTxOptions['lockRows']) => unknown) => Promise.resolve(options.lockRows).then(resolve),
  }
  const latestChain = {
    from: () => latestChain,
    where: () => latestChain,
    orderBy: () => latestChain,
    limit: () => latestChain,
    then: (resolve: (rows: ContentRow[]) => unknown) => Promise.resolve(options.latestRows).then(resolve),
  }
  const tx = {
    select: (fields?: unknown) => (fields === undefined ? latestChain : lockChain),
  }
  return tx as unknown as RevisionTx
}

describe('content/repos/mutate — lockMetaAndLoadLatest', () => {
  it('throws DomainError NOT_FOUND when the meta row is missing', async () => {
    const tx = makeFakeTx({ lockRows: [], latestRows: [] })
    await expect(lockMetaAndLoadLatest(tx, 'post', 42n)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns the locked meta row and the latest revision', async () => {
    const firstPublishedAt = new Date('2026-01-01T00:00:00.000Z')
    const latest = contentRow({ revisionNo: 7 })
    const tx = makeFakeTx({ lockRows: [{ id: 42n, firstPublishedAt }], latestRows: [latest] })
    const result = await lockMetaAndLoadLatest(tx, 'post', 42n)
    expect(result.meta).toEqual({ id: 42n, firstPublishedAt })
    expect(result.latest).toBe(latest)
  })

  it('returns latest=undefined when the owner has no revisions yet', async () => {
    const tx = makeFakeTx({ lockRows: [{ id: 42n, firstPublishedAt: null }], latestRows: [] })
    const result = await lockMetaAndLoadLatest(tx, 'page', 42n)
    expect(result.meta.id).toBe(42n)
    expect(result.latest).toBeUndefined()
  })
})
