import { describe, expect, it, afterAll, beforeEach } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { findTagNamesByPostId, findTagNamesByPostIds, setPostTags } from '@/server/infra/db/operations/post-tag'
import { post } from '@/server/infra/db/schema/post'
import { tag } from '@/server/infra/db/schema/taxonomy'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(overrides: Partial<typeof post.$inferInsert> = {}) {
  const [row] = await db
    .insert(post)
    .values({
      slug: 'test-post',
      title: 'Test Post',
      summary: '',
      cover: '',
      published: true,
      commentsEnabled: true,
      showToc: false,
      showUpdated: false,
      visible: true,
      pinnedAt: null,
      categoryId: null,
      alias: [],
      publishedAt: new Date(),
      ...overrides,
    })
    .returning()
  return row!
}

async function seedTags(names: string[]) {
  const rows = await db
    .insert(tag)
    .values(names.map((name) => ({ name, slug: name })))
    .returning()
  return rows
}

describe('db/operations/post-tag', () => {
  describe('setPostTags', () => {
    it('inserts junction rows for a post and resolves them back', async () => {
      const postRow = await seedPost()
      const tags = await seedTags(['typescript', 'react'])

      await setPostTags(
        db,
        postRow.id,
        tags.map((t) => t.id),
      )

      const names = await findTagNamesByPostId(db, postRow.id)
      expect(names).toEqual(['react', 'typescript'])
    })

    it('replaces existing tags on subsequent calls', async () => {
      const postRow = await seedPost()
      const [t1, t2, t3] = await seedTags(['a', 'b', 'c'])

      await setPostTags(db, postRow.id, [t1.id, t2.id])
      await setPostTags(db, postRow.id, [t3.id])

      const names = await findTagNamesByPostId(db, postRow.id)
      expect(names).toEqual(['c'])
    })

    it('clears all tags when given an empty array', async () => {
      const postRow = await seedPost()
      const [t1] = await seedTags(['a'])

      await setPostTags(db, postRow.id, [t1.id])
      await setPostTags(db, postRow.id, [])

      const names = await findTagNamesByPostId(db, postRow.id)
      expect(names).toEqual([])
    })
  })

  describe('findTagNamesByPostIds', () => {
    it('returns a map of postId → tag names for multiple posts', async () => {
      const p1 = await seedPost({ slug: 'p1' })
      const p2 = await seedPost({ slug: 'p2' })
      const [t1, t2] = await seedTags(['alpha', 'beta'])

      await setPostTags(db, p1.id, [t1.id])
      await setPostTags(db, p2.id, [t1.id, t2.id])

      const map = await findTagNamesByPostIds(db, [p1.id, p2.id])
      expect(map.get(p1.id)).toEqual(['alpha'])
      expect(map.get(p2.id)).toEqual(['alpha', 'beta'])
    })

    it('returns an empty map for empty postIds array', async () => {
      const map = await findTagNamesByPostIds(db, [])
      expect(map.size).toBe(0)
    })

    it('returns an empty map when no tags are assigned', async () => {
      const p1 = await seedPost({ slug: 'p1' })
      const map = await findTagNamesByPostIds(db, [p1.id])
      expect(map.size).toBe(0)
    })

    it('omits unknown postIds from the result map', async () => {
      const p1 = await seedPost({ slug: 'p1' })
      const [t1] = await seedTags(['alpha'])
      await setPostTags(db, p1.id, [t1.id])

      const map = await findTagNamesByPostIds(db, [p1.id, 999999])
      expect(map.size).toBe(1)
      expect(map.get(p1.id)).toEqual(['alpha'])
    })
  })

  describe('findTagNamesByPostId', () => {
    it('returns empty array for a post with no tags', async () => {
      const p1 = await seedPost({ slug: 'p1' })
      const names = await findTagNamesByPostId(db, p1.id)
      expect(names).toEqual([])
    })
  })
})
