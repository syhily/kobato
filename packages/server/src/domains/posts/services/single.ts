import type { Database } from '@kobato/server/infra/db/database'
import type { ContentRow, NewPostMeta, PostMetaRow } from '@kobato/server/infra/db/types'
import type { Post } from '@kobato/shared/types/catalog'

import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo'
import { livePostWhere } from '@kobato/server/domains/posts/live-gate'
import { toCmsPost } from '@kobato/server/domains/posts/projection'
import { hydratePostImages } from '@kobato/server/domains/posts/repos/hydrate'
import { findCategoryNamesByIds } from '@kobato/server/infra/db/operations/category'
import { findTagNamesByPostId } from '@kobato/server/infra/db/operations/post-tag'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { and, eq, sql, type SQL } from 'drizzle-orm'

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
export async function findLivePostBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  const rows = await db
    .select({ id: postMetaTable.id, title: postMetaTable.title })
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), livePostWhere()))
    .limit(1)
  return rows[0] ?? null
}

async function findPostWithRevisionWhere(
  db: Database,
  where: SQL | undefined,
): Promise<{ meta: PostMetaRow; revision: ContentRow | null } | null> {
  const rows = await db
    .select()
    .from(postMetaTable)
    .leftJoin(contentTable, eq(postMetaTable.publishedRevisionId, contentTable.id))
    .where(where)
    .limit(1)
  if (rows.length === 0) {
    return null
  }
  const { post, content } = rows[0]
  return { meta: post as PostMetaRow, revision: content as ContentRow | null }
}

async function findPostWithRevisionBySlug(
  db: Database,
  slug: string,
  extraWhere?: SQL,
): Promise<{ meta: PostMetaRow; revision: ContentRow | null } | null> {
  return findPostWithRevisionWhere(
    db,
    extraWhere ? and(eq(postMetaTable.slug, slug), extraWhere) : eq(postMetaTable.slug, slug),
  )
}

/** Slug OR alias match for the live-gated public lookup: a request to an
 *  old alias resolves to the same post (the route then 301s to the
 *  canonical slug via `canonicalPostPath`). json_each unpacks the
 *  JSON-array alias column in SQL. */
function whereSlugOrAlias(slug: string): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${postMetaTable.alias}) WHERE json_each.value = ${slug})`
}

function findPostWithRevisionBySlugOrAlias(db: Database, slug: string, extraWhere?: SQL) {
  return findPostWithRevisionWhere(db, extraWhere ? and(whereSlugOrAlias(slug), extraWhere) : whereSlugOrAlias(slug))
}

/**
 * Slim live-by-slug ETag probe — `id` + `slug` + `publishedAt` only, the
 * exact inputs of the public detail route's weak ETag (`post.updated`
 * projects `meta.publishedAt`). Lets the loader answer a matching
 * If-None-Match with 304 after one indexed meta read instead of the full
 * meta+revision+taxonomy load. Slug OR alias match, mirroring
 * `findPostBySlug`; on an alias hit the returned `slug` differs from the
 * requested one so the caller skips the early 304 and lets the full load
 * issue the canonical 301.
 */
export async function findPostEtagInputBySlug(
  db: Database,
  slug: string,
): Promise<{ id: number; slug: string; publishedAt: Date } | null> {
  const columns = { id: postMetaTable.id, slug: postMetaTable.slug, publishedAt: postMetaTable.publishedAt }
  const rows = await db
    .select(columns)
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), livePostWhere()))
    .limit(1)
  if (rows[0] !== undefined) {
    return rows[0]
  }
  const aliasRows = await db
    .select(columns)
    .from(postMetaTable)
    .where(and(whereSlugOrAlias(slug), livePostWhere()))
    .limit(1)
  return aliasRows[0] ?? null
}

async function resolveCategoryName(db: Database, categoryId: number | null): Promise<string> {
  if (categoryId === null) {
    return ''
  }
  const map = await findCategoryNamesByIds(db, [categoryId])
  return map.get(categoryId) ?? ''
}

export async function findPostBySlug(db: Database, slug: string): Promise<Post | null> {
  const result =
    (await findPostWithRevisionBySlug(db, slug, livePostWhere())) ??
    (await findPostWithRevisionBySlugOrAlias(db, slug, livePostWhere()))
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

export async function findPostBySlugForAdmin(db: Database, slug: string): Promise<Post | null> {
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
