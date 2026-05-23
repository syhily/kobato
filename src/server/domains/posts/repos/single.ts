import { and, eq, isNull } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { findContentById } from '@/server/domains/content/repo'
import { toCmsPost } from '@/server/domains/posts/projection'
import { hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema'

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

export async function findPostBySlug(slug: string): Promise<Post | null> {
  const meta = await findPublicPostMetaBySlug(slug)
  if (meta === null || !meta.published || meta.publishedRevisionId === null) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  const post = toCmsPost(meta, revision) as unknown as Post
  await hydratePostImages([post])
  return post
}

export async function findPostBySlugForAdmin(slug: string): Promise<Post | null> {
  const meta = await findPostMetaBySlug(slug)
  if (meta === null) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  const post = toCmsPost(meta, revision) as unknown as Post
  await hydratePostImages([post])
  return post
}
