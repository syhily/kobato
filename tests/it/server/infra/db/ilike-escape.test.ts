import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { and } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { buildAdminListConditions } from '@/server/domains/comments/repos/shared'
import { liveContentWhere } from '@/server/domains/content/schema'
import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { invalidateSearchCache, searchPosts } from '@/server/infra/search/search'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await invalidateSearchCache()
})

/** The same caller-supplied live gate the production search loader passes. */
function liveWhere() {
  return liveContentWhere({
    deletedAt: post.deletedAt,
    published: post.published,
    publishedRevisionId: post.publishedRevisionId,
    publishedAt: post.publishedAt,
  })
}

describe('ilikeEscape — direct SQL against database', () => {
  it('finds users by normal substring', async () => {
    await db.insert(user).values([
      { name: 'Alice Smith', email: 'alice@test.com', password: 'x' },
      { name: 'Bob Jones', email: 'bob@test.com', password: 'x' },
      { name: 'Charlie', email: 'charlie@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, 'Smith'))

    expect(rows.map((r) => r.name)).toEqual(['Alice Smith'])
  })

  it('treats % as a literal character when escaped', async () => {
    await db.insert(user).values([
      { name: '50% off sale', email: 'a@test.com', password: 'x' },
      { name: '500 dollars', email: 'b@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, '50%'))

    const names = rows.map((r) => r.name)
    expect(names).toContain('50% off sale')
    expect(names).not.toContain('500 dollars')
  })

  it('treats _ as a literal character when escaped', async () => {
    await db.insert(user).values([
      { name: 'A_B_test', email: 'a@test.com', password: 'x' },
      { name: 'AB_test', email: 'b@test.com', password: 'x' },
      { name: 'A__B', email: 'c@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, 'A_B'))

    const names = rows.map((r) => r.name)
    expect(names).toContain('A_B_test')
    expect(names).not.toContain('AB_test')
    expect(names).not.toContain('A__B')
  })

  it('treats backslash as a literal character when escaped', async () => {
    // Single backslash in DB value
    await db.insert(user).values([
      { name: 'a\\b', email: 'a@test.com', password: 'x' },
      { name: 'ab', email: 'b@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, 'a\\b'))

    const names = rows.map((r) => r.name)
    expect(names).toContain('a\\b')
    expect(names).not.toContain('ab')
  })

  it('handles mixed special characters', async () => {
    await db.insert(user).values([
      { name: '100%_complete', email: 'a@test.com', password: 'x' },
      { name: '100_complete', email: 'b@test.com', password: 'x' },
      { name: '100 percent', email: 'c@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, '100%_'))

    const names = rows.map((r) => r.name)
    expect(names).toContain('100%_complete')
    expect(names).not.toContain('100_complete')
    expect(names).not.toContain('100 percent')
  })

  it('is case-insensitive', async () => {
    await db.insert(user).values([
      { name: 'UPPERCASE', email: 'a@test.com', password: 'x' },
      { name: 'lowercase', email: 'b@test.com', password: 'x' },
      { name: 'MiXeD', email: 'c@test.com', password: 'x' },
    ])

    const rows = await db.select({ name: user.name }).from(user).where(ilikeEscape(user.name, 'mixed'))

    const names = rows.map((r) => r.name)
    expect(names).toContain('MiXeD')
    expect(names).not.toContain('UPPERCASE')
    expect(names).not.toContain('lowercase')
  })
})

describe('ilikeEscape — comments repository', () => {
  it('filters comments containing literal % in content', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Admin', email: 'admin@test.com', password: 'x' })
      .returning({ id: user.id })
    await db.insert(comment).values([
      { content: 'Discount is 50% off', type: 'post', ownerId: 1n, userId: u.id, rid: 1 },
      { content: 'Price is 500 yen', type: 'post', ownerId: 1n, userId: u.id, rid: 2 },
    ])

    const conditions = buildAdminListConditions({ q: '50%' })
    const rows = await db
      .select({ content: comment.content })
      .from(comment)
      .where(and(...conditions))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.content).toBe('Discount is 50% off')
  })

  it('filters comments containing literal _ in content', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Admin', email: 'admin@test.com', password: 'x' })
      .returning({ id: user.id })
    await db.insert(comment).values([
      { content: 'Variable name is foo_bar', type: 'post', ownerId: 1n, userId: u.id, rid: 1 },
      { content: 'Variable name is foobar', type: 'post', ownerId: 1n, userId: u.id, rid: 2 },
    ])

    const conditions = buildAdminListConditions({ q: 'foo_bar' })
    const rows = await db
      .select({ content: comment.content })
      .from(comment)
      .where(and(...conditions))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.content).toBe('Variable name is foo_bar')
  })

  it('excludes comments with does-not-contain match', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Admin', email: 'admin@test.com', password: 'x' })
      .returning({ id: user.id })
    await db.insert(comment).values([
      { content: 'Contains 50% discount', type: 'post', ownerId: 1n, userId: u.id, rid: 1 },
      { content: 'Just regular text', type: 'post', ownerId: 1n, userId: u.id, rid: 2 },
    ])

    const conditions = buildAdminListConditions({ q: '50%', match: 'does-not-contain' })
    const rows = await db
      .select({ content: comment.content })
      .from(comment)
      .where(and(...conditions))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.content).toBe('Just regular text')
  })
})

describe('ilikeEscape — search posts', () => {
  it('finds posts by title with escaped wildcards', async () => {
    await db.insert(post).values([
      { slug: 'post-1', title: 'How to get 50% off', summary: '', cover: '', publishedRevisionId: 1n },
      { slug: 'post-2', title: '500 reasons to code', summary: '', cover: '', publishedRevisionId: 2n },
    ])
    await db.insert(postSearchIndex).values([
      { postId: 1n, plainText: 'How to get 50% off' },
      { postId: 2n, plainText: '500 reasons to code' },
    ])

    const result = await searchPosts(db, liveWhere(), '50% off', 10)
    expect(result.hits).toContain('post-1')
    expect(result.hits).not.toContain('post-2')
  })

  it('finds posts by summary with escaped wildcards', async () => {
    await db.insert(post).values([
      { slug: 'post-1', title: 'Guide', summary: 'Save 50% today', cover: '', publishedRevisionId: 1n },
      { slug: 'post-2', title: 'Guide 2', summary: 'Save 500 today', cover: '', publishedRevisionId: 2n },
    ])
    await db.insert(postSearchIndex).values([
      { postId: 1n, plainText: 'Save 50% today' },
      { postId: 2n, plainText: 'Save 500 today' },
    ])

    const result = await searchPosts(db, liveWhere(), '50%', 10)
    expect(result.hits).toContain('post-1')
    expect(result.hits).not.toContain('post-2')
  })

  it('finds posts by title with escaped underscores', async () => {
    await db.insert(post).values([
      { slug: 'post-1', title: 'Guide to foo_bar', summary: '', cover: '', publishedRevisionId: 1n },
      { slug: 'post-2', title: 'Guide to foobar', summary: '', cover: '', publishedRevisionId: 2n },
    ])
    await db.insert(postSearchIndex).values([
      { postId: 1n, plainText: '' },
      { postId: 2n, plainText: '' },
    ])

    const result = await searchPosts(db, liveWhere(), 'foo_bar', 10)
    expect(result.hits).toContain('post-1')
    expect(result.hits).not.toContain('post-2')
  })
})
