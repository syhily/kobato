import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    getColumns: vi.fn(() => ({})),
  }
})

vi.mock('@/server/infra/db/ilike-escape', () => ({
  ilikeEscape: vi.fn((column, value) => ({ column, value })),
}))

vi.mock('@/server/infra/db/schema/page', () => ({
  page: {
    id: { name: 'id' },
    slug: { name: 'slug' },
    title: { name: 'title' },
    summary: { name: 'summary' },
    cover: { name: 'cover' },
    coverThumbhash: { name: 'cover_thumbhash' },
    coverWidth: { name: 'cover_width' },
    coverHeight: { name: 'cover_height' },
    og: { name: 'og' },
    published: { name: 'published' },
    publishedAt: { name: 'published_at' },
    firstPublishedAt: { name: 'first_published_at' },
    publishedRevisionId: { name: 'published_revision_id' },
    authorId: { name: 'author_id' },
    deletedAt: { name: 'deleted_at' },
    createdAt: { name: 'created_at' },
    updatedAt: { name: 'updated_at' },
    showToc: { name: 'show_toc' },
    showUpdated: { name: 'show_updated' },
    showFriends: { name: 'show_friends' },
    comments: { name: 'comments' },
    commentsEnabled: { name: 'comments_enabled' },
    toc: { name: 'toc' },
    headings: { name: 'headings' },
    permalink: { name: 'permalink' },
    imageSources: { name: 'image_sources' },
    body: { name: 'body' },
    date: { name: 'date' },
  },
}))

vi.mock('@/server/infra/db/schema/user', () => ({
  user: { id: { name: 'id' }, name: { name: 'name' } },
}))

class FakeQuery {
  rows: unknown[] = []
  inserted: Record<string, unknown> | null = null
  updated: Record<string, unknown> | null = null

  select(columns?: unknown) {
    return this
  }
  from() {
    return this
  }
  where() {
    return this
  }
  orderBy() {
    return this
  }
  limit() {
    return this
  }
  offset() {
    return this
  }
  leftJoin() {
    return this
  }
  for() {
    return this
  }
  insert() {
    return this
  }
  values(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.inserted = Array.isArray(values) ? values[0] : values
    return this
  }
  update() {
    return this
  }
  set(patch: Record<string, unknown>) {
    this.updated = patch
    return this
  }
  returning() {
    return this
  }
  then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
    if (this.inserted) {
      return Promise.resolve([{ id: 1n, createdAt: new Date(), ...this.inserted }]).then(resolve, reject)
    }
    if (this.updated) {
      return Promise.resolve([{ id: 1n, ...this.updated }]).then(resolve, reject)
    }
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(rows: unknown[] = []): NodePgDatabase {
  const query = new FakeQuery()
  query.rows = rows
  return {
    select: () => query.select(),
    insert: () => query.insert(),
    update: () => query.update(),
    transaction: async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(fakeDb(rows) as NodePgDatabase),
  } as unknown as NodePgDatabase
}

import {
  countPageMetas,
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  listPageMetas,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'

describe('pages repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists, counts, and filters page metas', async () => {
    const db = fakeDb([{ id: 1n, title: 'Page', authorName: 'Admin' }])
    const rows = await listPageMetas(db, {
      q: 'page',
      deletedStatus: 'normal',
      published: true,
      authorId: 1n,
      limit: 10,
      offset: 0,
    })
    expect(rows).toHaveLength(1)
    const count = await countPageMetas(db, { deletedStatus: 'deleted' })
    expect(count).toBe(0)
  })

  it('finds a page meta by id, slug, and for update', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello' }])
    expect(await findPageMetaById(db, 1n)).toBeTruthy()
    expect(await findPageMetaBySlug(db, 'hello')).toBeTruthy()
    expect(await findPageMetaBySlugForUpdate(db, 'hello')).toBeTruthy()
  })

  it('inserts and updates page meta', async () => {
    const db = fakeDb()
    const inserted = await insertPageMeta(db, { slug: 'new', title: 'New' } as never)
    expect(inserted.id).toBe(1n)
    const updated = await updatePageMetaById(db, 1n, { title: 'Updated' })
    expect(updated).toBeTruthy()
  })

  it('soft-deletes and restores page meta', async () => {
    const db = fakeDb([{ id: 1n, deletedAt: null }])
    expect(await softDeletePageMeta(db, 1n)).toBe(true)
    expect(await restorePageMeta(db, 1n)).toBe(true)
  })
})
