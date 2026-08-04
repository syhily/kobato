import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { seedMetric } from '#/_helpers/db'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'

import { commentsPublicRouter } from '@kobato/server/http/controllers/comments-public.controller'
import { contentPublicRouter } from '@kobato/server/http/controllers/content-public.controller'
import { likesRouter } from '@kobato/server/http/controllers/likes.controller'
import { upsertWebmention, setWebmentionStatus } from '@kobato/server/infra/db/operations/webmention'
import { comment } from '@kobato/server/infra/db/schema/comment'
import { content } from '@kobato/server/infra/db/schema/content'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { user } from '@kobato/server/infra/db/schema/user'
import { EMPTY_LEXICAL_COMMENT_BODY } from '@kobato/shared/lexical/comment-schema'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// Key-flow contract (plan v8 定稿, 0.6 验证门): the wire key (`page_key`
// = metric `public_id`) is bound to the ENTITY `(type, owner_id)`, never
// to the slug — so renaming a post's slug must leave its comments,
// webmentions and likes fully intact. This is the regression guard for
// the "slug 修改后评论/引用/点赞完整" scenario.

const db = getTestDb()

const TARGET_URL = 'https://example.com/posts/old-slug/'

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedLivePost(slug: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: slug,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      deletedAt: null,
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revision = await db
    .insert(content)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await db.update(postTable).set({ publishedRevisionId: revision[0]!.id }).where(eq(postTable.id, postId))
  await db.insert(metric).values(seedMetric({ type: 'post', ownerId: postId }))
  return postId
}

describe('key-flow: slug renames never disturb comments/webmentions/likes', () => {
  it('keeps page_key, the comment feed, webmentions and likes intact after a slug change', async () => {
    const postId = await seedLivePost('old-slug')

    // A comment (by an existing user — the public thread query joins the
    // user row) + an approved webmention on the entity.
    const [author] = await db
      .insert(user)
      .values({ name: 'Commenter', email: 'commenter@example.com', password: 'h', role: 'visitor' })
      .returning({ id: user.id })
    await db.insert(comment).values({
      type: 'post',
      ownerId: postId,
      userId: author.id,
      content: 'hello',
      body: EMPTY_LEXICAL_COMMENT_BODY,
      rid: 0,
      rootId: 0,
      isPending: false,
    })
    const { row: mentionRow } = await upsertWebmention(db, {
      sourceUrl: 'https://sender.example/one',
      targetUrl: TARGET_URL,
      status: 'pending',
      type: 'mention',
      targetType: 'post',
      targetOwnerId: postId,
      fetchedAt: new Date(),
      verificationStatus: 'verified',
      lastVerifiedAt: new Date(),
      lastError: null,
      verifyFailStreak: 0,
      authorName: 'Jane Doe',
      title: 'Mentioning post',
      summary: null,
      rawPayload: { source: 'https://sender.example/one', target: TARGET_URL },
    })
    await setWebmentionStatus(db, mentionRow.id, 'approved')

    // The key BEFORE the rename (the detail critical's `commentKey`).
    const before = await call(contentPublicRouter.postDetail, { slug: 'old-slug' }, { context: makePublicCtx({ db }) })
    const pageKey = before.detail.commentKey
    expect(pageKey).toBeTruthy()

    // Rename the slug — the public URL changes, the wire key must not.
    await db.update(postTable).set({ slug: 'new-slug' }).where(eq(postTable.id, postId))

    const after = await call(contentPublicRouter.postDetail, { slug: 'new-slug' }, { context: makePublicCtx({ db }) })
    expect(after.canonicalSlug).toBeNull()
    expect(after.detail.commentKey).toBe(pageKey)

    // Comments still list under the same key.
    const comments = await call(
      commentsPublicRouter.loadComments,
      { page_key: pageKey, offset: 0 },
      { context: makePublicCtx({ db }) },
    )
    expect(comments.comments).toHaveLength(1)

    // Webmentions still list under the same key.
    const mentions = await call(
      contentPublicRouter.listWebmentions,
      { page_key: pageKey },
      { context: makePublicCtx({ db }) },
    )
    expect(mentions.webmentions).toHaveLength(1)

    // Likes still resolve through the same key.
    const liked = await call(likesRouter.increase, { key: pageKey }, { context: makePublicCtx({ db }) })
    expect(liked.key).toBe(pageKey)
    expect(liked.likes).toBe(1)
  })
})
