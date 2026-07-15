import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq } from 'drizzle-orm'

import { findContentById } from '@/server/domains/content/repos/query'
import { clearContentCaches } from '@/server/domains/content/shared'
import { toAdminPostDto, type AdminPostDto } from '@/server/domains/posts/projection'
import { findPostMetaById, findPostMetaBySlugForUpdate } from '@/server/domains/posts/repos/single'
import { restorePostMeta, softDeletePostMeta, updatePostMetaById } from '@/server/domains/posts/repos/write'
import { indexPost, removePostIndex } from '@/server/domains/posts/services/search-index'
import {
  assertOwnPostOr404,
  type UpsertPostMetaInput,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { findTagNamesByPostId, setPostTags } from '@/server/infra/db/operations/post-tag'
import {
  deleteSlugRegistryByEntity,
  findSlugRegistryBySlugForUpdate,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { findTagsByNames, seedTagsIfMissing } from '@/server/infra/db/operations/tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { invalidateSearchCache } from '@/server/infra/search/search'
import { resolveSlugForTaxonomy } from '@/server/infra/slug'
import { ensureSlugLegal, resolveSlug } from '@/server/infra/slug-validation'
import { reserveSlugInTransaction } from '@/server/infra/slug/reservation'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('posts.service')

async function ensureTagsExist(db: NodePgDatabase, tagNames: string[]): Promise<void> {
  if (tagNames.length === 0) {
    return
  }
  await seedTagsIfMissing(
    db,
    tagNames.map((name) => ({ name, slug: resolveSlugForTaxonomy(undefined, name) })),
  )
}

async function resolveTagIdsForNames(db: NodePgDatabase, names: string[]): Promise<bigint[]> {
  if (names.length === 0) {
    return []
  }
  const rows = await findTagsByNames(db, names)
  const byName = new Map(rows.map((r) => [r.name, r.id]))
  return names.map((name) => byName.get(name)).filter((id): id is bigint => id !== undefined)
}

export async function createPost(
  db: NodePgDatabase,
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
  const tagNames = input.tags ?? []
  const now = new Date()
  try {
    const row = await db.transaction(async (tx) => {
      await reserveSlugInTransaction(tx, 'post', slug, undefined, {
        findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
      })
      await ensureTagsExist(tx, tagNames)
      const tagIds = await resolveTagIdsForNames(tx, tagNames)
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
          alias: input.alias ?? [],
          publishedAt: input.publishedAt ?? now,
          authorId: resolvedAuthorId,
        })
        .returning()
      await setPostTags(tx, inserted.id, tagIds)
      await insertSlugRegistry(tx, { slug, entityType: 'post', entityId: inserted.id })
      return inserted
    })
    return toAdminPostDto(row, { tags: tagNames })
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key') || isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
    }
    throw err
  }
}

export async function updatePostMeta(
  db: NodePgDatabase,
  input: UpsertPostMetaInput,
  viewer?: ViewerContext,
): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  const id = input.id
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'post')
  const tagNames = input.tags ?? []
  const existing = await findPostMetaById(db, id)
  assertOwnPostOr404(existing, viewer)
  try {
    const updated = await db.transaction(async (tx) => {
      if (existing.slug !== slug) {
        await reserveSlugInTransaction(tx, 'post', slug, id, {
          findOwnMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
        })
      }
      await ensureTagsExist(tx, tagNames)
      const tagIds = await resolveTagIdsForNames(tx, tagNames)
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
          alias: input.alias ?? existing.alias,
          publishedAt: input.publishedAt ?? existing.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(postMetaTable.id, id))
        .returning()
      await setPostTags(tx, id, tagIds)
      if (existing.slug !== slug) {
        await updateSlugRegistryByEntity(tx, { entityType: 'post', entityId: id, slug })
      }
      return result ?? null
    })
    if (updated === null) {
      throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
    }
    return toAdminPostDto(updated, { tags: tagNames })
  } catch (err) {
    if (isUniqueConstraintError(err, 'post_slug_key') || isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
    }
    throw err
  }
}

