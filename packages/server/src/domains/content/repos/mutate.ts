import type {
  ContentType,
  PublishLatestInput,
  PublishLatestResult,
  SaveDraftInput,
  SaveDraftResult,
} from '@kobato/server/domains/content/schemas/revision'
import type { Database } from '@kobato/server/infra/db/database'
import type { ContentRow, NewContent } from '@kobato/server/infra/db/types'

import { canonicalizeLexicalBodyShape, areLexicalBodiesEquivalent } from '@kobato/editor/lexical-core/canonicalize'
import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageMetaTable } from '@kobato/server/infra/db/schema/page'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { DomainError } from '@kobato/server/infra/http/errors'
import { validatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { safeParseLexicalBody } from '@kobato/shared/lexical/schema'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

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

/**
 * The single revision-write primitive behind both public mutations: the
 * optimistic-concurrency check, then either an in-place rewrite of the
 * latest DRAFT row or an appended revision at `status`. The callers own
 * only what genuinely differs — the draft no-op equivalence short-circuit
 * and the meta-row update. Returns the conflict for the caller to return
 * verbatim, or the written row.
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

  if (latest !== undefined && latest.status === 'draft') {
    // This branch only runs on a draft row, so `status` is either an
    // identity write (save) or the draft→published flip (publish).
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

/**
 * Normalize a stored `content.body` value into the canonical Lexical form
 * for the no-op equivalence comparison. Pre-migration rows hold the PT
 * shape (`Array.isArray`); the one-way PT→Lexical mapping + canonicalize
 * converts them. Invalid values yield `null` (the short-circuit falls
 * through to a write, matching the old safeParse behavior).
 */
function toCanonicalBodyForComparison(value: unknown): ReturnType<typeof canonicalizeLexicalBodyShape> | null {
  if (Array.isArray(value)) {
    try {
      return canonicalizeLexicalBodyShape(convertPtBodyToLexical(validatePortableTextBody(value)))
    } catch {
      return null
    }
  }
  const parsed = safeParseLexicalBody(value)
  return parsed.ok ? parsed.body : null
}

export async function saveDraftRevision(
  db: Database,
  type: ContentType,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const metaTable = metaTableFor(type)
  return db.transaction((tx) => {
    const { latest } = lockMetaAndLoadLatest(tx, type, input.ownerId)

    // The conflict check precedes the no-op short-circuit: a stale token
    // must surface even when the bodies happen to match. (The primitive
    // re-runs the same check before writing — it owns the write path.)
    const conflict = checkTokenConflict(latest, input)
    if (conflict !== null) {
      return conflict
    }

    const inputBody = toCanonicalBodyForComparison(input.body)
    const latestBody = latest !== undefined ? toCanonicalBodyForComparison(latest.body) : null
    if (
      latest !== undefined &&
      latest.status === 'published' &&
      inputBody !== null &&
      latestBody !== null &&
      areLexicalBodiesEquivalent(inputBody, latestBody) &&
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
