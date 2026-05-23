import { and, eq, isNull, type SQL } from 'drizzle-orm'

import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { toCmsPost } from '@/server/domains/posts/projection'
import { hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { db } from '@/server/infra/db/pool'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

export async function findPostMetaById(id: bigint): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findPostMetaBySlug(slug: string): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function findPublicPostMetaBySlug(slug: string): Promise<PostMetaRow | null> {
  const rows = await db
    .select()
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), isNull(postMetaTable.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export function toPostFromMeta(meta: PostMetaRow): Post {
  return {
    ...toClientPostFromMeta(meta),
    body: [],
    imageSources: [],
    publishedRevisionId: meta.publishedRevisionId,
  }
}

async function findPostWithRevisionBySlug(
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

export async function findPostBySlug(slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(slug, isNull(postMetaTable.deletedAt))
  if (result === null || !result.meta.published || result.meta.publishedRevisionId === null) {
    return null
  }
  const post = toCmsPost(result.meta, result.revision)
  await hydratePostImages([post])
  return post
}

export async function findPostBySlugForAdmin(slug: string): Promise<Post | null> {
  const result = await findPostWithRevisionBySlug(slug)
  if (result === null) {
    return null
  }
  const post = toCmsPost(result.meta, result.revision)
  await hydratePostImages([post])
  return post
}
