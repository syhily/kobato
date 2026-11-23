import type { Post } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { PostMetaRow } from '@kobato/db/sqlite/types'

import {
  findEntityMetaById,
  findEntityMetaBySlug,
  findPublicEntityMetaBySlug,
} from '@kobato/db/sqlite/operations/content/entity-meta'
import {
  findLivePostBySlug as findLivePostBySlugOp,
  findLivePostWithRevisionBySlugOrAlias,
} from '@kobato/db/sqlite/operations/content/post'
import { findCategoryNamesByIds } from '@kobato/db/sqlite/operations/taxonomy/category'
import { findTagNamesByPostId } from '@kobato/db/sqlite/operations/taxonomy/tag'
import { toCmsPost } from '@kobato/server/domains/posts/projection'
import { hydratePostImages } from '@kobato/server/domains/posts/repos/hydrate'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export const findPostMetaById = (db: Database, id: number): PostMetaRow | null =>
  unsafeCast<PostMetaRow | null>(findEntityMetaById(db, 'post', id))

export const findPostMetaBySlug = (db: Database, slug: string): PostMetaRow | null =>
  unsafeCast<PostMetaRow | null>(findEntityMetaBySlug(db, 'post', slug))

export const findPostMetaBySlugForUpdate = (db: Database, slug: string): PostMetaRow | null =>
  unsafeCast<PostMetaRow | null>(findEntityMetaBySlug(db, 'post', slug))

export const findPublicPostMetaBySlug = (db: Database, slug: string): PostMetaRow | null =>
  unsafeCast<PostMetaRow | null>(findPublicEntityMetaBySlug(db, 'post', slug))

export async function findLivePostBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  return findLivePostBySlugOp(db, slug)
}

async function resolveCategoryName(db: Database, categoryId: number | null): Promise<string> {
  if (categoryId === null) {
    return ''
  }
  const map = await findCategoryNamesByIds(db, [categoryId])
  return map.get(categoryId) ?? ''
}

export async function findPostBySlug(db: Database, slug: string): Promise<Post | null> {
  const result = await findLivePostWithRevisionBySlugOrAlias(db, slug)
  if (result === null) {
    return null
  }
  const [tags, categoryName] = await Promise.all([
    findTagNamesByPostId(db, result.meta.id),
    resolveCategoryName(db, result.meta.categoryId),
  ])
  const post = toCmsPost(result.meta, result.revision, { tags, categoryName })
  await hydratePostImages(db, [post])
  return post
}