export async function deletePost(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<{ deleted: boolean }> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  const deleted = await db.transaction(async (tx) => {
    const ok = await softDeletePostMeta(tx, id)
    if (ok) {
      await removePostIndex(tx, id)
      await deleteSlugRegistryByEntity(tx, { entityType: 'post', entityId: id })
    }
    return ok
  })
  if (deleted) {
    await clearContentCaches('post', id)
    await invalidateSearchCache().catch((err: unknown) => {
      log.warn('invalidate search cache failed', { postId: id, error: err })
    })
  }
  return { deleted }
}

interface IndexablePostData {
  id: bigint
  title: string
  summary: string
  body: unknown
}

export async function restorePost(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<{ restored: boolean; warning?: string }> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  let warning: string | undefined

  // Gather everything needed for search indexing inside the transaction
  // so that if the DB restore fails we never touch the external index.
  const { restored, indexable, slugWarning } = await db.transaction(async (tx) => {
    const ok = await restorePostMeta(tx, id)
    let data: IndexablePostData | null = null
    let slugConflict: string | undefined
    if (ok) {
      const restoredMeta = await findPostMetaById(tx, id)
      if (restoredMeta !== null) {
        const existing = await findSlugRegistryBySlugForUpdate(tx, restoredMeta.slug)
        if (existing !== null && !(existing.entityType === 'post' && existing.entityId === id)) {
          const otherEntity = existing.entityType === 'page' ? '页面' : '文章'
          slugConflict = `slug "${restoredMeta.slug}" 已被另一个${otherEntity}占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。`
        } else {
          try {
            await insertSlugRegistry(tx, { slug: restoredMeta.slug, entityType: 'post', entityId: id })
          } catch (err) {
            if (!isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
              throw err
            }
            slugConflict = `slug "${restoredMeta.slug}" 在恢复过程中被其它内容占用，URL 不会指向此文章。`
          }
        }
        if (restoredMeta.published && restoredMeta.publishedRevisionId !== null) {
          const revision = await findContentById(tx, restoredMeta.publishedRevisionId)
          if (revision !== null) {
            data = {
              id: restoredMeta.id,
              title: restoredMeta.title,
              summary: restoredMeta.summary,
              body: revision.body,
            }
          }
        }
      }
    }
    return { restored: ok, indexable: data, slugWarning: slugConflict }
  })

  if (restored) {
    await clearContentCaches('post', id)
    await invalidateSearchCache().catch((err: unknown) => {
      log.warn('invalidate search cache failed', { postId: id, error: err })
    })
    if (indexable !== null) {
      const bodyResult = portableTextBodySchema.safeParse(indexable.body)
      if (bodyResult.success) {
        try {
          await indexPost(db, indexable.id, indexable.title, indexable.summary, bodyResult.data)
        } catch (err: unknown) {
          log.warn('index post failed', { postId: indexable.id, error: err })
          const indexWarning = '搜索索引更新失败，该文章可能不会出现在搜索结果中。'
          warning = warning !== undefined ? `${warning} ${indexWarning}` : indexWarning
        }
      } else {
        // Corrupt JSONB (e.g. a direct INSERT) — the post is restored but
        // would silently never be indexed without this log.
        log.warn('restore post: body validation failed, skipping search index', {
          postId: id.toString(),
          error: bodyResult.error.message,
        })
      }
    }
  }
  if (slugWarning !== undefined) {
    warning = warning !== undefined ? `${slugWarning} ${warning}` : slugWarning
  }
  return { restored, warning }
}

export async function unpublishPost(db: NodePgDatabase, id: bigint, viewer?: ViewerContext): Promise<AdminPostDto> {
  const existing = await findPostMetaById(db, id)
  assertOwnPostOr404(existing, viewer)
  const [updated, tags] = await Promise.all([
    updatePostMetaById(db, id, { published: false }),
    findTagNamesByPostId(db, id),
  ])
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
  }
  await clearContentCaches('post', id)
  await invalidateSearchCache().catch((err: unknown) => {
    log.warn('invalidate search cache failed', { postId: id, error: err })
  })
  await removePostIndex(db, id).catch((err: unknown) => {
    log.warn('remove post index failed', { postId: id, error: err })
  })
  return toAdminPostDto(updated, { tags })
}
