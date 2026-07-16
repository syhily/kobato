import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { saveDraftRevision, publishLatestRevision } from '@/server/domains/content/repos/mutate'
import {
  findContentById,
  findContentsByIds,
  findLatestRevision,
  findLatestDraft,
  listRevisions,
} from '@/server/domains/content/repos/query'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

const body = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }] },
]

async function seedPostMeta(slug = 'p1', title = 'P1') {
  const [m] = await db.insert(postMetaTable).values({ slug, title }).returning()
  return m
}

async function seedPageMeta(slug = 'pg1', title = 'PG1') {
  const [m] = await db.insert(pageMetaTable).values({ slug, title }).returning()
  return m
}

describe('content/repos/mutate — saveDraftRevision', () => {
  it('throws NOT_FOUND when the meta row does not exist', async () => {
    await expect(
      saveDraftRevision(db, 'post', {
        ownerId: 999n,
        body,
        imageSources: [],
        headings: [],
        authorId: null,
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('inserts a new draft when none exists', async () => {
    const meta = await seedPostMeta()
    const result = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: ['/img.png'],
      headings: [],
      authorId: null,
    })
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.row.status).toBe('draft')
      expect(result.row.revisionNo).toBe(1)
    }
  })

  it('updates the existing draft in place on a second save', async () => {
    const meta = await seedPostMeta('p2', 'P2')
    await saveDraftRevision(db, 'post', { ownerId: meta.id, body, imageSources: [], headings: [], authorId: null })
    const second = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: ['/new.png'],
      headings: [],
      authorId: null,
    })
    expect(second.status).toBe('saved')
    if (second.status === 'saved') {
      const rows = await db.select().from(contentTable)
      expect(rows).toHaveLength(1)
      expect(second.row.imageSources).toEqual(['/new.png'])
    }
  })

  it('returns conflict when expectedClientRevisionToken does not match', async () => {
    const meta = await seedPostMeta('p3', 'P3')
    const first = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    if (first.status !== 'saved') throw new Error('expected saved')
    const second = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
      expectedClientRevisionToken: '00000000-0000-0000-0000-000000000000',
    })
    expect(second.status).toBe('conflict')
  })

  it('force overrides the conflict check', async () => {
    const meta = await seedPostMeta('p4', 'P4')
    await saveDraftRevision(db, 'post', { ownerId: meta.id, body, imageSources: [], headings: [], authorId: null })
    const result = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
      expectedClientRevisionToken: '00000000-0000-0000-0000-000000000000',
      force: true,
    })
    expect(result.status).toBe('saved')
  })

  it('no-ops when the new draft is equivalent to the just-published body', async () => {
    const meta = await seedPostMeta('p5', 'P5')
    await publishLatestRevision(db, 'post', { ownerId: meta.id, body, imageSources: [], headings: [], authorId: null })
    const result = await saveDraftRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      // Should reuse the published row, not insert a new draft.
      expect(result.row.status).toBe('published')
    }
  })

  it('works with page meta as well', async () => {
    const meta = await seedPageMeta()
    const result = await saveDraftRevision(db, 'page', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    expect(result.status).toBe('saved')
  })
})

describe('content/repos/mutate — publishLatestRevision', () => {
  it('publishes a fresh revision when no prior exists', async () => {
    const meta = await seedPostMeta('pub1', 'Pub1')
    const result = await publishLatestRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.row.status).toBe('published')
      expect(result.row.revisionNo).toBe(1)
    }
    const updated = await db.select().from(postMetaTable).where(eq(postMetaTable.id, meta.id))
    expect(updated[0]!.published).toBe(true)
  })

  it('promotes an existing draft to published in place', async () => {
    const meta = await seedPostMeta('pub2', 'Pub2')
    await saveDraftRevision(db, 'post', { ownerId: meta.id, body, imageSources: [], headings: [], authorId: null })
    const result = await publishLatestRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.row.revisionNo).toBe(1)
      expect(result.row.status).toBe('published')
    }
  })

  it('returns conflict on stale token', async () => {
    const meta = await seedPostMeta('pub3', 'Pub3')
    const first = await publishLatestRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
    })
    if (first.status !== 'published') throw new Error('expected published')
    const second = await publishLatestRevision(db, 'post', {
      ownerId: meta.id,
      body,
      imageSources: [],
      headings: [],
      authorId: null,
      expectedClientRevisionToken: '00000000-0000-0000-0000-000000000000',
    })
    expect(second.status).toBe('conflict')
  })
})

describe('content/repos/query — basic lookups', () => {
  it('findContentById returns null for an unknown id', async () => {
    expect(await findContentById(db, 9999n)).toBeNull()
  })

  it('findContentsByIds returns an empty list for empty input', async () => {
    expect(await findContentsByIds(db, [])).toEqual([])
  })

  it('findContentsByIds returns matching rows', async () => {
    const [a] = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: 1n, revisionNo: 1, status: 'draft', body: [], imageSources: [], headings: [] })
      .returning()
    const [b] = await db
      .insert(contentTable)
      .values({
        type: 'post',
        ownerId: 1n,
        revisionNo: 2,
        status: 'published',
        body: [],
        imageSources: [],
        headings: [],
      })
      .returning()
    const rows = await findContentsByIds(db, [a.id, b.id])
    expect(rows).toHaveLength(2)
  })

  it('findLatestRevision returns the highest revisionNo', async () => {
    await db.insert(contentTable).values([
      { type: 'post', ownerId: 5n, revisionNo: 1, status: 'draft', body: [], imageSources: [], headings: [] },
      { type: 'post', ownerId: 5n, revisionNo: 3, status: 'published', body: [], imageSources: [], headings: [] },
      { type: 'post', ownerId: 5n, revisionNo: 2, status: 'draft', body: [], imageSources: [], headings: [] },
    ])
    const latest = await findLatestRevision(db, 'post', 5n)
    expect(latest).not.toBeNull()
    expect(latest!.revisionNo).toBe(3)
  })

  it('findLatestDraft returns the latest draft only', async () => {
    await db.insert(contentTable).values([
      { type: 'page', ownerId: 7n, revisionNo: 1, status: 'published', body: [], imageSources: [], headings: [] },
      { type: 'page', ownerId: 7n, revisionNo: 2, status: 'draft', body: [], imageSources: [], headings: [] },
    ])
    const draft = await findLatestDraft(db, 'page', 7n)
    expect(draft).not.toBeNull()
    expect(draft!.status).toBe('draft')
    expect(draft!.revisionNo).toBe(2)
  })

  it('listRevisions returns revisions in descending order with limit', async () => {
    await db.insert(contentTable).values([
      { type: 'post', ownerId: 9n, revisionNo: 1, status: 'published', body: [], imageSources: [], headings: [] },
      { type: 'post', ownerId: 9n, revisionNo: 2, status: 'published', body: [], imageSources: [], headings: [] },
      { type: 'post', ownerId: 9n, revisionNo: 3, status: 'draft', body: [], imageSources: [], headings: [] },
    ])
    const list = await listRevisions(db, 'post', 9n, 2)
    expect(list).toHaveLength(2)
    expect(list[0]!.revisionNo).toBe(3)
    expect(list[1]!.revisionNo).toBe(2)
  })
})
