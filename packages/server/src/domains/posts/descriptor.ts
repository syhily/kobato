import type { Post } from '@kobato/catalog/model.ts'
import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { AdminPostDto } from '@kobato/contracts/posts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { ContentRow, NewPostMeta, PostMetaRow } from '@kobato/db/types.ts'
import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor.ts'

import { hasAtLeast } from '@kobato/auth/roles.ts'
import { findCategoryById, findCategoryNamesByIds } from '@kobato/db/operations/category.ts'
import { findTagNamesByPostId, findTagNamesByPostIds, setPostTags } from '@kobato/db/operations/post-tag.ts'
import { findTagsByNames, seedTagsIfMissing } from '@kobato/db/operations/tag.ts'
import { canEditPost } from '@kobato/server/domains/auth/rbac.ts'
import { invalidateContent } from '@kobato/server/domains/content/invalidate.ts'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup.ts'
import { findContentById } from '@kobato/server/domains/content/revisions.ts'
import { isLive, isPromoted } from '@kobato/server/domains/content/schemas/live-gate.ts'
import { toAdminPostDto, toCmsPost } from '@kobato/server/domains/posts/projection.ts'
import { runPostPublishHooks } from '@kobato/server/domains/posts/publish-hooks.ts'
import {
  insertPostMeta,
  restorePostMeta,
  softDeletePostMeta,
  updatePostMetaById,
} from '@kobato/server/domains/posts/repos/write.ts'
import {
  indexPost,
  indexPostFromRevision,
  removePostIndex,
} from '@kobato/server/domains/posts/services/search-index.ts'
import { assertOwnPostOr404, type PostMetaWriteInput } from '@kobato/server/domains/posts/services/shared.ts'
import {
  findPostMetaById,
  findPostMetaBySlug,
  findPostMetaBySlugForUpdate,
  findPublicPostMetaBySlug,
} from '@kobato/server/domains/posts/services/single.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { computeBodyText } from '@kobato/server/infra/lexical/lexical-projection.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { resolveSlug } from '@kobato/server/infra/slug/resolve.ts'
import { idFromString } from '@kobato/utils/id.ts'

const log = getLogger('posts.service')

export interface PostAdminExtras {
  tags: string[]
  categoryName: string
}

interface IndexablePostData {
  id: number
  title: string
  summary: string
  revision: ContentRow
}

// Sync (node:sqlite): called inside the upsert transaction.
function ensureTagsExist(db: Database, tagNames: string[]): void {
  if (tagNames.length === 0) {
    return
  }
  seedTagsIfMissing(
    db,
    tagNames.map((name) => ({ name, slug: resolveSlug(undefined, name, { entity: 'taxonomy' }) })),
  )
}

// Sync (node:sqlite): called inside the upsert transaction.
function resolveTagIdsForNames(db: Database, names: string[]): number[] {
  if (names.length === 0) {
    return []
  }
  const rows = findTagsByNames(db, names)
  const byName = new Map(rows.map((r) => [r.name, r.id]))
  return names.map((name) => byName.get(name)).filter((id): id is number => id !== undefined)
}

async function resolveCategoryName(db: Database, categoryId: number | null): Promise<string> {
  if (categoryId === null) {
    return ''
  }
  const map = await findCategoryNamesByIds(db, [categoryId])
  return map.get(categoryId) ?? ''
}

const INDEX_FAILURE_WARNING = {
  messageKey: 'content.warning.searchIndexFailed',
  fallbackMessage: 'The search index update failed; this post may not appear in search results.',
} as const satisfies ErrorMessageDescriptor

export const postDescriptor: MetaEntityDescriptor<
  PostMetaRow,
  NewPostMeta,
  PostMetaWriteInput,
  PostAdminExtras,
  AdminPostDto,
  Post,
  IndexablePostData | null
