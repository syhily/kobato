import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { comment } from '@/server/infra/db/schema/comment'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// Stub the email boundary so the module graph never reaches the network.
vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

// Import AFTER the mocks register; cache invalidation lives inside the mutations.
const { bulkApproveCommentsByUser, bulkDeleteCommentsByUser } =
  await import('@/server/domains/comments/services/moderate')
const { softDeleteCommentById } = await import('@/server/domains/comments/services/moderate')

const db = getTestDb()

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

async function latestCommentsRow() {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, 'comments:latest')).limit(1)
  return rows[0] ?? null
}

async function seedUser(overrides: Partial<typeof user.$inferInsert> = {}): Promise<number> {
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

async function seedComment(userId: number, ownerId: number, isPending: boolean): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId,
      userId,
      content: 'hello',
      body: [],
      rid: 0,
      rootId: 0,
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

    // Pending comments are not listed yet.
    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(0)
    expect(await latestCommentsRow()).not.toBeNull()

    const { approved } = await bulkApproveCommentsByUser(db, userId)
    expect(approved).toBe(1)

    expect(await latestCommentsRow()).toBeNull()
    const fresh = await latestComments(db)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.permalink).toBe(`/posts/bulk-approve-target/#user-comment-${commentId}`)
  })

  it('bulk soft-delete-by-user invalidates the warmed latest-comments cache', async () => {
    const userId = await seedUser()
    const postId = await seedPost('bulk-delete-target')
    await seedComment(userId, postId, false)

    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(1)
    expect(await latestCommentsRow()).not.toBeNull()

    const { deleted } = await bulkDeleteCommentsByUser(db, userId)
    expect(deleted).toBe(1)

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

    const warmed = await latestComments(db)
    expect(warmed).toHaveLength(1)
    expect(await latestCommentsRow()).not.toBeNull()

    await softDeleteCommentById(db, commentId)

    expect(await latestCommentsRow()).toBeNull()
    const fresh = await latestComments(db)
    expect(fresh).toHaveLength(0)
  })
})
