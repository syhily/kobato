import type { Database } from '@kobato/db/sqlite/database'
import type { ContentRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { page as pageMetaTable } from '@kobato/db/sqlite/schema/page'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { areLexicalEditorStatesEquivalent } from '@kobato/inkling/headless/equivalence'
import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export type ContentType = 'page' | 'post'

/**
 * Thrown by the revision save/publish scripts when the owning meta row does not exist. The server maps it to its
 * user-facing not-found error.
 */
export class MissingContentOwnerError extends Error {
  constructor(
    readonly entityType: ContentType,
    readonly ownerId: number,
  ) {
    super(`${entityType} meta row ${ownerId} not found`)
    this.name = 'MissingContentOwnerError'
  }
}

export interface RevisionBodyProjections {
  bodyHtml: string
  bodyText: string
  bodyHtmlFeed: string
}

export interface SaveRevisionInput {
  ownerId: number
  body: unknown
  imageSources: string[]
  headings: unknown
  projections?: RevisionBodyProjections | null
  authorId: number | null
  expectedClientRevisionToken?: string | null
  force?: boolean
}

export interface PublishRevisionInput extends SaveRevisionInput {
  publishedAt?: Date
}

export type SaveRevisionResult =
  | { status: 'saved'; row: ContentRow }
  | { status: 'conflict'; latest: ContentRow; expectedToken: string }

export type PublishRevisionResult =
  | { status: 'published'; row: ContentRow }
  | { status: 'conflict'; latest: ContentRow; expectedToken: string }

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function findContentById(db: Database, id: number): ContentRow | null {
  const rows = sqliteOf(db).select().from(contentTable).where(eq(contentTable.id, id)).limit(1).all()
  return rows[0] ?? null
}

export async function findContentsByIds(db: Database, ids: number[]): Promise<ContentRow[]> {
  if (ids.length === 0) {
    return []
  }
  return sqliteOf(db).select().from(contentTable).where(inArray(contentTable.id, ids))
}

export async function hydratePublishedRevisions(
  db: Database,
  rows: readonly { publishedRevisionId: number | null }[],
): Promise<Map<number, ContentRow>> {
  const map = new Map<number, ContentRow>()
  const ids = rows.map((row) => row.publishedRevisionId).filter((id): id is number => id !== null)
  if (ids.length === 0) {
    return map
  }
  const revisions = await findContentsByIds(db, ids)
  for (const revision of revisions) {
    map.set(revision.id, revision)
  }
  return map
}

export async function findLatestRevision(db: Database, type: ContentType, ownerId: number): Promise<ContentRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function findLatestDraft(db: Database, type: ContentType, ownerId: number): Promise<ContentRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId), eq(contentTable.status, 'draft')))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function listRevisions(
  db: Database,
  type: ContentType,
  ownerId: number,
  limit = 100,
): Promise<ContentRow[]> {
  return sqliteOf(db)
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Save / publish transaction scripts
// ---------------------------------------------------------------------------

interface LockedMeta {
  id: number
  firstPublishedAt: Date | null
}

export function lockMetaAndLoadLatest(
  tx: Parameters<Parameters<ReturnType<typeof sqliteOf>['transaction']>[0]>[0],
  type: ContentType,
  ownerId: number,
): { meta: LockedMeta; latest: ContentRow | undefined } {
  const metaTable = type === 'page' ? pageMetaTable : postMetaTable
  const locked = tx
    .select({ id: metaTable.id, firstPublishedAt: metaTable.firstPublishedAt })
    .from(metaTable)
    .where(eq(metaTable.id, ownerId))
    .all()[0]
  if (locked === undefined) {
    throw new MissingContentOwnerError(type, ownerId)
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

export function checkTokenConflict(
  latest: ContentRow | undefined,
  input: { expectedClientRevisionToken?: string | null; force?: boolean },
): { status: 'conflict'; latest: ContentRow; expectedToken: string } | null {
  if (input.force === true || input.expectedClientRevisionToken === undefined || latest === undefined) {
    return null
  }
  if (input.expectedClientRevisionToken === latest.clientRevisionToken) {
    return null
  }
  return { status: 'conflict', latest, expectedToken: latest.clientRevisionToken }
}

function isEquivalentToPublishedLatest(latest: ContentRow | undefined, input: SaveRevisionInput): latest is ContentRow {
  if (latest?.status !== 'published') {
    return false
  }
  const inputBody = lexicalEditorStateSchema.safeParse(input.body)
  const latestBody = lexicalEditorStateSchema.safeParse(latest.body)
  return (
    inputBody.success &&
    latestBody.success &&
    areLexicalEditorStatesEquivalent(inputBody.data, latestBody.data) &&
    isDeepStrictEqual(input.imageSources, latest.imageSources) &&
    isDeepStrictEqual(input.headings, latest.headings)
  )
}

function writeRevisionRow(
  tx: Parameters<Parameters<ReturnType<typeof sqliteOf>['transaction']>[0]>[0],
  type: ContentType,
  latest: ContentRow | undefined,
  input: SaveRevisionInput,
  status: 'draft' | 'published',
): SaveRevisionResult {
  const conflict = checkTokenConflict(latest, input)
  if (conflict !== null) {
    return conflict
  }

  const now = new Date()
  const nextToken = randomUUID()
  const projectionColumns =
    input.projections != null
      ? {
          bodyHtml: input.projections.bodyHtml,
          bodyText: input.projections.bodyText,
          bodyHtmlFeed: input.projections.bodyHtmlFeed,
        }
      : {}

  if (latest?.status === 'draft') {
    const updated = tx
      .update(contentTable)
      .set({
        updatedAt: now,
        status,
        body: input.body as ContentRow['body'],
        imageSources: input.imageSources as ContentRow['imageSources'],
        headings: input.headings as ContentRow['headings'],
        ...projectionColumns,
        authorId: input.authorId ?? latest.authorId,
        clientRevisionToken: nextToken,
      })
      .where(eq(contentTable.id, latest.id))
      .returning()
      .all()
    return { status: 'saved', row: updated[0]! }
  }

  const inserted = tx
    .insert(contentTable)
    .values({
      type,
      ownerId: input.ownerId,
      revisionNo: (latest?.revisionNo ?? 0) + 1,
      status,
      body: input.body as ContentRow['body'],
      imageSources: input.imageSources as ContentRow['imageSources'],
      headings: input.headings as ContentRow['headings'],
      ...projectionColumns,
      authorId: input.authorId,
      clientRevisionToken: nextToken,
    })
    .returning()
    .all()
  return { status: 'saved', row: inserted[0]! }
}

export function saveDraftRevision(db: Database, type: ContentType, input: SaveRevisionInput): SaveRevisionResult {
  const metaTable = type === 'page' ? pageMetaTable : postMetaTable
  return sqliteOf(db).transaction((tx) => {
    const { latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    const conflict = checkTokenConflict(latest, input)
    if (conflict !== null) {
      return conflict
    }

    if (isEquivalentToPublishedLatest(latest, input)) {
      return { status: 'saved' as const, row: latest }
    }

    const written = writeRevisionRow(tx, type, latest, input, 'draft')
    if (written.status === 'conflict') {
      return written
    }
    tx.update(metaTable).set({ updatedAt: new Date() }).where(eq(metaTable.id, input.ownerId)).run()
    return { status: 'saved' as const, row: written.row }
  })
}

export function publishLatestRevision(
  db: Database,
  type: ContentType,
  input: PublishRevisionInput,
): PublishRevisionResult {
  const metaTable = type === 'page' ? pageMetaTable : postMetaTable
  return sqliteOf(db).transaction((tx) => {
    const { meta, latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    const written = writeRevisionRow(tx, type, latest, input, 'published')
    if (written.status === 'conflict') {
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
