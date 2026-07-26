import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, type SQL } from 'drizzle-orm'

import type { ContentRow, NewPostMeta, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { makeMetaCrud } from '@/server/domains/content/entities/meta-repo'
import { livePostWhere } from '@/server/domains/posts/live-gate'
import { toCmsPost } from '@/server/domains/posts/projection'
import { hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostId } from '@/server/infra/db/operations/post-tag'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

// Meta-row reads come from the shared meta CRUD (`content/entities/meta-repo.ts`)
// bound to the post table — no post-specific fork of these queries exists.
const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const findPostMetaById = crud.findMetaById
export const findPostMetaBySlug = crud.findMetaBySlug
export const findPostMetaBySlugForUpdate = crud.findMetaBySlugForUpdate
export const findPublicPostMetaBySlug = crud.findPublicMetaBySlug

/**
 * Slim live-by-slug lookup — id + title only, gated by `livePostWhere`.
 * Cross-domain consumers that must know whether a slug resolves to a live
 * post (webmention target resolution) mount this instead of opening a
 * post-table query of their own.
 */
export async function findLivePostBySlug(
  db: NodePgDatabase,
  slug: string,
): Promise<{ id: bigint; title: string } | null> {
  const rows = await db
    .select({ id: postMetaTable.id, title: postMetaTable.title })
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), livePostWhere()))
    .limit(1)
  return rows[0] ?? null
}

async function findPostWithRevisionBySlug(
  db: NodePgDatabase,
  slug: string,
  extraWhere?: SQL,
): Promise<{ meta: PostMetaRow; revision: ContentRow | null } | null> {
  const rows = await db
    .select()
    .from(postMetaTable)
    .leftJoin(contentTable, eq(postMetaTable.publishedRevisionId, contentTable.id))
    .where(extraWhere ? and(eq(postMetaTable.slug, slug), extraWhere) : eq(postMetaTable.slug, slug))
    .limit(1)
  if (rows.length === 0) {
    return null
  }
  const { post, content } = rows[0]
  return { meta: post as PostMetaRow, revision: content as ContentRow | null }
}

async function resolveCategoryName(db: NodePgDatabase, categoryId: bigint | null): Promise<string> {
  if (categoryId === null) {
    return ''
  }
  const map = await findCategoryNamesByIds(db, [categoryId])
  return map.get(categoryId) ?? ''
}

export async function findPostBySlug(db: NodePgDatabase, slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(db, slug, livePostWhere())
  if (result === null) {
    return null
  }
  const [tags, categoryName] = await Promise.all([
    findTagNamesByPostId(db, result.meta.id),
    resolveCategoryName(db, result.meta.categoryId),
  ])
  // `toCmsPost` returns the shared `Post` DTO directly (no `CmsPost`
  // variant exists) — hydrate images in place and return as-is.
  const post = toCmsPost(result.meta, result.revision, { tags, categoryName })
  await hydratePostImages(db, [post])
  return post
}

export async function findPostBySlugForAdmin(db: NodePgDatabase, slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(db, slug)
  if (result === null) {
    return null
  }
  const [tags, categoryName] = await Promise.all([
    findTagNamesByPostId(db, result.meta.id),
    resolveCategoryName(db, result.meta.categoryId),
  ])
  // See `findPostBySlug` — `toCmsPost`'s return already IS the `Post` DTO.
  const post = toCmsPost(result.meta, result.revision, { tags, categoryName })
  await hydratePostImages(db, [post])
  return post
}
