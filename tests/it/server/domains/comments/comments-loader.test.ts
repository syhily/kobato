import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, regularSession } from '#/_helpers/session'
import { latestComments, loadComments, pendingComments } from '@/server/domains/comments/services/public-query'
import { findMetricByTarget } from '@/server/infra/db/operations/metric'
import { comment } from '@/server/infra/db/schema/comment'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// Everything runs against the real in-memory engine; only the settings
// snapshot (sidebar recentComments = 5) comes from the it-project setup.

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

async function seedPost(slug: string, title?: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title: title ?? `Post ${slug}`,
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

describe('services/comments/loader — loadComments', () => {
  it('non-admins only see approved comments', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('hello')
    await seedComment({ userId: uid, ownerId: pid, content: 'approved', isPending: false })
    await seedComment({ userId: uid, ownerId: pid, content: 'pending', isPending: true })

    // The regular session user (id 2) is not the author: the own-pending visibility escape does not apply.
    const result = await loadComments(db, regularSession(), { type: 'post', ownerId: pid }, 0)

    expect(result?.count).toBe(1)
    expect(result?.roots_count).toBe(1)
    expect(result?.comments).toHaveLength(1)
    expect(result?.comments[0]?.content).toBe('approved')
    expect(result?.comments[0]?.isPending).toBe(false)
  })

  it('admins additionally see pending comments', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('hello')
    await seedComment({ userId: uid, ownerId: pid, content: 'approved', isPending: false })
    await seedComment({ userId: uid, ownerId: pid, content: 'pending', isPending: true })

    const result = await loadComments(db, adminSession(), { type: 'post', ownerId: pid }, 0)

    expect(result?.count).toBe(2)
    expect(result?.roots_count).toBe(2)
    expect(result?.comments).toHaveLength(2)
    expect(result?.comments.map((c) => c.content).sort()).toEqual(['approved', 'pending'])
  })

  it('returns the union of root + child comments and the aggregated counts', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('hello')
    const root1 = await seedComment({ userId: uid, ownerId: pid, content: 'root-1', rootId: 0 })
    const root2 = await seedComment({ userId: uid, ownerId: pid, content: 'root-2', rootId: 0 })
    const child1 = await seedComment({ userId: uid, ownerId: pid, content: 'child-1', rid: root1, rootId: root1 })
    const child2 = await seedComment({ userId: uid, ownerId: pid, content: 'child-2', rid: root1, rootId: root1 })
    const child3 = await seedComment({ userId: uid, ownerId: pid, content: 'child-3', rid: root2, rootId: root2 })

    const result = await loadComments(db, regularSession(), { type: 'post', ownerId: pid }, 0)

    expect(result?.count).toBe(5)
    expect(result?.roots_count).toBe(2)
    expect(result?.comments.map((c) => c.id).sort((a, b) => a - b)).toEqual([root1, root2, child1, child2, child3])
  })

  it('upserts the metric even when the page has zero comments', async () => {
    const pid = await seedPost('fresh')
    const target = { type: 'post' as const, ownerId: pid }

    const result = await loadComments(db, regularSession(), target, 0)

    expect(result?.count).toBe(0)
    expect(result?.roots_count).toBe(0)
    expect(result?.comments).toEqual([])
    const metricRow = await findMetricByTarget(db, target)
    expect(metricRow).not.toBeNull()
    expect(metricRow?.publicId).toBeTruthy()
  })

  it('separates comment threads per target page', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pidA = await seedPost('page-a')
    const pidB = await seedPost('page-b')
    await seedComment({ userId: uid, ownerId: pidA, content: 'on-a' })
    await seedComment({ userId: uid, ownerId: pidB, content: 'on-b' })

    const result = await loadComments(db, regularSession(), { type: 'post', ownerId: pidA }, 0)

    expect(result?.count).toBe(1)
    expect(result?.comments[0]?.content).toBe('on-a')
  })
})

describe('services/comments/loader — latestComments / pendingComments', () => {
  it('latestComments resolves authors and skips admins from the pool', async () => {
    const alice = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const bob = await seedUser({ name: 'Bob', email: 'bob@example.com' })
    const admin = await seedUser({ name: 'Admin', email: 'admin@example.com', role: 'admin' })
    const pidA = await seedPost('a', 'A')
    const pidB = await seedPost('b', 'B')
    const aliceComment = await seedComment({ userId: alice, ownerId: pidA })
    const bobComment = await seedComment({ userId: bob, ownerId: pidB })
    await seedComment({ userId: admin, ownerId: pidA })

    const list = await latestComments(db)

    expect(list).toHaveLength(2)
    expect(list.some((c) => c.author === 'Admin')).toBe(false)
    const fromAlice = list.find((c) => c.author === 'Alice')
    const fromBob = list.find((c) => c.author === 'Bob')
    expect(fromAlice?.permalink).toBe(`/posts/a/#user-comment-${aliceComment}`)
    expect(fromAlice?.title).toBe('A')
    expect(fromBob?.permalink).toBe(`/posts/b/#user-comment-${bobComment}`)
    expect(fromBob?.title).toBe('B')
  })

  it('latestComments caps the pool at the configured sidebar count', async () => {
    // The seeded settings bundle configures recentComments count = 5.
    const pid = await seedPost('c', 'C')
    for (let i = 0; i < 7; i++) {
      const uid = await seedUser({ name: `U${i}`, email: `u${i}@example.com` })
      await seedComment({ userId: uid, ownerId: pid })
    }

    const list = await latestComments(db)

    expect(list).toHaveLength(5)
  })

  it('pendingComments caps the digest at the configured sidebar count', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('d', 'D')
    for (let i = 0; i < 6; i++) {
      await seedComment({ userId: uid, ownerId: pid, isPending: true, content: `pending-${i}` })
    }

    const rows = await pendingComments(db)

    expect(rows).toHaveLength(5)
    // Digest rows carry the entity title and the comment permalink.
    expect(rows[0]?.title).toBe('D')
    expect(rows[0]?.author).toBe('Alice')
    expect(rows[0]?.permalink).toMatch(/^\/posts\/d\/#user-comment-\d+$/)
  })
})
