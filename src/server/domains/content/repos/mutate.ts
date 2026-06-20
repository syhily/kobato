import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type {
  ContentType,
  PublishLatestInput,
  PublishLatestResult,
  SaveDraftInput,
  SaveDraftResult,
} from '@/server/domains/content/schema'
import type { ContentRow, NewContent } from '@/server/infra/db/types'
import type { InklingDocument } from '@/shared/inkling/schema'

import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
import { areInklingDocumentsEquivalent } from '@/shared/inkling/normalize'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

function metaTableFor(type: ContentType) {
  return type === 'page' ? pageMetaTable : postMetaTable
}

export async function saveDraftRevision(
  db: NodePgDatabase,
  type: ContentType,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const metaTable = metaTableFor(type)
  return db.transaction(async (tx) => {
    const lockRows = await tx
      .select({ id: metaTable.id, firstPublishedAt: metaTable.firstPublishedAt })
      .from(metaTable)
      .where(eq(metaTable.id, input.ownerId))
      .for('update')
    if (lockRows.length === 0) {
      throw new DomainError('NOT_FOUND', `${type} meta row ${input.ownerId} not found`)
    }

    const latestRows = await tx
      .select()
      .from(contentTable)
      .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, input.ownerId)))
      .orderBy(desc(contentTable.revisionNo))
      .limit(1)
    const latest = latestRows[0]

    const nextToken = randomUUID()
    const now = new Date()
    const bodyJson = input.body
    const imageSourcesJson = input.imageSources
    const headingsJson = input.headings

    if (latest !== undefined && latest.status === 'draft') {
      if (
        !input.force &&
        input.expectedClientRevisionToken !== undefined &&
        input.expectedClientRevisionToken !== latest.clientRevisionToken
      ) {
        return { status: 'conflict' as const, latest, expectedToken: latest.clientRevisionToken }
      }
      const updated = await tx
        .update(contentTable)
        .set({
          updatedAt: now,
          body: unsafeCast<ContentRow['body']>(bodyJson),
          imageSources: imageSourcesJson,
          headings: headingsJson as ContentRow['headings'],
          authorId: input.authorId ?? latest.authorId,
          clientRevisionToken: nextToken,
        })
        .where(eq(contentTable.id, latest.id))
        .returning()
      await tx.update(metaTable).set({ updatedAt: now }).where(eq(metaTable.id, input.ownerId))
      return { status: 'saved' as const, row: updated[0] }
    }

    if (
      !input.force &&
      input.expectedClientRevisionToken !== undefined &&
      latest !== undefined &&
      input.expectedClientRevisionToken !== latest.clientRevisionToken
    ) {
      return { status: 'conflict' as const, latest, expectedToken: latest.clientRevisionToken }
    }

    if (
      latest !== undefined &&
      latest.status === 'published' &&
      areInklingDocumentsEquivalent(unsafeCast<InklingDocument>(input.body), latest.body) &&
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
      body: unsafeCast<NewContent['body']>(bodyJson),
      imageSources: imageSourcesJson,
      headings: headingsJson as NewContent['headings'],
      authorId: input.authorId,
      clientRevisionToken: nextToken,
    }
    const inserted = await tx.insert(contentTable).values(insert).returning()
    await tx.update(metaTable).set({ updatedAt: now }).where(eq(metaTable.id, input.ownerId))
    return { status: 'saved' as const, row: inserted[0] }
  })
}

export async function publishLatestRevision(
  db: NodePgDatabase,
  type: ContentType,
  input: PublishLatestInput,
): Promise<PublishLatestResult> {
  const metaTable = metaTableFor(type)
  return db.transaction(async (tx) => {
    const lockRows = await tx
      .select({ id: metaTable.id, firstPublishedAt: metaTable.firstPublishedAt })
      .from(metaTable)
      .where(eq(metaTable.id, input.ownerId))
      .for('update')
    if (lockRows.length === 0) {
      throw new DomainError('NOT_FOUND', `${type} meta row ${input.ownerId} not found`)
    }

    const latestRows = await tx
      .select()
      .from(contentTable)
      .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, input.ownerId)))
      .orderBy(desc(contentTable.revisionNo))
      .limit(1)
    const latest = latestRows[0]

    const nextToken = randomUUID()
    const now = new Date()

    let savedRow: ContentRow

    if (latest !== undefined && latest.status === 'draft') {
      if (
        !input.force &&
        input.expectedClientRevisionToken !== undefined &&
        input.expectedClientRevisionToken !== latest.clientRevisionToken
      ) {
        return { status: 'conflict' as const, latest, expectedToken: latest.clientRevisionToken }
      }
      const updated = await tx
        .update(contentTable)
        .set({
          updatedAt: now,
          body: unsafeCast<ContentRow['body']>(input.body),
          imageSources: input.imageSources,
          headings: input.headings as ContentRow['headings'],
          authorId: input.authorId ?? latest.authorId,
          clientRevisionToken: nextToken,
          status: 'published',
        })
        .where(eq(contentTable.id, latest.id))
        .returning()
      savedRow = updated[0]
    } else {
      if (
        !input.force &&
        input.expectedClientRevisionToken !== undefined &&
        latest !== undefined &&
        input.expectedClientRevisionToken !== latest.clientRevisionToken
      ) {
        return { status: 'conflict' as const, latest, expectedToken: latest.clientRevisionToken }
      }
      const nextRevisionNo = (latest?.revisionNo ?? 0) + 1
      const insert: NewContent = {
        type,
        ownerId: input.ownerId,
        revisionNo: nextRevisionNo,
        status: 'published',
        body: unsafeCast<NewContent['body']>(input.body),
        imageSources: input.imageSources,
        headings: input.headings as NewContent['headings'],
        authorId: input.authorId,
        clientRevisionToken: nextToken,
      }
      const inserted = await tx.insert(contentTable).values(insert).returning()
      savedRow = inserted[0]
    }

    await tx
      .update(metaTable)
      .set({
        publishedRevisionId: savedRow.id,
        published: true,
        publishedAt: input.publishedAt ?? now,
        firstPublishedAt: lockRows[0]?.firstPublishedAt ?? input.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(metaTable.id, input.ownerId))

    return { status: 'published' as const, row: savedRow }
  })
}
