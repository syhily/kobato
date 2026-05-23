import { eq } from 'drizzle-orm'

import type { PortableTextBody } from '@/shared/pt/schema'

import { findContentById } from '@/server/domains/content/repo'
import { indexPost, removePostIndex } from '@/server/domains/posts/indexer'
import { toAdminPostDto, type AdminPostDto } from '@/server/domains/posts/projection'
import { findPostMetaById, findPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { restorePostMeta, softDeletePostMeta, updatePostMetaById } from '@/server/domains/posts/repos/write'
import {
  assertOwnPostOr404,
  clearPostMetasCache,
  type UpsertPostMetaInput,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { resolveSlugForTaxonomy } from '@/server/domains/taxonomies/shared'
import {
  deleteSlugRegistryByEntity,
  findSlugRegistryBySlug,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { seedTagsIfMissing } from '@/server/infra/db/operations/tag'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { ensureSlugLegal, resolveSlug } from '@/server/infra/slug-validation'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('posts.service')

async function ensureTagsExist(tagNames: string[], tx = db): Promise<void> {
  if (tagNames.length === 0) {
    return
  }
  await seedTagsIfMissing(
    tagNames.map((name) => ({ name, slug: resolveSlugForTaxonomy(undefined, name) })),
    tx,
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
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'post')
  const collision = await findPostMetaBySlug(slug)
  if (collision !== null) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
  }
  const crossCollision = await findSlugRegistryBySlug(slug)
  if (crossCollision !== null && crossCollision.entityType !== 'post') {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
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
    await insertSlugRegistry({ slug, entityType: 'post', entityId: row.id })
    await clearPostMetasCache()
    return toAdminPostDto(row)
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key') || isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
    }
    throw err
  }
}

export async function updatePostMeta(input: UpsertPostMetaInput, viewer?: ViewerContext): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  const id = input.id
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'post')
  const existing = await findPostMetaById(id)
  assertOwnPostOr404(existing, viewer)
  if (existing.slug !== slug) {
    const collision = await findPostMetaBySlug(slug)
    if (collision !== null && collision.id !== id) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }
    const crossCollision = await findSlugRegistryBySlug(slug)
    if (crossCollision !== null && crossCollision.entityType !== 'post') {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
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
    if (existing.slug !== slug) {
      await updateSlugRegistryByEntity({ entityType: 'post', entityId: id, slug })
    }
    if (updated === null) {
      throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
    }
    await clearPostMetasCache()
    return toAdminPostDto(updated)
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key') || isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
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
    await deleteSlugRegistryByEntity({ entityType: 'post', entityId: id })
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
    const restoredMeta = await findPostMetaById(id)
    if (restoredMeta !== null) {
      try {
        await insertSlugRegistry({ slug: restoredMeta.slug, entityType: 'post', entityId: id })
      } catch (err) {
        if (!isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
          throw err
        }
      }
    }
    await clearPostMetasCache()
    if (restoredMeta !== null && restoredMeta.published && restoredMeta.publishedRevisionId !== null) {
      const revision = await findContentById(restoredMeta.publishedRevisionId)
      if (revision !== null) {
        await indexPost(
          restoredMeta.id,
          restoredMeta.title,
          restoredMeta.summary,
          revision.body as PortableTextBody,
        ).catch((err: unknown) => {
          log.warn('index post failed', { postId: restoredMeta.id, error: err })
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
