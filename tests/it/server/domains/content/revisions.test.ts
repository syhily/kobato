import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'

const query = await import('@/server/domains/content/revisions')

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
})

/** Seed a content row and return it. */
async function seedContent(overrides: {
  type: 'post' | 'page'
  ownerId: number
  revisionNo: number
  status?: 'draft' | 'published'
  body?: unknown
  imageSources?: string[]
  headings?: unknown
}) {
  const [row] = await db
    .insert(contentTable)
    .values({
      type: overrides.type,
      ownerId: overrides.ownerId,
      revisionNo: overrides.revisionNo,
      status: overrides.status ?? 'draft',
      body: overrides.body ?? [],
      imageSources: overrides.imageSources ?? [],
      headings: overrides.headings ?? [],
    })
    .returning()
  return row
}

describe('content/repos/query — findContentById', () => {
  it('returns the row when id exists', async () => {
    const seeded = await seedContent({ type: 'post', ownerId: 1, revisionNo: 1 })

    const result = await query.findContentById(db, seeded.id)

    expect(result).not.toBeNull()
    expect(result!.id).toBe(seeded.id)
    expect(result!.type).toBe('post')
    expect(result!.ownerId).toBe(1)
    expect(result!.revisionNo).toBe(1)
  })

  it('returns null when id does not exist', async () => {
    const result = await query.findContentById(db, 999999)
    expect(result).toBeNull()
  })
})

describe('content/repos/query — findContentsByIds', () => {
  it('returns matching rows', async () => {
    const a = await seedContent({ type: 'post', ownerId: 1, revisionNo: 1 })
    const b = await seedContent({ type: 'post', ownerId: 2, revisionNo: 1 })
    await seedContent({ type: 'page', ownerId: 3, revisionNo: 1 })

    const rows = await query.findContentsByIds(db, [a.id, b.id])

    expect(rows).toHaveLength(2)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
  })

  it('returns empty array for empty ids input', async () => {
    const rows = await query.findContentsByIds(db, [])
    expect(rows).toEqual([])
  })
})

describe('content/repos/query — findLatestRevision', () => {
  it('returns the row with the highest revision number', async () => {
    const ownerId = 10
    await seedContent({ type: 'post', ownerId, revisionNo: 1, status: 'published' })
    await seedContent({ type: 'post', ownerId, revisionNo: 2, status: 'draft' })
    await seedContent({ type: 'post', ownerId, revisionNo: 3, status: 'published' })

    const result = await query.findLatestRevision(db, 'post', ownerId)

    expect(result).not.toBeNull()
    expect(result!.revisionNo).toBe(3)
  })

  it('returns null when no content rows exist for the owner', async () => {
    const result = await query.findLatestRevision(db, 'post', 999)
    expect(result).toBeNull()
  })

  it('scopes results to the given content type', async () => {
    const ownerId = 20
    await seedContent({ type: 'post', ownerId, revisionNo: 1 })
    await seedContent({ type: 'post', ownerId, revisionNo: 5 })
    await seedContent({ type: 'page', ownerId, revisionNo: 10 })

    const postResult = await query.findLatestRevision(db, 'post', ownerId)
    expect(postResult!.revisionNo).toBe(5)

    const pageResult = await query.findLatestRevision(db, 'page', ownerId)
    expect(pageResult!.revisionNo).toBe(10)
  })
})

describe('content/repos/query — findLatestDraft', () => {
  it('returns the latest draft revision', async () => {
    const ownerId = 30
    await seedContent({ type: 'post', ownerId, revisionNo: 1, status: 'published' })
    await seedContent({ type: 'post', ownerId, revisionNo: 2, status: 'draft' })
    await seedContent({ type: 'post', ownerId, revisionNo: 3, status: 'published' })
    await seedContent({ type: 'post', ownerId, revisionNo: 4, status: 'draft' })

    const result = await query.findLatestDraft(db, 'post', ownerId)

    expect(result).not.toBeNull()
    expect(result!.status).toBe('draft')
    expect(result!.revisionNo).toBe(4)
  })

  it('returns null when no draft exists', async () => {
    const ownerId = 31
    await seedContent({ type: 'post', ownerId, revisionNo: 1, status: 'published' })

    const result = await query.findLatestDraft(db, 'post', ownerId)
    expect(result).toBeNull()
  })

  it('returns null when no content rows exist', async () => {
    const result = await query.findLatestDraft(db, 'post', 999)
    expect(result).toBeNull()
  })
})
