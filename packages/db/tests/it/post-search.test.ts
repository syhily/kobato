import { sqliteOf } from '@kobato/db/sqlite/database'
import { searchPostSlugs } from '@kobato/db/sqlite/operations/content/post-search'
import { postSearchIndex } from '@kobato/db/sqlite/schema/content'
import { post } from '@kobato/db/sqlite/schema/post'
import { clearAllTables, getTestDb } from '@kobato/db/tests/utils/integration-db'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(() => {
  clearAllTables(db)
})

async function seedScheduledPost(): Promise<void> {
  const rows = await sqliteOf(db)
    .insert(post)
    .values({
      slug: 'scheduled',
      title: 'Scheduled Test',
      summary: '',
      published: true,
      publishedRevisionId: 1,
      publishedAt: new Date(Date.now() + 86_400_000),
    })
    .returning({ id: post.id })
  await sqliteOf(db).insert(postSearchIndex).values({ postId: rows[0]!.id, plainText: 'Scheduled Test' })
}

describe('searchPostSlugs', () => {
  it('excludes scheduled posts by default', async () => {
    await seedScheduledPost()
    await expect(searchPostSlugs(db, 'scheduled')).resolves.toEqual([])
  })

  it('includes scheduled posts when explicitly requested', async () => {
    await seedScheduledPost()
    await expect(searchPostSlugs(db, 'scheduled', { includeScheduled: true })).resolves.toEqual(['scheduled'])
  })
})
