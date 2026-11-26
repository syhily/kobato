import { makeCommentBody } from '@kobato/api/tests/utils/catalog'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { post } from '@kobato/db/sqlite/schema/post'
import { user } from '@kobato/db/sqlite/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@kobato/inkling/headless/comment-schema'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { commentsOwnRouter } from '@kobato/server/http/controllers/public/comments-own.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedVisitor(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Date.now()}-${Math.random()}@example.com`,
      password: 'hashed',
      role: 'visitor',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(title: string, slug: string): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(post)
    .values({
      slug,
      title,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      userId: opts.userId ?? 1,
      content: opts.content ?? 'hello',
      body: opts.body ?? EMPTY_COMMENT_EDITOR_STATE,
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

function ctxFor(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'visitor', db })
}

describe('commentsOwnRouter — delete-request wire shape', () => {
  beforeEach(() => {
    initAllBatchers(getDatabaseHandle())
  })

  afterEach(() => {
    resetAllBatchers()
  })

  it('requestDeleteOwn returns the wire comment with the flag set', async () => {
    const u = await seedVisitor({ name: 'U7', email: 'u7@x.com' })
    const pid = await seedPost('Delete Audit Post', 'delete-audit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const res = await call(commentsOwnRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.deleteRequestedAt).not.toBeNull()
  })

  it('requestDeleteOwn returns the same wire comment on the idempotent no-op path', async () => {
    const u = await seedVisitor({ name: 'U8', email: 'u8@x.com' })
    const pid = await seedPost('Delete Audit Twice', 'delete-audit-twice')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    await call(commentsOwnRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    const res = await call(commentsOwnRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.deleteRequestedAt).not.toBeNull()
  })

  it('cancelDeleteOwn returns the wire comment with the flag cleared', async () => {
    const u = await seedVisitor({ name: 'U9', email: 'u9@x.com' })
    const pid = await seedPost('Cancel Audit Post', 'cancel-audit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    await call(commentsOwnRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    const res = await call(commentsOwnRouter.cancelDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.deleteRequestedAt).toBeNull()
  })
})

describe('commentsOwnRouter.updateOwn', () => {
  beforeEach(() => {
    initAllBatchers(getDatabaseHandle())
  })

  afterEach(() => {
    resetAllBatchers()
  })

  it('returns the updated wire comment', async () => {
    const u = await seedVisitor({ name: 'U10', email: 'u10@x.com' })
    const pid = await seedPost('Own Edit Post', 'own-edit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const body = makeCommentBody('edited body')
    const res = await call(commentsOwnRouter.updateOwn, { commentId: String(cid), body }, { context: ctxFor(u) })

    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.userId).toBe(String(u))
    expect(JSON.stringify(res.comment.body)).toContain('edited body')
  })
})
