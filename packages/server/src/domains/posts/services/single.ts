import type { Post } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/database'
import type { ContentRow, NewPostMeta, PostMetaRow } from '@kobato/db/types'

import { findCategoryNamesByIds } from '@kobato/db/operations/category'
import { findTagNamesByPostId } from '@kobato/db/operations/post-tag'
import { content as contentTable } from '@kobato/db/schema/content'
import { post as postMetaTable } from '@kobato/db/schema/post'
import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo'
import { livePostWhere } from '@kobato/server/domains/posts/live-gate'
import { toCmsPost } from '@kobato/server/domains/posts/projection'
import { hydratePostImages } from '@kobato/server/domains/posts/repos/hydrate'
import { and, eq, sql, type SQL } from 'drizzle-orm'

const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const findPostMetaById = crud.findMetaById
export const findPostMetaBySlug = crud.findMetaBySlug
export const findPostMetaBySlugForUpdate = crud.findMetaBySlugForUpdate
export const findPublicPostMetaBySlug = crud.findPublicMetaBySlug

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

function whereSlugOrAlias(slug: string): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${postMetaTable.alias}) WHERE json_each.value = ${slug})`
}

function findPostWithRevisionBySlugOrAlias(db: Database, slug: string, extraWhere?: SQL) {
  return findPostWithRevisionWhere(db, extraWhere ? and(whereSlugOrAlias(slug), extraWhere) : whereSlugOrAlias(slug))
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
  const post = toCmsPost(result.meta, result.revision, { tags, categoryName })
  await hydratePostImages(db, [post])
  return post
}
