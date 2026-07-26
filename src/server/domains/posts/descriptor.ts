import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { MetaEntityDescriptor } from '@/server/domains/content/entities/descriptor'
import type { NewPostMeta, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { findContentById } from '@/server/domains/content/revisions'
import { isPromoted } from '@/server/domains/content/schemas/live-gate'
import { toAdminPostDto, toCmsPost, type AdminPostDto } from '@/server/domains/posts/projection'
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
import { resolveSlugForTaxonomy } from '@/server/infra/slug'
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
  id: bigint
  title: string
  summary: string
  body: unknown
}

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

async function resolveCategoryName(db: NodePgDatabase, categoryId: bigint | null): Promise<string> {
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
      await invalidateContent(db, { entity: 'post' })
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
          rows.map((row) => row.categoryId).filter((id): id is bigint => id !== null),
        ),
      ])
      return new Map(
        rows.map((row) => [
          row.id,
          {
            tags: tagMap.get(row.id) ?? [],
            categoryName: categoryMap.get(row.categoryId ?? -1n) ?? '',
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
      pinnedAt: input.pinnedAt === undefined ? existing.pinnedAt : input.pinnedAt,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      alias: input.alias ?? existing.alias,
    }),
    async syncRelations(tx, metaId, input) {
      const tagNames = input.tags ?? []
      await ensureTagsExist(tx, tagNames)
      const tagIds = await resolveTagIdsForNames(tx, tagNames)
      await setPostTags(tx, metaId, tagIds)
    },
    // The index row goes inside the delete transaction so a rolled-back
    // delete never loses it.
    async deleteRelations(tx, metaId) {
      await removePostIndex(tx, metaId)
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
      // surface; only the lifecycle flips invalidate. Publishing already
      // invalidated through `preview.afterPublish`.
      if (event === 'create' || event === 'update') {
        return
      }
      await invalidateContent(db, { entity: 'post' })
      if (event === 'unpublish') {
        await removePostIndex(db, meta.id).catch((err: unknown) => {
          log.warn('remove post index failed', { postId: meta.id, error: err })
        })
      }
    },
    async prepareRestore(tx, meta) {
      if (!isPromoted(meta)) {
        return null
      }
      const revision = await findContentById(tx, meta.publishedRevisionId)
      if (revision === null) {
        return null
      }
      return { id: meta.id, title: meta.title, summary: meta.summary, body: revision.body }
    },
    async afterRestore(db, indexable) {
      await invalidateContent(db, { entity: 'post' })
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