> = {
  entityType: 'post',
  repos: {
    findMetaById: findPostMetaById,
    findMetaBySlug: findPostMetaBySlug,
    findMetaBySlugForUpdate: findPostMetaBySlugForUpdate,
    findPublicMetaBySlug: findPublicPostMetaBySlug,
    insertMeta: insertPostMeta,
    updateMetaById: updatePostMetaById,
    softDeleteMeta: softDeletePostMeta,
    restoreMeta: restorePostMeta,
  },
  defaultAdminListLimit: 20,
  access: {
    assertAccess: assertOwnPostOr404,
    canPreviewDraft: (viewer, meta) =>
      viewer !== undefined && hasAtLeast(viewer.role, 'author') && canEditPost(viewer, meta),
    scopeListFilters: (filters, viewer) =>
      viewer.role !== 'admin' ? { ...filters, authorId: idFromString(viewer.id) } : filters,
  },
  audit: { loggerScope: 'audit.cms.posts', metaIdKey: 'postMetaId' },
  preview: {
    project: (meta, revision) => toCmsPost(meta, revision),
    async afterPublish(db, meta, body, warnings) {
      invalidateContent({ entity: 'post' })
      // Warm the OG card + today's calendar ahead of a crawler's first scan.
      warmContentRenderCaches({
        slug: meta.slug,
        title: meta.title,
        summary: meta.summary,
        cover: meta.cover,
      })
      // Index the in-scope `body` — freshly canonicalized; the plain-text
      // corpus is its `body_text` projection leg (recomputed here so the
      // indexer never depends on the column write having landed).
      try {
        await indexPost(db, meta.id, meta.title, meta.summary, computeBodyText(body))
      } catch (err: unknown) {
        log.warn('index post failed', { postId: meta.id, error: err })
        warnings.push(INDEX_FAILURE_WARNING)
      }
      await runPostPublishHooks(db, meta, body, warnings)
    },
  },
  adminDto: {
    project: toAdminPostDto,
    async loadListExtras(db, rows) {
      const [tagMap, categoryMap] = await Promise.all([
        findTagNamesByPostIds(
          db,
          rows.map((row) => row.id),
        ),
        findCategoryNamesByIds(
          db,
          rows.map((row) => row.categoryId).filter((id): id is number => id !== null),
        ),
      ])
      return new Map(
        rows.map((row) => [
          row.id,
          {
            tags: tagMap.get(row.id) ?? [],
            categoryName: categoryMap.get(row.categoryId ?? -1) ?? '',
          },
        ]),
      )
    },
    async loadDetailExtras(db, meta) {
      const [tags, categoryName] = await Promise.all([
        findTagNamesByPostId(db, meta.id),
        resolveCategoryName(db, meta.categoryId),
      ])
      return { tags, categoryName }
    },
  },
  mutations: {
    resolveAuthorId: (authorId, viewer) => (viewer && viewer.role !== 'admin' ? idFromString(viewer.id) : authorId),
    // Pre-flight the category so a stale select 400s instead of tripping the FK mid-transaction.
    async preflightUpsert(db, input) {
      if (input.categoryId != null && (await findCategoryById(db, input.categoryId)) === null) {
        throw new DomainError('BAD_REQUEST', descriptorFor('content.error.categoryNotFound'))
      }
    },
    insertExtras: (input) => ({
      visible: input.visible ?? true,
      pinnedAt: input.pinnedAt === undefined ? null : input.pinnedAt,
      categoryId: input.categoryId ?? null,
      alias: input.alias ?? [],
    }),
    updateExtras: (input, existing) => ({
      visible: input.visible ?? existing.visible,
      // The editor sends a fresh stamp on every save — keep the original on an already-pinned post.
      pinnedAt:
        input.pinnedAt === undefined
          ? existing.pinnedAt
          : input.pinnedAt === null
            ? null
            : (existing.pinnedAt ?? input.pinnedAt),
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      alias: input.alias ?? existing.alias,
    }),
    syncRelations(tx, metaId, input) {
      const tagNames = input.tags ?? []
      ensureTagsExist(tx, tagNames)
      const tagIds = resolveTagIdsForNames(tx, tagNames)
      setPostTags(tx, metaId, tagIds)
    },
    // The index row is deleted in-transaction so a rollback never loses it.
    deleteRelations(tx, metaId) {
      removePostIndex(tx, metaId)
    },
    async mutationExtras(db, meta, source) {
      const [tags, categoryName] = await Promise.all([
        source.kind === 'upsert' ? Promise.resolve(source.input.tags ?? []) : findTagNamesByPostId(db, meta.id),
        resolveCategoryName(db, meta.categoryId),
      ])
      return { tags, categoryName }
    },
    async afterMutation(db, meta, event) {
      // An unpublished create/update changes no public surface; publish already invalidated.
      if ((event === 'create' || event === 'update') && !isPromoted(meta)) {
        return
      }
      // A published post's meta update reaches the public surface immediately — invalidate now.
      invalidateContent({ entity: 'post' })
      // Re-warm live rows' OG card + calendar under the NEW render inputs; others skip.
      if (isLive(meta)) {
        warmContentRenderCaches({
          slug: meta.slug,
          title: meta.title,
          summary: meta.summary,
          cover: meta.cover,
        })
      }
      if (event === 'unpublish') {
        try {
          removePostIndex(db, meta.id)
        } catch (err: unknown) {
          log.warn('remove post index failed', { postId: meta.id, error: err })
        }
        return
      }
      if (event === 'update' && isPromoted(meta)) {
        // Body unchanged — re-index from the persisted revision for title/summary hits.
        const revision = findContentById(db, meta.publishedRevisionId)
        if (revision === null) {
          return
        }
        try {
          const indexed = await indexPostFromRevision(db, meta.id, meta.title, meta.summary, revision)
          if (!indexed) {
            log.warn('update post: published revision body is not a Lexical state, skipping search re-index', {
              postId: meta.id.toString(),
            })
          }
        } catch (err: unknown) {
          log.warn('index post failed', { postId: meta.id, error: err })
        }
      }
    },
    prepareRestore(tx, meta) {
      if (!isPromoted(meta)) {
        return null
      }
      const revision = findContentById(tx, meta.publishedRevisionId)
      if (revision === null) {
        return null
      }
      return { id: meta.id, title: meta.title, summary: meta.summary, revision }
    },
    async afterRestore(db, indexable) {
      invalidateContent({ entity: 'post' })
      if (indexable === null) {
        return undefined
      }
      try {
        const indexed = await indexPostFromRevision(
          db,
          indexable.id,
          indexable.title,
          indexable.summary,
          indexable.revision,
        )
        if (!indexed) {
          log.warn('restore post: published revision body is not a Lexical state, skipping search index', {
            postId: indexable.id.toString(),
          })
        }
      } catch (err: unknown) {
        log.warn('index post failed', { postId: indexable.id, error: err })
        return INDEX_FAILURE_WARNING
      }
      return undefined
    },
  },
}
