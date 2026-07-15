import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, isNull, type SQL } from 'drizzle-orm'

import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { liveContentWhere } from '@/server/domains/content/schema'
import { toCmsPost } from '@/server/domains/posts/projection'
import { hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { findTagNamesByPostId } from '@/server/infra/db/operations/post-tag'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

export async function findPostMetaById(db: NodePgDatabase, id: bigint): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findPostMetaBySlug(db: NodePgDatabase, slug: string): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function findPostMetaBySlugForUpdate(db: NodePgDatabase, slug: string): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, slug)).for('update').limit(1)
  return rows[0] ?? null
}

export async function findPublicPostMetaBySlug(db: NodePgDatabase, slug: string): Promise<PostMetaRow | null> {
  const rows = await db
    .select()
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), isNull(postMetaTable.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export function toPostFromMeta(meta: PostMetaRow, tags: string[] = []): Post {
  return {
    ...toClientPostFromMeta(meta, tags),
    body: [],
    imageSources: [],
    publishedRevisionId: meta.publishedRevisionId,
  }
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

export async function findPostBySlug(db: NodePgDatabase, slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(
    db,
    slug,
    liveContentWhere({
      deletedAt: postMetaTable.deletedAt,
      published: postMetaTable.published,
      publishedRevisionId: postMetaTable.publishedRevisionId,
      publishedAt: postMetaTable.publishedAt,
    }),
  )
  if (result === null) {
    return null
  }
  const tags = await findTagNamesByPostId(db, result.meta.id)
  const post = toCmsPost(result.meta, result.revision, { tags })
  await hydratePostImages(db, [post])
  return post
}

export async function findPostBySlugForAdmin(db: NodePgDatabase, slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(db, slug)
  if (result === null) {
    return null
  }
  const tags = await findTagNamesByPostId(db, result.meta.id)
  const post = toCmsPost(result.meta, result.revision, { tags })
  await hydratePostImages(db, [post])
  return post
}
