import { eq } from 'drizzle-orm'

import { indexPost, removePostIndex } from '@/server/domains/posts/indexer'
import { toAdminPostDto, type AdminPostDto } from '@/server/domains/posts/projection'
import {
  findContentById,
  findPostMetaById,
  findPostMetaBySlug,
  restorePostMeta,
  softDeletePostMeta,
  updatePostMetaById,
} from '@/server/domains/posts/repo'
import {
  assertOwnPostOr404,
  clearPostMetasCache,
  ensureSlugLegal,
  resolveSlugForPost,
  type UpsertPostMetaInput,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { resolveSlugForTaxonomy } from '@/server/domains/taxonomies/shared'
import { seedTagIfMissing } from '@/server/infra/db/operations/tag'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('posts.service')

async function ensureTagsExist(tagNames: string[], tx = db): Promise<void> {
  if (tagNames.length === 0) {
    return
  }
  await Promise.all(
    tagNames.map((name) => seedTagIfMissing({ name, slug: resolveSlugForTaxonomy(undefined, name) }, tx)),
  )
}

export async function createPost(
  input: UpsertPostMetaInput,
  authorId: bigint | null,
  viewer?: ViewerContext,
): Promise<AdminPostDto> {
  let resolvedAuthorId = authorId
  if (viewer && viewer.role !== 'admin') {
    resolvedAuthorId = idFromString(viewer.userId)
  }
  const slug = resolveSlugForPost(input.slug, input.title)
  ensureSlugLegal(slug)
  const collision = await findPostMetaBySlug(slug)
  if (collision !== null) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
  }
  const now = new Date()
  try {
    const row = await db.transaction(async (tx) => {
      await ensureTagsExist(input.tags ?? [], tx)
      const [inserted] = await tx
        .insert(postMetaTable)
        .values({
          slug,
          title: input.title,
          summary: input.summary ?? '',
          cover: input.cover ?? '',
          og: input.og ?? null,
          published: false,
          commentsEnabled: input.commentsEnabled ?? true,
          showToc: input.showToc ?? false,
          showUpdated: input.showUpdated ?? false,
          visible: input.visible ?? true,
          pinnedAt: input.pinnedAt === undefined ? null : input.pinnedAt,
          category: input.category ?? '',
          tags: input.tags ?? [],
          alias: input.alias ?? [],
          publishedAt: input.publishedAt ?? now,
          authorId: resolvedAuthorId,
        })
        .returning()
      return inserted
    })
    await clearPostMetasCache()
    return toAdminPostDto(row)
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }
    throw err
  }
}

export async function updatePostMeta(input: UpsertPostMetaInput, viewer?: ViewerContext): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  const id = input.id
  const slug = resolveSlugForPost(input.slug, input.title)
  ensureSlugLegal(slug)
  const existing = await findPostMetaById(id)
  assertOwnPostOr404(existing, viewer)
  if (existing.slug !== slug) {
    const collision = await findPostMetaBySlug(slug)
    if (collision !== null && collision.id !== id) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }
  }
  try {
    const updated = await db.transaction(async (tx) => {
      await ensureTagsExist(input.tags ?? [], tx)
      const [result] = await tx
        .update(postMetaTable)
        .set({
          slug,
          title: input.title,
          summary: input.summary ?? existing.summary,
          cover: input.cover ?? existing.cover,
          og: input.og === undefined ? existing.og : input.og,
          commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
          showToc: input.showToc ?? existing.showToc,
          showUpdated: input.showUpdated ?? existing.showUpdated,
          visible: input.visible ?? existing.visible,
          pinnedAt: input.pinnedAt === undefined ? existing.pinnedAt : input.pinnedAt,
          category: input.category ?? existing.category,
          tags: input.tags ?? existing.tags,
          alias: input.alias ?? existing.alias,
          publishedAt: input.publishedAt ?? existing.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(postMetaTable.id, id))
        .returning()
      return result ?? null
    })
    if (updated === null) {
      throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
    }
    await clearPostMetasCache()
    return toAdminPostDto(updated)
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }
    throw err
  }
}

export async function deletePost(id: bigint, viewer?: ViewerContext): Promise<{ deleted: boolean }> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const deleted = await db.transaction(async (tx) => {
    const ok = await softDeletePostMeta(id, tx)
    if (ok) {
      await removePostIndex(id, tx)
    }
    return ok
  })
  if (deleted) {
    await clearPostMetasCache()
  }
  return { deleted }
}

export async function restorePost(id: bigint, viewer?: ViewerContext): Promise<{ restored: boolean }> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const restored = await db.transaction(async (tx) => {
    return restorePostMeta(id, tx)
  })
  if (restored) {
    await clearPostMetasCache()
    const meta = await findPostMetaById(id)
    if (meta !== null && meta.published && meta.publishedRevisionId !== null) {
      const revision = await findContentById(meta.publishedRevisionId)
      if (revision !== null) {
        await indexPost(
          meta.id,
          meta.title,
          meta.summary,
          revision.body as import('@/shared/pt/schema').PortableTextBody,
        ).catch((err: unknown) => {
          log.warn('index post failed', { postId: meta.id, error: err })
        })
      }
    }
  }
  return { restored }
}

export async function unpublishPost(id: bigint, viewer?: ViewerContext): Promise<AdminPostDto> {
  const existing = await findPostMetaById(id)
  assertOwnPostOr404(existing, viewer)
  const updated = await updatePostMetaById(id, { published: false })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
  }
  await clearPostMetasCache()
  await removePostIndex(id).catch((err: unknown) => {
    log.warn('remove post index failed', { postId: id, error: err })
  })
  return toAdminPostDto(updated)
}
