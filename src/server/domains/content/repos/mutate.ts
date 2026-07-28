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

/** The tx handle handed to a `db.transaction(...)` callback. */
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
 * meta row (throwing NOT_FOUND when it is gone) and the latest content
 * revision (any status). Sync — node:sqlite; writers serialise on the
 * connection, so the old `FOR UPDATE` row lock is unnecessary.
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
 * A conflict requires all of: the client did NOT pass `force`, the
 * client echoed an expectation token, a latest revision exists, and the
 * tokens differ. `undefined` expectation means "no expectation" (skip);
 * `null` is a real token value that simply never matches.
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

export async function saveDraftRevision(
  db: Database,
  type: ContentType,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const metaTable = metaTableFor(type)
  return db.transaction((tx) => {
    const { latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    const nextToken = randomUUID()
    const now = new Date()
    const bodyJson = input.body
    const imageSourcesJson = input.imageSources
    const headingsJson = input.headings

    if (latest !== undefined && latest.status === 'draft') {
      const conflict = checkTokenConflict(latest, input)
      if (conflict !== null) {
        return conflict
      }
      const updated = tx
        .update(contentTable)
        .set({
          updatedAt: now,
          body: bodyJson as ContentRow['body'],
          imageSources: imageSourcesJson as ContentRow['imageSources'],
          headings: headingsJson as ContentRow['headings'],
          authorId: input.authorId ?? latest.authorId,
          clientRevisionToken: nextToken,
        })
        .where(eq(contentTable.id, latest.id))
        .returning()
        .all()
      tx.update(metaTable).set({ updatedAt: now }).where(eq(metaTable.id, input.ownerId)).run()
      return { status: 'saved' as const, row: updated[0] }
    }

    const conflict = checkTokenConflict(latest, input)
    if (conflict !== null) {
      return conflict
    }

    const inputBody = portableTextBodySchema.safeParse(input.body)
    const latestBody = latest !== undefined ? portableTextBodySchema.safeParse(latest.body) : null
    if (
      latest !== undefined &&
      latest.status === 'published' &&
      inputBody.success &&
      latestBody?.success &&
      arePortableTextBodiesEquivalent(inputBody.data, latestBody.data) &&
      isDeepStrictEqual(input.imageSources, latest.imageSources) &&
      isDeepStrictEqual(input.headings, latest.headings)
    ) {
      return { status: 'saved' as const, row: latest }
    }

    const nextRevisionNo = (latest?.revisionNo ?? 0) + 1
    const insert: NewContent = {
      type,
      ownerId: input.ownerId,
      revisionNo: nextRevisionNo,
      status: 'draft',
      body: bodyJson as NewContent['body'],
      imageSources: imageSourcesJson as NewContent['imageSources'],
      headings: headingsJson as NewContent['headings'],
      authorId: input.authorId,
      clientRevisionToken: nextToken,
    }
    const inserted = tx.insert(contentTable).values(insert).returning().all()
    tx.update(metaTable).set({ updatedAt: now }).where(eq(metaTable.id, input.ownerId)).run()
    return { status: 'saved' as const, row: inserted[0] }
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

    const nextToken = randomUUID()
    const now = new Date()

    let savedRow: ContentRow

    if (latest !== undefined && latest.status === 'draft') {
      const conflict = checkTokenConflict(latest, input)
      if (conflict !== null) {
        return conflict
      }
      const updated = tx
        .update(contentTable)
        .set({
          updatedAt: now,
          body: input.body as ContentRow['body'],
          imageSources: input.imageSources as ContentRow['imageSources'],
          headings: input.headings as ContentRow['headings'],
          authorId: input.authorId ?? latest.authorId,
          clientRevisionToken: nextToken,
          status: 'published',
        })
        .where(eq(contentTable.id, latest.id))
        .returning()
        .all()
      savedRow = updated[0]
    } else {
      const conflict = checkTokenConflict(latest, input)
      if (conflict !== null) {
        return conflict
      }
      const nextRevisionNo = (latest?.revisionNo ?? 0) + 1
      const insert: NewContent = {
        type,
        ownerId: input.ownerId,
        revisionNo: nextRevisionNo,
        status: 'published',
        body: input.body as NewContent['body'],
        imageSources: input.imageSources as NewContent['imageSources'],
        headings: input.headings as NewContent['headings'],
        authorId: input.authorId,
        clientRevisionToken: nextToken,
      }
      const inserted = tx.insert(contentTable).values(insert).returning().all()
      savedRow = inserted[0]
    }

    tx.update(metaTable)
      .set({
        publishedRevisionId: savedRow.id,
        published: true,
        publishedAt: input.publishedAt ?? now,
        firstPublishedAt: meta.firstPublishedAt ?? input.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(metaTable.id, input.ownerId))
      .run()

    return { status: 'published' as const, row: savedRow }
  })
}
