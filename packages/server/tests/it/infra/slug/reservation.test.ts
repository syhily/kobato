import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { findPageMetaBySlugForUpdate } from '@kobato/server/domains/pages/repo'
import { findPostMetaBySlugForUpdate } from '@kobato/server/domains/posts/services/single'
import { slugRegistry } from '@kobato/server/infra/db/schema/config'
import { page } from '@kobato/server/infra/db/schema/page'
import { post } from '@kobato/server/infra/db/schema/post'
import { DomainError } from '@kobato/server/infra/http/errors'
import { reserveSlugInTransaction } from '@kobato/server/infra/slug/reservation'
import { beforeEach, describe, expect, it } from 'vitest'

// The reservation guard runs against the real engine: the own-meta lookup
// and the cross-entity registry read are plain SELECTs on seeded rows, so
// the mock seams from the Postgres era are gone.
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
    ).toThrow('slug "hello" 已被其它文章占用。')
  })

  it('throws CONFLICT when a different entity type holds the slug', async () => {
    const pageId = await seedPage('hello')
    await seedRegistryRow('hello', 'page', pageId)

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      }),
    ).toThrow('slug "hello" 已被其它页面占用。')
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
    ).toThrow('slug "about" 已被其它页面占用。')
  })
})
