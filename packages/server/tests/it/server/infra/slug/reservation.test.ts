import { slugRegistry } from '@kobato/db/schema/config.ts'
import { page } from '@kobato/db/schema/page.ts'
import { post } from '@kobato/db/schema/post.ts'
import { findPageMetaBySlugForUpdate } from '@kobato/server/domains/pages/repo.ts'
import { findPostMetaBySlugForUpdate } from '@kobato/server/domains/posts/services/single.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { reserveSlugInTransaction } from '@kobato/server/infra/slug/reservation.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({ slug, title: `Post ${slug}`, published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedPage(slug: string): Promise<number> {
  const rows = await db
    .insert(page)
    .values({ slug, title: `Page ${slug}` })
    .returning({ id: page.id })
  return rows[0]!.id
}

async function seedRegistryRow(slug: string, entityType: 'post' | 'page', entityId: number): Promise<void> {
  await db.insert(slugRegistry).values({ slug, entityType, entityId })
}

describe('infra/slug/reservation — reserveSlugInTransaction', () => {
  it('allows the slug when no own meta and no registry entry exists', () => {
    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).not.toThrow()
  })

  it('throws CONFLICT when another own entity has the same slug', async () => {
    await seedPost('hello')

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', 999, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).toThrowError(DomainError)
    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', 999, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).toThrow('slug "hello" is already used by another post.')
  })

  it('throws CONFLICT when a different entity type holds the slug', async () => {
    const pageId = await seedPage('hello')
    await seedRegistryRow('hello', 'page', pageId)

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).toThrow('slug "hello" is already used by another page.')
  })

  it('allows updating the same entity with its existing slug', async () => {
    const postId = await seedPost('hello')
    await seedRegistryRow('hello', 'post', postId)

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', postId, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).not.toThrow()
  })

  it('uses page wording for own-page collisions', async () => {
    await seedPage('about')

    expect(() =>
      reserveSlugInTransaction(db, 'page', 'about', 999, {
        findOwnMetaBySlugForUpdate: findPageMetaBySlugForUpdate,
      }),
    ).toThrow('slug "about" is already used by another page.')
  })
})
