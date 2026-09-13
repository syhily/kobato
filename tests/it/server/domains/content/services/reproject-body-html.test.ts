import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { reprojectBodyHtmlBatch } from '@/server/domains/content/services/reproject-body-html'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// Real in-memory DB + real jsdom projections: drift repair, write scope
// (projection columns only — never updatedAt / clientRevisionToken),
// legacy-row failure, batch pagination.

const db = getTestDb()

const BODY = lexicalBodyWith([lexicalParagraph('你好，世界')])

const LEGACY_PT_BODY = [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: '旧格式' }] }]

async function seedRevision(overrides: Partial<typeof contentTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: 1, revisionNo: 1, status: 'published', body: BODY, ...overrides })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

function contentRow(id: number) {
  return db.select().from(contentTable).where(eq(contentTable.id, id)).all()[0]!
}

beforeEach(async () => {
  await clearAllTables(db)
})

describe('content/services/reproject-body-html', () => {
  it('rewrites drifted projection columns and leaves current rows untouched', async () => {
    const staleId = await seedRevision({ bodyHtml: '<p>stale</p>' })
    const projections = await computeBodyProjections(lexicalEditorStateSchema.parse(BODY))
    const currentId = await seedRevision({
      ownerId: 2,
      bodyHtml: projections.bodyHtml,
      bodyText: projections.bodyText,
      bodyHtmlFeed: projections.bodyHtmlFeed,
    })
    const before = contentRow(currentId)

    const result = await reprojectBodyHtmlBatch(db)

    expect(result).toEqual({ processed: 2, failed: 0, rewritten: 1, total: 2, nextOffset: null })
    const stale = contentRow(staleId)
    expect(stale.bodyHtml).toBe(projections.bodyHtml)
    expect(stale.bodyText).toBe(projections.bodyText)
    expect(stale.bodyHtmlFeed).toBe(projections.bodyHtmlFeed)
    // The no-drift row is not written at all — edit columns survive.
    const current = contentRow(currentId)
    expect(current.updatedAt.getTime()).toBe(before.updatedAt.getTime())
    expect(current.clientRevisionToken).toBe(before.clientRevisionToken)
  })

  it('counts legacy PortableText rows as failed and leaves them untouched', async () => {
    const id = await seedRevision({ body: LEGACY_PT_BODY })

    const result = await reprojectBodyHtmlBatch(db)

    expect(result).toEqual({ processed: 0, failed: 1, rewritten: 0, total: 1, nextOffset: null })
    expect(contentRow(id).body).toEqual(LEGACY_PT_BODY)
    expect(contentRow(id).bodyHtml).toBeNull()
  })

  it('paginates by offset until the corpus is exhausted; a re-run rewrites nothing', async () => {
    await seedRevision({ ownerId: 1 })
    await seedRevision({ ownerId: 2 })
    await seedRevision({ ownerId: 3 })

    const first = await reprojectBodyHtmlBatch(db, { batchSize: 2 })
    expect(first).toEqual({ processed: 2, failed: 0, rewritten: 2, total: 3, nextOffset: 2 })

    const second = await reprojectBodyHtmlBatch(db, { offset: first.nextOffset!, batchSize: 2 })
    expect(second).toEqual({ processed: 1, failed: 0, rewritten: 1, total: 3, nextOffset: null })

    const again = await reprojectBodyHtmlBatch(db)
    expect(again).toEqual({ processed: 3, failed: 0, rewritten: 0, total: 3, nextOffset: null })
  })
})
