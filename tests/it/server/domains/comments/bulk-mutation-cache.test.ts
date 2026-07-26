import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// The comments service module pulls the email sender in transitively.
// The bulk comment paths never send mail, but stub the boundary so the
// module graph can never reach the network.
vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
}))

const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

// Import the comments-domain service entry points AFTER the mocks are
// registered. The invariant under test: these bulk mutations reach the
// comments domain's repo mutations, which clear the sidebar
// latest-comments cache inline — forgetting the invalidation is
// impossible.
const { bulkApproveCommentsByUser, bulkDeleteCommentsByUser } =
  await import('@/server/domains/comments/services/moderate')
// The admin approve-delete-request path calls the repo mutation
// directly; the cache invalidation is sunk into the mutation itself.
const { softDeleteCommentById } = await import('@/server/domains/comments/repos/moderation')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

// The sidebar list caches under the `comments` declaration's lone key.
async function latestCommentsRow() {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, 'comments:latest')).limit(1)
  return rows[0] ?? null
}

async function seedUser(overrides: Partial<typeof user.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({
      name: 'Commenter',
      email: `u${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      role: 'visitor',
      ...overrides,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(slug: string): Promise<bigint> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title: `Post ${slug}`,
      summary: '',
      published: true,
      publishedRevisionId: 1n,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedComment(userId: bigint, ownerId: bigint, isPending: boolean): Promise<bigint> {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId,
      userId,
      content: 'hello',
      body: [],
      rid: 0,
      rootId: 0n,
      isPending,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

describe('comments/repos/moderation — bulk mutations clear the sidebar cache', () => {
  it('bulk approve-by-user invalidates the warmed latest-comments cache', async () => {
    const userId = await seedUser()
    const postId = await seedPost('bulk-approve-target')
    const commentId = await seedComment(userId, postId, true)

    // Warm the sidebar cache. The pending comment is not listed yet.
    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(0)
    expect(await latestCommentsRow()).not.toBeNull()

    const { approved } = await bulkApproveCommentsByUser(db, userId)
    expect(approved).toBe(1)

    // The cache must be cleared, so the next read sees the approved row.
    expect(await latestCommentsRow()).toBeNull()
    const fresh = await latestComments(db)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.permalink).toBe(`/posts/bulk-approve-target/#user-comment-${commentId}`)
  })

  it('bulk soft-delete-by-user invalidates the warmed latest-comments cache', async () => {
    const userId = await seedUser()
    const postId = await seedPost('bulk-delete-target')
    await seedComment(userId, postId, false)

    // Warm the sidebar cache with the approved comment listed.
    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(1)
    expect(await latestCommentsRow()).not.toBeNull()

    const { deleted } = await bulkDeleteCommentsByUser(db, userId)
    expect(deleted).toBe(1)

    // The cache must be cleared, so the next read no longer sees the row.
    expect(await latestCommentsRow()).toBeNull()
    const fresh = await latestComments(db)
    expect(fresh).toHaveLength(0)
  })
})

describe('comments/repos/moderation — approve-delete-request clears the sidebar cache', () => {
  it('softDeleteCommentById invalidates the warmed latest-comments cache', async () => {
    const userId = await seedUser()
    const postId = await seedPost('approve-delete-target')
    const commentId = await seedComment(userId, postId, false)

    // Warm the sidebar cache with the approved comment listed.
    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(1)
    expect(await latestCommentsRow()).not.toBeNull()

    // Admin approves the user's delete request → soft delete.
    await softDeleteCommentById(db, commentId)

    // The cache must be cleared, so the re-read no longer sees the row.
    expect(await latestCommentsRow()).toBeNull()
    const fresh = await latestComments(db)
    expect(fresh).toHaveLength(0)
  })
})
