import { beforeEach, describe, expect, it } from 'vitest'

import type { AdminCommentsResult } from '@/shared/types/comments'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { loadAllComments } from '@/server/domains/comments/services/admin-query'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// `loadAllComments` orchestrates the admin comments list: a `q`/`match`
// text filter, `createdAfter`/`createdBefore` date bounds, the status
// breakdown counts, and the publicId → target resolution. Every assertion
// below runs against the real in-memory engine — the filter-propagation
// contract is now pinned by real query results instead of mock call args:
// a filter dropped from `extraFilters` would show up as status counts that
// disagree with the returned list.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title: `Post ${slug}`,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      userId: opts.userId ?? 1,
      content: opts.content ?? 'hello',
      body: opts.body ?? [],
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

async function seedMetricRow(type: 'post' | 'page', ownerId: number, publicId: string): Promise<string> {
  await db.insert(metric).values({ type, ownerId, publicId })
  return publicId
}

describe('loadAllComments — text filter propagation', () => {
  it('narrows the list and the status counts to rows containing `q`', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p1')
    const foo1 = await seedComment({ userId: uid, ownerId: pid, content: 'foo one', isPending: false })
    const foo2 = await seedComment({ userId: uid, ownerId: pid, content: 'foo two', isPending: true })
    await seedComment({ userId: uid, ownerId: pid, content: 'bar three', isPending: false })

    const result = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      status: 'all',
      filterQ: 'foo',
      filterMatch: 'contains',
    })

    expect(result.comments.map((c) => c.id).sort((a, b) => a - b)).toEqual([foo1, foo2])
    // The single count query honors the same filter: the tabs reflect
    // the filtered corpus, not the whole table.
    expect(result.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('excludes rows containing `q` under `match: "does-not-contain"` — status counts respect the filter', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p2')
    await seedComment({ userId: uid, ownerId: pid, content: 'spam x', isPending: true })
    const clean = await seedComment({ userId: uid, ownerId: pid, content: 'clean y', isPending: true })

    const result = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      status: 'pending',
      filterQ: 'spam',
      filterMatch: 'does-not-contain',
    })

    expect(result.comments.map((c) => c.id)).toEqual([clean])
    expect(result.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, deleteRequested: 0 })
    expect(result.total).toBe(1)
  })

  it('treats a missing `match` as contains (the default ILIKE behavior)', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p3')
    const foo = await seedComment({ userId: uid, ownerId: pid, content: 'foo one', isPending: false })
    await seedComment({ userId: uid, ownerId: pid, content: 'bar two', isPending: false })

    const result = await loadAllComments(db, { offset: 0, limit: 20, status: 'all', filterQ: 'foo' })

    expect(result.comments.map((c) => c.id)).toEqual([foo])
    expect(result.total).toBe(1)
  })

  it('stacks the `match` filter on top of the status filter so the count breakdown stays consistent', async () => {
    // The bug this pins: forgetting to put `match` into `extraFilters`
    // would make the status counts inconsistent with the list — the
    // user would see "3 pending" in the tab but the list would only
    // show 1 row.
    const uid = await seedUser()
    const pid = await seedPost('p4')
    const fooPending = await seedComment({ userId: uid, ownerId: pid, content: 'foo pending', isPending: true })
    await seedComment({ userId: uid, ownerId: pid, content: 'foo approved', isPending: false })
    await seedComment({ userId: uid, ownerId: pid, content: 'other pending', isPending: true })

    const result: AdminCommentsResult = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      status: 'pending',
      filterQ: 'foo',
      filterMatch: 'contains',
    })

    expect(result.comments.map((c) => c.id)).toEqual([fooPending])
    expect(result.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
    expect(result.total).toBe(1)
  })
})

describe('loadAllComments — date filter propagation', () => {
  const after = new Date('2026-06-01T00:00:00.000Z')
  const before = new Date('2026-06-30T23:59:59.999Z')

  it('narrows the list and the status counts to the created-after/before window', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p5')
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'too early',
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
    })
    const inWindow = await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'in window',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    })
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'too late',
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
    })

    const result = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      status: 'all',
      filterCreatedAfter: after,
      filterCreatedBefore: before,
    })

    expect(result.comments.map((c) => c.id)).toEqual([inWindow])
    expect(result.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
    expect(result.total).toBe(1)
  })

  it('returns every row when no date bounds are provided (no date narrowing)', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p6')
    await seedComment({ userId: uid, ownerId: pid, createdAt: new Date('2026-05-15T00:00:00.000Z') })
    await seedComment({ userId: uid, ownerId: pid, createdAt: new Date('2026-06-15T00:00:00.000Z') })
    await seedComment({ userId: uid, ownerId: pid, createdAt: new Date('2026-07-15T00:00:00.000Z') })

    const result = await loadAllComments(db, { offset: 0, limit: 20 })

    expect(result.comments).toHaveLength(3)
    expect(result.total).toBe(3)
  })

  it('stacks the date bounds on top of the status filter so the count breakdown stays consistent', async () => {
    // The same shape-stability guarantee as the text filter: the status
    // counts must reflect the same `extraFilters` (date bounds
    // included) as the list — otherwise the tabs would mislead the
    // user about how many rows the active filter produces.
    const uid = await seedUser()
    const pid = await seedPost('p7')
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'pending in window',
      isPending: true,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    })
    const approvedInWindow = await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'approved in window',
      isPending: false,
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
    })
    await seedComment({
      userId: uid,
      ownerId: pid,
      content: 'approved outside window',
      isPending: false,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
    })

    const result: AdminCommentsResult = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      status: 'approved',
      filterCreatedAfter: after,
      filterCreatedBefore: before,
    })

    expect(result.comments.map((c) => c.id)).toEqual([approvedInWindow])
    expect(result.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
    expect(result.total).toBe(1)
  })
})

describe('loadAllComments — options object shape', () => {
  it('returns an empty result when publicId resolves to no metric — without scanning the comments', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p8')
    await seedComment({ userId: uid, ownerId: pid })

    const result = await loadAllComments(db, {
      offset: 0,
      limit: 20,
      filterPublicId: 'nonexistent',
    })

    // A comment exists in the table, so the empty result proves the
    // early return fired before any list/count query ran.
    expect(result.comments).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
    expect(result.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
  })

  it('narrows the list and counts to the resolved target when publicId resolves', async () => {
    const uid = await seedUser()
    const pidA = await seedPost('p9a')
    const pidB = await seedPost('p9b')
    const publicId = await seedMetricRow('post', pidA, 'pub-target')
    const onA = await seedComment({ userId: uid, ownerId: pidA, content: 'on a', isPending: true })
    await seedComment({ userId: uid, ownerId: pidB, content: 'on b' })

    const result = await loadAllComments(db, { offset: 0, limit: 20, filterPublicId: publicId })

    expect(result.comments.map((c) => c.id)).toEqual([onA])
    expect(result.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, deleteRequested: 0 })
    expect(result.total).toBe(1)
  })
})
