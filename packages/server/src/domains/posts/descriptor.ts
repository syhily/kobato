import type { ErrorMessageDescriptor } from '@kobato/api/contracts/api-error'
import type { AdminPostDto } from '@kobato/api/contracts/posts'
import type { Post } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/database'
import type { ContentRow, NewPostMeta, PostMetaRow } from '@kobato/db/types'
import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor'

import { hasAtLeast } from '@kobato/auth/roles'
import { findCategoryById, findCategoryNamesByIds } from '@kobato/db/operations/category'
import {
  findEntityMetaById,
  findEntityMetaBySlug,
  findPublicEntityMetaBySlug,
  insertEntityMeta,
  restoreEntityMeta,
  softDeleteEntityMeta,
  updateEntityMetaById,
} from '@kobato/db/operations/entity-meta'
import { findContentById } from '@kobato/db/operations/entity-revision'
import { removePostSearchIndex } from '@kobato/db/operations/post-search'
import { findTagNamesByPostId, findTagNamesByPostIds } from '@kobato/db/operations/post-tag'
import { canEditPost } from '@kobato/server/domains/auth/rbac'
import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { isLive, isPromoted } from '@kobato/server/domains/content/schemas/live-gate'
import { toAdminPostDto, toCmsPost } from '@kobato/server/domains/posts/projection'
import { runPostPublishHooks } from '@kobato/server/domains/posts/publish-hooks'
import { indexPost, indexPostFromRevision } from '@kobato/server/domains/posts/services/search-index'
import { assertOwnPostOr404, type PostMetaWriteInput } from '@kobato/server/domains/posts/services/shared'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { computeBodyText } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger } from '@kobato/server/infra/logger'
import { resolveSlug } from '@kobato/server/infra/slug/resolve'
import { idFromString } from '@kobato/utils/id'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
    findMetaById: (db, id) => unsafeCast<PostMetaRow | null>(findEntityMetaById(db, 'post', id)),
    findMetaBySlug: (db, slug) => unsafeCast<PostMetaRow | null>(findEntityMetaBySlug(db, 'post', slug)),
    findMetaBySlugForUpdate: (db, slug) => unsafeCast<PostMetaRow | null>(findEntityMetaBySlug(db, 'post', slug)),
    findPublicMetaBySlug: (db, slug) => unsafeCast<PostMetaRow | null>(findPublicEntityMetaBySlug(db, 'post', slug)),
    insertMeta: (db, values) => unsafeCast<PostMetaRow>(insertEntityMeta(db, 'post', values)),
    updateMetaById: (db, id, patch) => unsafeCast<PostMetaRow | null>(updateEntityMetaById(db, 'post', id, patch)),
    softDeleteMeta: (db, id) => softDeleteEntityMeta(db, 'post', id),
    restoreMeta: (db, id) => restoreEntityMeta(db, 'post', id),
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
      warmContentRenderCaches({
        slug: meta.slug,
        title: meta.title,
        summary: meta.summary,
        cover: meta.cover,
      })
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
      pinnedAt:
        input.pinnedAt === undefined
          ? existing.pinnedAt
          : input.pinnedAt === null
            ? null
            : (existing.pinnedAt ?? input.pinnedAt),
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      alias: input.alias ?? existing.alias,
    }),
    tagSeedsFor(input) {
      return (input.tags ?? []).map((name) => ({ name, slug: resolveSlug(undefined, name, { entity: 'taxonomy' }) }))
    },
    async mutationExtras(db, meta, source) {
      const [tags, categoryName] = await Promise.all([
        source.kind === 'upsert' ? Promise.resolve(source.input.tags ?? []) : findTagNamesByPostId(db, meta.id),
        resolveCategoryName(db, meta.categoryId),
      ])
      return { tags, categoryName }
    },
    async afterMutation(db, meta, event) {
      if ((event === 'create' || event === 'update') && !isPromoted(meta)) {
        return
      }
      invalidateContent({ entity: 'post' })
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
          removePostSearchIndex(db, meta.id)
        } catch (err: unknown) {
          log.warn('remove post index failed', { postId: meta.id, error: err })
        }
        return
      }
      if (event === 'update' && isPromoted(meta)) {
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
    buildRestoreContext(result) {
      if (result.meta === null || !isPromoted(result.meta) || result.publishedRevision === null) {
        return null
      }
      const meta = unsafeCast<PostMetaRow>(result.meta)
      return { id: meta.id, title: meta.title, summary: meta.summary, revision: result.publishedRevision }
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
