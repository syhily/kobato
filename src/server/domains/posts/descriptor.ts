import type { MetaEntityDescriptor } from '@/server/domains/content/entities/descriptor'
import type { Database } from '@/server/infra/db/database'
import type { NewPostMeta, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@/server/domains/content/render-warmup'
import { findContentById } from '@/server/domains/content/revisions'
import { isLive, isPromoted } from '@/server/domains/content/schemas/live-gate'
import { toAdminPostDto, toCmsPost, type AdminPostDto } from '@/server/domains/posts/projection'
import { runPostPublishHooks } from '@/server/domains/posts/publish-hooks'
import {
  insertPostMeta,
  restorePostMeta,
  softDeletePostMeta,
  updatePostMetaById,
} from '@/server/domains/posts/repos/write'
import { indexPost, removePostIndex } from '@/server/domains/posts/services/search-index'
import { assertOwnPostOr404, type UpsertPostMetaInput } from '@/server/domains/posts/services/shared'
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
import { resolveSlug } from '@/server/infra/slug/resolve'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { idFromString } from '@/shared/utils/id'
import { hasAtLeast } from '@/shared/utils/roles'

const log = getLogger('posts.service')

/** Tag + category names the admin DTO carries beyond the shared fields. */
export interface PostAdminExtras {
  tags: string[]
  categoryName: string
}

/** Everything the search re-index needs, gathered inside the restore transaction. */
interface IndexablePostData {
  id: number
  title: string
  summary: string
  body: unknown
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
 * The post entity: RBAC ownership gate, author+ draft preview,
 * tag/category relations, visible/pinned/alias columns, and the
 * search-index side effects. Everything else — the body lifecycle and
 * the meta CRUD/mutation skeleton — comes from the generic
 * implementations this descriptor feeds (`content/entities/*`).
 */
export const postDescriptor: MetaEntityDescriptor<
  PostMetaRow,
  NewPostMeta,
  UpsertPostMetaInput,
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
      // Warm the OG card + today's calendar so a crawler's first scan of
      // the fresh post hits a filled bucket instead of a cold render.
      warmContentRenderCaches(db, {
        slug: meta.slug,
        title: meta.title,
        summary: meta.summary,
        cover: meta.cover,
      })
      // Index the canonical body already in scope rather than re-reading the
      // row from the DB: `body` is freshly canonicalized + prerendered, so it
      // matches what `publishLatestRevision` persisted — a re-read would only
      // cost a round-trip and reintroduce a validation gap (raw JSONB).
      try {
        await indexPost(db, meta.id, meta.title, meta.summary, body)
      } catch (err: unknown) {
        log.warn('index post failed', { postId: meta.id, error: err })
        warnings.push(INDEX_FAILURE_WARNING)
      }
      // Cross-domain extensions (Webmention outbox enqueue) run through
      // the seam — see `posts/publish-hooks.ts`.
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
    // Pre-flight the referenced category so a stale admin select fails with
    // a 400 instead of tripping the FK mid-transaction.
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
      // The editor maps its `pinned` boolean to a FRESH stamp on every
      // meta save, so a non-null input means "pinned", not "pin at this
      // instant" — keep the original stamp on an already-pinned post or
      // every unrelated edit would reshuffle the pinned/featured order.
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
    // The index row goes inside the delete transaction so a rolled-back
    // delete never loses it.
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
      // create/update of a (still unpublished) post changes no public
      // surface; publishing already invalidated through `preview.afterPublish`.
      if ((event === 'create' || event === 'update') && !isPromoted(meta)) {
        return
      }
      // A meta update on a PUBLISHED post (title/summary/tags/cover/
      // visibility) reaches the public surface immediately — invalidate
      // like a lifecycle flip, otherwise feed/sitemap/taxonomy lists stay
      // stale for their TTLs and search for its full counter window.
      invalidateContent(db, { entity: 'post' })
      // Live rows get their OG card + today's calendar re-warmed under
      // the NEW render inputs (the OG key folds title/summary/cover, so
      // an edit is always a fresh key a crawler would otherwise render
      // cold). Deletes/unpublishes fail the live gate and skip.
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
        // Re-index from the persisted published revision: the body did not
        // change, but title/summary search hits did (the search corpus is
        // otherwise rebuilt only on publish/restore).
        const revision = findContentById(db, meta.publishedRevisionId)
        if (revision === null) {
          return
        }
        const bodyResult = portableTextBodySchema.safeParse(revision.body)
        if (!bodyResult.success) {
          log.warn('update post: published revision body validation failed, skipping search re-index', {
            postId: meta.id.toString(),
            error: bodyResult.error.message,
          })
          return
        }
        try {
          await indexPost(db, meta.id, meta.title, meta.summary, bodyResult.data)
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
      return { id: meta.id, title: meta.title, summary: meta.summary, body: revision.body }
    },
    async afterRestore(db, indexable) {
      invalidateContent(db, { entity: 'post' })
      if (indexable === null) {
        return undefined
      }
      const bodyResult = portableTextBodySchema.safeParse(indexable.body)
      if (!bodyResult.success) {
        // Corrupt JSONB (e.g. a direct INSERT) — the post is restored but
        // would silently never be indexed without this log.
        log.warn('restore post: body validation failed, skipping search index', {
          postId: indexable.id.toString(),
          error: bodyResult.error.message,
        })
        return undefined
      }
      try {
        await indexPost(db, indexable.id, indexable.title, indexable.summary, bodyResult.data)
      } catch (err: unknown) {
        log.warn('index post failed', { postId: indexable.id, error: err })
        return INDEX_FAILURE_WARNING
      }
      return undefined
    },
  },
}
