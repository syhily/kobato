import { sqliteOf } from '@kobato/db/sqlite/database'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { user } from '@kobato/db/sqlite/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@kobato/inkling/headless/comment-schema'
import { commentsAuthedRouter } from '@kobato/server/http/controllers/account/comments-authed.controller'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

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

async function seedPage(title: string, slug: string): Promise<number> {
  const rows = await sqliteOf(db).insert(page).values({ slug, title }).returning({ id: page.id })
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

describe('commentsAuthedRouter.searchMineEntities', () => {
  it('returns entities the user has commented on', async () => {
    const u = await seedVisitor({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('Matched Post Title', 'post-1')
    await seedComment({ userId: u, ownerId: pid, type: 'post', content: 'nice' })

    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]).toEqual({ value: `post:${pid}`, label: 'Matched Post Title' })
  })

  it('filters entities by title query', async () => {
    const u = await seedVisitor({ name: 'U2', email: 'u2@x.com' })
    const pid1 = await seedPost('Alpha Article', 'post-a')
    const pid2 = await seedPost('Beta Article', 'post-b')
    await seedComment({ userId: u, ownerId: pid1, type: 'post' })
    await seedComment({ userId: u, ownerId: pid2, type: 'post' })

    const res = await call(commentsAuthedRouter.searchMineEntities, { q: 'beta' }, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]!.label).toBe('Beta Article')
  })

  it('includes pages as well as posts', async () => {
    const u = await seedVisitor({ name: 'U3', email: 'u3@x.com' })
    const pageId = await seedPage('About Page', 'about')
    await seedComment({ userId: u, ownerId: pageId, type: 'page' })

    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]!.value).toBe(`page:${pageId}`)
  })

  it('returns an empty list when the user has not commented on anything', async () => {
    const u = await seedVisitor({ name: 'U4', email: 'u4@x.com' })
    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toEqual([])
  })
})

describe('commentsAuthedRouter.loadMine', () => {
  it('filters by entity when `entity` is supplied', async () => {
    const u = await seedVisitor({ name: 'U5', email: 'u5@x.com' })
    const pid1 = await seedPost('Post One', 'post-one')
    const pid2 = await seedPost('Post Two', 'post-two')
    await seedComment({ userId: u, ownerId: pid1, type: 'post', content: 'on one' })
    await seedComment({ userId: u, ownerId: pid2, type: 'post', content: 'on two' })

    const res = await call(commentsAuthedRouter.loadMine, { entity: `post:${pid1}` }, { context: ctxFor(u) })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
  })

  it('ignores an invalid `entity` parameter', async () => {
    const u = await seedVisitor({ name: 'U6', email: 'u6@x.com' })
    const pid = await seedPost('Post Three', 'post-three')
    await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const res = await call(commentsAuthedRouter.loadMine, { entity: 'bad-value' }, { context: ctxFor(u) })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
  })
})
