import type { MetaEntityDescriptor } from '@/server/domains/content/entities/descriptor'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow, NewPostMeta, PostMetaRow } from '@/server/infra/db/types'
import type { AdminPostDto } from '@/shared/contracts/posts'
import type { Post } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@/server/domains/content/render-warmup'
import { findContentById } from '@/server/domains/content/revisions'
import { isLive, isPromoted } from '@/server/domains/content/schemas/live-gate'
import { toAdminPostDto, toCmsPost } from '@/server/domains/posts/projection'
import { runPostPublishHooks } from '@/server/domains/posts/publish-hooks'
import {
  insertPostMeta,
  restorePostMeta,
  softDeletePostMeta,
  updatePostMetaById,
} from '@/server/domains/posts/repos/write'
import { indexPost, indexPostFromRevision, removePostIndex } from '@/server/domains/posts/services/search-index'
import { assertOwnPostOr404, type PostMetaWriteInput } from '@/server/domains/posts/services/shared'
import {
  findPostMetaById,
  findPostMetaBySlug,
  findPostMetaBySlugForUpdate,
  findPublicPostMetaBySlug,
} from '@/server/domains/posts/services/single'
import { findCategoryById, findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostId, findTagNamesByPostIds, setPostTags } from '@/server/infra/db/operations/post-tag'
import { findTagsByNames, seedTagsIfMissing } from '@/server/infra/db/operations/tag'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { computeBodyText } from '@/server/infra/pt/lexical-projection'
import { resolveSlug } from '@/server/infra/slug/resolve'
import { idFromString } from '@/shared/utils/id'
import { hasAtLeast } from '@/shared/utils/roles'

const log = getLogger('posts.service')

export interface PostAdminExtras {
  tags: string[]
  categoryName: string
}

/** Everything the search re-index needs, gathered inside the restore transaction. */
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

const INDEX_FAILURE_WARNING = '搜索索引更新失败，该文章可能不会出现在搜索结果中。'

/**
 * The post entity: RBAC ownership, author+ draft preview, tag/category
 * relations, visible/pinned/alias columns, search-index side effects;
 * the body lifecycle and meta CRUD skeleton come from `content/entities/*`.
 */
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
  label: '文章',
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
    canPreviewDraft: (role) => hasAtLeast(role, 'author'),
    scopeListFilters: (filters, viewer) =>
      viewer.role !== 'admin' ? { ...filters, authorId: idFromString(viewer.id) } : filters,
  },
  audit: { loggerScope: 'audit.cms.posts', metaIdKey: 'postMetaId' },
  preview: {
    project: (meta, revision) => toCmsPost(meta, revision),
    async afterPublish(db, meta, body, warnings) {
      invalidateContent(db, { entity: 'post' })
      // Warm the OG card + today's calendar ahead of a crawler's first scan.
      warmContentRenderCaches(db, {
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
      // Cross-domain extensions run through the seam — see `posts/publish-hooks.ts`.
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
        throw new DomainError('BAD_REQUEST', '分类不存在')
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
      invalidateContent(db, { entity: 'post' })
      // Re-warm live rows' OG card + calendar under the NEW render inputs; others skip.
      if (isLive(meta)) {
        warmContentRenderCaches(db, {
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
            // Legacy PortableText row (pre-R9a) — the R15 backfill re-derives the index.
            log.warn('update post: published revision is a legacy PT row, skipping search re-index', {
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
      invalidateContent(db, { entity: 'post' })
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
          // Legacy PortableText row (pre-R9a) — restored but indexed only after the R15 backfill.
          log.warn('restore post: published revision is a legacy PT row, skipping search index', {
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
