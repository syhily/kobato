import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { findEntitySlugTitle, resolveEntitiesForComments } from '@kobato/server/domains/content/entities/slug-title'
import { page } from '@kobato/server/infra/db/schema/page'
import { post } from '@kobato/server/infra/db/schema/post'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

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

async function seedPageEntity(slug: string): Promise<number> {
  const rows = await db
    .insert(page)
    .values({ slug, title: `Page ${slug}` })
    .returning({ id: page.id })
  return rows[0]!.id
}

describe('content/entities/slug-title — findEntitySlugTitle', () => {
  it('returns the live slug/title for a post target', async () => {
    const pid = await seedPost('one-post')
    const out = await findEntitySlugTitle(db, { type: 'post', ownerId: pid })
    expect(out).toEqual({ slug: 'one-post', title: 'Post one-post' })
  })

  it('returns the live slug/title for a page target', async () => {
    const pgid = await seedPageEntity('one-page')
    const out = await findEntitySlugTitle(db, { type: 'page', ownerId: pgid })
    expect(out).toEqual({ slug: 'one-page', title: 'Page one-page' })
  })

  it('returns null when the target points at nothing (orphan)', async () => {
    expect(await findEntitySlugTitle(db, { type: 'post', ownerId: 9999 })).toBeNull()
  })
})

describe('content/entities/slug-title — resolveEntitiesForComments', () => {
  it('returns an empty map for an empty input', async () => {
    const out = await resolveEntitiesForComments(db, [])
    expect(out.size).toBe(0)
  })

  it('resolves posts and pages in a single round-trip each', async () => {
    const pid = await seedPost('ent-post')
    const pgid = await seedPageEntity('ent-page')
    const out = await resolveEntitiesForComments(db, [
      { type: 'post', ownerId: pid },
      { type: 'page', ownerId: pgid },
    ])
    expect(out.get(`post:${pid}`)?.slug).toBe('ent-post')
    expect(out.get(`page:${pgid}`)?.title).toBe('Page ent-page')
  })

  it('omits pairs pointing at nothing and dedupes repeated pairs', async () => {
    const pid = await seedPost('dedupe-post')
    const out = await resolveEntitiesForComments(db, [
      { type: 'post', ownerId: pid },
      { type: 'post', ownerId: pid },
      { type: 'page', ownerId: 9998 },
    ])
    expect(out.size).toBe(1)
    expect(out.get(`post:${pid}`)?.slug).toBe('dedupe-post')
  })
})
