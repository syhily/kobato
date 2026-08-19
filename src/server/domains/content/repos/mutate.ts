import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type {
  ContentType,
  PublishLatestInput,
  PublishLatestResult,
  SaveDraftInput,
  SaveDraftResult,
} from '@/server/domains/content/schemas/revision'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow, NewContent } from '@/server/infra/db/types'

import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { portableTextBodySchema } from '@/shared/pt/schema'

type RevisionTx = Parameters<Parameters<Database['transaction']>[0]>[0]

function metaTableFor(type: ContentType) {
  return type === 'page' ? pageMetaTable : postMetaTable
}

export interface LockedMeta {
  id: number
  firstPublishedAt: Date | null
}

/**
 * Shared transaction prologue for the revision mutations: load the owner
 * meta row (throwing NOT_FOUND when gone) and the latest revision.
 */
export function lockMetaAndLoadLatest(
  tx: RevisionTx,
  type: ContentType,
  ownerId: number,
): { meta: LockedMeta; latest: ContentRow | undefined } {
  const metaTable = metaTableFor(type)
  const lockRows = tx
    .select({ id: metaTable.id, firstPublishedAt: metaTable.firstPublishedAt })
    .from(metaTable)
    .where(eq(metaTable.id, ownerId))
    .all()
  const locked = lockRows[0]
  if (locked === undefined) {
    throw new DomainError('NOT_FOUND', `${type} meta row ${ownerId} not found`)
  }

  const latestRows = tx
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
    .all()
  return { meta: locked, latest: latestRows[0] }
}

export interface TokenConflict {
  status: 'conflict'
  latest: ContentRow
  expectedToken: string
}

/**
 * The optimistic-concurrency check both mutations run before writing.
 * `undefined` expectation = "no expectation" (skip); `null` never matches.
 */
export function checkTokenConflict(
  latest: ContentRow | undefined,
  input: { expectedClientRevisionToken?: string | null; force?: boolean },
): TokenConflict | null {
  if (input.force === true || input.expectedClientRevisionToken === undefined || latest === undefined) {
    return null
  }
  if (input.expectedClientRevisionToken === latest.clientRevisionToken) {
    return null
  }
  return { status: 'conflict', latest, expectedToken: latest.clientRevisionToken }
}

/**
 * The single revision-write primitive: conflict check, then an in-place
 * rewrite of the latest DRAFT row or an appended revision at `status`.
 * Returns the conflict for the caller, or the written row.
 */
function writeRevisionRow(
  tx: RevisionTx,
  type: ContentType,
  latest: ContentRow | undefined,
  input: SaveDraftInput,
  status: 'draft' | 'published',
): TokenConflict | { row: ContentRow } {
  const conflict = checkTokenConflict(latest, input)
  if (conflict !== null) {
    return conflict
  }

  const now = new Date()
  const nextToken = randomUUID()

  if (latest?.status === 'draft') {
    // Only runs on a draft row — `status` is an identity write or the draft→published flip.
    const updated = tx
      .update(contentTable)
      .set({
        updatedAt: now,
        status,
        body: input.body as ContentRow['body'],
        imageSources: input.imageSources as ContentRow['imageSources'],
        headings: input.headings as ContentRow['headings'],
        authorId: input.authorId ?? latest.authorId,
        clientRevisionToken: nextToken,
      })
      .where(eq(contentTable.id, latest.id))
      .returning()
      .all()
    return { row: updated[0] }
  }

  const insert: NewContent = {
    type,
    ownerId: input.ownerId,
    revisionNo: (latest?.revisionNo ?? 0) + 1,
    status,
    body: input.body as NewContent['body'],
    imageSources: input.imageSources as NewContent['imageSources'],
    headings: input.headings as NewContent['headings'],
    authorId: input.authorId,
    clientRevisionToken: nextToken,
  }
  const inserted = tx.insert(contentTable).values(insert).returning().all()
  return { row: inserted[0] }
}

export async function saveDraftRevision(
  db: Database,
  type: ContentType,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const metaTable = metaTableFor(type)
  return db.transaction((tx) => {
    const { latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    // Conflict check precedes the no-op short-circuit — a stale token must surface even when bodies match.
    const conflict = checkTokenConflict(latest, input)
    if (conflict !== null) {
      return conflict
    }

    const inputBody = portableTextBodySchema.safeParse(input.body)
    const latestBody = latest !== undefined ? portableTextBodySchema.safeParse(latest.body) : null
    if (
      latest?.status === 'published' &&
      inputBody.success &&
      latestBody?.success &&
      arePortableTextBodiesEquivalent(inputBody.data, latestBody.data) &&
      isDeepStrictEqual(input.imageSources, latest.imageSources) &&
      isDeepStrictEqual(input.headings, latest.headings)
    ) {
      return { status: 'saved' as const, row: latest }
    }

    const written = writeRevisionRow(tx, type, latest, input, 'draft')
    if (!('row' in written)) {
      return written
    }
    tx.update(metaTable).set({ updatedAt: new Date() }).where(eq(metaTable.id, input.ownerId)).run()
    return { status: 'saved' as const, row: written.row }
  })
}

export async function publishLatestRevision(
  db: Database,
  type: ContentType,
  input: PublishLatestInput,
): Promise<PublishLatestResult> {
  const metaTable = metaTableFor(type)
  return db.transaction((tx) => {
    const { meta, latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    const written = writeRevisionRow(tx, type, latest, input, 'published')
    if (!('row' in written)) {
      return written
    }

    const now = new Date()
    tx.update(metaTable)
      .set({
        publishedRevisionId: written.row.id,
        published: true,
        publishedAt: input.publishedAt ?? now,
        firstPublishedAt: meta.firstPublishedAt ?? input.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(metaTable.id, input.ownerId))
      .run()

    return { status: 'published' as const, row: written.row }
  })
}
