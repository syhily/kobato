import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { comment } from '@/server/infra/db/schema/comment'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@/shared/lexical/comment-schema'

// Stub the email boundary so the module graph never reaches the network.
vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

const { bulkApproveCommentsByUser, bulkDeleteCommentsByUser } =
  await import('@/server/domains/comments/services/moderate')
const { softDeleteCommentById } = await import('@/server/domains/comments/services/moderate')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

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
      body: EMPTY_COMMENT_EDITOR_STATE,
      rid: 0,
      rootId: 0,
      isPending,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

// The sidebar digest reads SQLite directly — a mutation is visible on the
// very next call, with no cache invalidation in between.
describe('comments/repos/moderation — bulk mutations reach the sidebar digest', () => {
  it('bulk approve-by-user makes the comment visible immediately', async () => {
    const userId = await seedUser()
    const postId = await seedPost('bulk-approve-target')
    const commentId = await seedComment(userId, postId, true)

    // Pending comments are not listed yet.
    expect(await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)).toHaveLength(0)

    const { approved } = await bulkApproveCommentsByUser(db, userId)
    expect(approved).toBe(1)

    const fresh = await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.permalink).toBe(`/posts/bulk-approve-target/#user-comment-${commentId}`)
  })

  it('bulk soft-delete-by-user hides the comment immediately', async () => {
    const userId = await seedUser()
    const postId = await seedPost('bulk-delete-target')
    await seedComment(userId, postId, false)

    expect(await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)).toHaveLength(1)

    const { deleted } = await bulkDeleteCommentsByUser(db, userId)
    expect(deleted).toBe(1)

    expect(await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)).toHaveLength(0)
  })
})

describe('comments/repos/moderation — soft delete reaches the sidebar digest', () => {
  it('softDeleteCommentById hides the comment immediately', async () => {
    const userId = await seedUser()
    const postId = await seedPost('approve-delete-target')
    const commentId = await seedComment(userId, postId, false)

    expect(await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)).toHaveLength(1)

    await softDeleteCommentById(db, commentId)

    expect(await latestComments(db, TEST_BLOG_SETTINGS_BUNDLE)).toHaveLength(0)
  })
})
