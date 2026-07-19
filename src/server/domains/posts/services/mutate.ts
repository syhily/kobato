import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq } from 'drizzle-orm'

import { findContentById } from '@/server/domains/content/repos/query'
import { clearContentCaches } from '@/server/domains/content/shared'
import { rethrowSlugConflict } from '@/server/domains/content/slug-conflict'
import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import { toAdminPostDto, type AdminPostDto } from '@/server/domains/posts/projection'
import { findPostMetaById, findPostMetaBySlugForUpdate } from '@/server/domains/posts/repos/single'
import { restorePostMeta, softDeletePostMeta, updatePostMetaById } from '@/server/domains/posts/repos/write'
import { indexPost, removePostIndex } from '@/server/domains/posts/services/search-index'
import {
  assertOwnPostOr404,
  type UpsertPostMetaInput,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { findCategoryById } from '@/server/infra/db/operations/category'
import { findTagNamesByPostId, setPostTags } from '@/server/infra/db/operations/post-tag'
import {
  deleteSlugRegistryByEntity,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { findTagsByNames, seedTagsIfMissing } from '@/server/infra/db/operations/tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
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
  // Pre-flight the referenced category so a stale admin select fails with
  // a 400 instead of tripping the FK mid-transaction.
  const categoryRow = input.categoryId != null ? await findCategoryById(db, input.categoryId) : null
  if (input.categoryId != null && categoryRow === null) {
    throw new DomainError('BAD_REQUEST', '分类不存在')
  }
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
          categoryId: input.categoryId ?? null,
          alias: input.alias ?? [],
          publishedAt: input.publishedAt ?? now,
          authorId: resolvedAuthorId,
        })
        .returning()
      await setPostTags(tx, inserted.id, tagIds)
      await insertSlugRegistry(tx, { slug, entityType: 'post', entityId: inserted.id })
      return inserted
    })
    return toAdminPostDto(row, { tags: tagNames, categoryName: categoryRow?.name ?? '' })
  } catch (err) {
    rethrowSlugConflict(err, 'post', slug)
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
  // Same pre-flight as createPost, but only when a NEW non-null id
  // arrives — an untouched or explicitly cleared reference needs no lookup.
  const categoryRow = input.categoryId != null ? await findCategoryById(db, input.categoryId) : null
  if (input.categoryId != null && categoryRow === null) {
    throw new DomainError('BAD_REQUEST', '分类不存在')
  }
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
          categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
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
    let categoryName = categoryRow?.name ?? ''
    if (categoryRow === null && input.categoryId === undefined && existing.categoryId !== null) {
      const existingCategory = await findCategoryById(db, existing.categoryId)
      categoryName = existingCategory?.name ?? ''
    }
    return toAdminPostDto(updated, { tags: tagNames, categoryName })
  } catch (err) {
    rethrowSlugConflict(err, 'post', slug)
  }
}

interface IndexablePostData {
  id: bigint
  title: string
  summary: string
  body: unknown
}

/**
 * Side effects after a post state change (delete / restore / unpublish):
 * clear content caches, invalidate the search cache, then apply the
 * search-index change selected by `index` — 'remove' drops the index row
 * (unpublish), an IndexablePostData re-indexes (restore) and yields the
 * Chinese warning when the write fails, undefined/null leaves the index
 * alone (delete already removed the row inside its transaction).
 */
async function afterPostStateChange(
  db: NodePgDatabase,
  id: bigint,
  options: { index?: IndexablePostData | null | 'remove' } = {},
): Promise<string | undefined> {
  await clearContentCaches('post', id)
  await invalidateSearchCache()
  const { index } = options
  if (index === 'remove') {
    await removePostIndex(db, id).catch((err: unknown) => {
      log.warn('remove post index failed', { postId: id, error: err })
    })
    return undefined
  }
  if (index !== undefined && index !== null) {
    const bodyResult = portableTextBodySchema.safeParse(index.body)
    if (bodyResult.success) {
      try {
        await indexPost(db, index.id, index.title, index.summary, bodyResult.data)
      } catch (err: unknown) {
        log.warn('index post failed', { postId: index.id, error: err })
        return '搜索索引更新失败，该文章可能不会出现在搜索结果中。'
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
  return undefined
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
    await afterPostStateChange(db, id)
  }
  return { deleted }
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
        slugConflict = await reclaimSlugOnRestore(tx, 'post', id, restoredMeta.slug)
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
    warning = await afterPostStateChange(db, id, { index: indexable })
  }
  if (slugWarning !== undefined) {
    warning = warning !== undefined ? `${slugWarning} ${warning}` : slugWarning
  }
  return { restored, warning }
}

export async function unpublishPost(db: NodePgDatabase, id: bigint, viewer?: ViewerContext): Promise<AdminPostDto> {
  const existing = await findPostMetaById(db, id)
  assertOwnPostOr404(existing, viewer)
  const [updated, tags, categoryRow] = await Promise.all([
    updatePostMetaById(db, id, { published: false }),
    findTagNamesByPostId(db, id),
    existing.categoryId === null ? Promise.resolve(null) : findCategoryById(db, existing.categoryId),
  ])
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
  }
  await afterPostStateChange(db, id, { index: 'remove' })
  return toAdminPostDto(updated, { tags, categoryName: categoryRow?.name ?? '' })
}
