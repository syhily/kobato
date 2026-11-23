import type { EntityType } from '@kobato/db/sqlite/target'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { reserveSlugTx } from '@kobato/db/sqlite/operations/content/entity-lifecycle'
import { SlugOccupiedError } from '@kobato/db/sqlite/operations/content/entity-meta'
import { slugRegistry } from '@kobato/db/sqlite/schema/config'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { clearAllTables, getTestDb } from '@kobato/db/tests/utils/integration-db'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(slug: string): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(post)
    .values({ slug, title: `Post ${slug}`, published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedPage(slug: string): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(page)
    .values({ slug, title: `Page ${slug}` })
    .returning({ id: page.id })
  return rows[0]!.id
}

async function seedRegistryRow(slug: string, entityType: 'post' | 'page', entityId: number): Promise<void> {
  await sqliteOf(db).insert(slugRegistry).values({ slug, entityType, entityId })
}

function reserveSlugInTransaction(
  _db: unknown,
  entityType: EntityType,
  slug: string,
  ownEntityId: number | undefined,
  _options: unknown,
): void {
  reserveSlugTx(sqliteOf(db), entityType, slug, ownEntityId)
}

describe('reserveSlugTx', () => {
  it('allows the slug when no own meta and no registry entry exists', () => {
    expect(() => reserveSlugInTransaction(db, 'post', 'hello', undefined, {})).not.toThrow()
  })

  it('throws CONFLICT when another own entity has the same slug', async () => {
    await seedPost('hello')

    expect(() => reserveSlugInTransaction(db, 'post', 'hello', 999, {})).toThrowError(SlugOccupiedError)
    expect(() => reserveSlugInTransaction(db, 'post', 'hello', 999, {})).toThrow("slug 'hello' is taken by a post")
  })

  it('throws CONFLICT when a different entity type holds the slug', async () => {
    const pageId = await seedPage('hello')
    await seedRegistryRow('hello', 'page', pageId)

    expect(() => reserveSlugInTransaction(db, 'post', 'hello', undefined, {})).toThrow(
      "slug 'hello' is taken by a page",
    )
  })

  it('allows updating the same entity with its existing slug', async () => {
    const postId = await seedPost('hello')
    await seedRegistryRow('hello', 'post', postId)

    expect(() => reserveSlugInTransaction(db, 'post', 'hello', postId, {})).not.toThrow()
  })

  it('uses page wording for own-page collisions', async () => {
    await seedPage('about')

    expect(() => reserveSlugInTransaction(db, 'page', 'about', 999, {})).toThrow("slug 'about' is taken by a page")
  })
})
