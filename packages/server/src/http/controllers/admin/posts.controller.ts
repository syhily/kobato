import { adminPostsContract } from '@kobato/api/admin/posts'
import { findTagNamesByPostId } from '@kobato/db/operations/post-tag'
import { getAnalyticsReader } from '@kobato/server/bootstrap/analytics-lifecycle'
import { loadAnalyticsOverview } from '@kobato/server/domains/analytics/services/overview'
import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-input'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { toAdminPostDto } from '@kobato/server/domains/posts/projection'
import {
  countPostMetas,
  getPostDetailForAdmin,
  listPostMetas,
  listPostsForAdmin,
  listRevisionsForAdmin as listPostRevisionsForAdmin,
} from '@kobato/server/domains/posts/services/admin-query'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@kobato/server/domains/posts/services/mutate'
import { assertOwnPostOr404 } from '@kobato/server/domains/posts/services/shared'
import { findPostMetaById } from '@kobato/server/domains/posts/services/single'
import { makeRevisionRouter } from '@kobato/server/http/controllers/admin/revision-shared'
import { implementAuthor, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { formatWarningDescriptors } from '@kobato/server/http/translate-domain-error'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { idFromString } from '@kobato/utils/id'

const RECENT_DRAFTS_LIMIT = 5
const RECENT_PUBLISHED_LIMIT = 5

const impl = implementAuthor(adminPostsContract)

const list = impl.list.handler(({ input, context }) => listPostsForAdmin(context.db, input, context.viewer))

const get = impl.get.handler(({ input, context }) =>
  getPostDetailForAdmin(context.db, idFromString(input.id), context.viewer),
)

const remove = impl.delete.handler(async ({ input, context }) => {
  const result = await deletePost(context.db, idFromString(input.id), context.viewer)
  if (!result.deleted) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'content.error.entityNotFound', { entity: 'post' })
  }
  recordAuditEventFromContext(context, {
    action: 'post_deleted',
    resourceType: 'post',
    resourceId: input.id,
  })
})

const restore = impl.restore.handler(async ({ input, context }) => {
  const result = await restorePost(context.db, idFromString(input.id), context.viewer)
  if (!result.restored) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'content.error.entityNotDeleted', { entity: 'post' })
  }
  recordAuditEventFromContext(context, {
    action: 'post_restored',
    resourceType: 'post',
    resourceId: input.id,
  })
  return {
    success: true,
    warning: formatWarningDescriptors(
      result.warningDescriptors ?? [],
      createServerTranslator(context.localization.locale),
    ),
  }
})

const unpublish = impl.unpublish.handler(async ({ input, context }) => {
  const post = await unpublishPost(context.db, idFromString(input.id), context.viewer)
  recordAuditEventFromContext(context, {
    action: 'post_unpublished',
    resourceType: 'post',
    resourceId: input.id,
  })
  return { post }
})

const { saveDraft, publishLatest } = makeRevisionRouter({
  impl,
  adapter: postLifecycleAdapter,
  audit: {
    resourceType: 'post',
    draftSavedAction: 'post_draft_saved',
    publishedAction: 'post_published',
  },
  passViewerToSaveBody: true,
})

const upsertMeta = impl.upsertMeta.handler(async ({ input, context }) => {
  const meta = {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    cover: input.cover,
    og: input.og,
    published: input.published,
    commentsEnabled: input.commentsEnabled,
    webmentionsEnabled: input.webmentionsEnabled,
    showToc: input.showToc,
    showUpdated: input.showUpdated,
    contentLanguage: input.contentLanguage,
    visible: input.visible,
    categoryId: input.categoryId,
    tags: input.tags,
    alias: input.alias,
    pinnedAt: input.pinnedAt === undefined || input.pinnedAt === null ? input.pinnedAt : new Date(input.pinnedAt),
    publishedAt:
      input.publishedAt === undefined || input.publishedAt === null ? input.publishedAt : new Date(input.publishedAt),
  }
  const sessionUserId = idFromString(context.viewer.id)
  const post =
    input.id === undefined
      ? await createPost(context.db, meta, sessionUserId, context.viewer)
      : await updatePostMeta(context.db, { id: idFromString(input.id), ...meta }, context.viewer)
  recordAuditEventFromContext(context, {
    action: input.id === undefined ? 'post_created' : 'post_meta_updated',
    resourceType: 'post',
    resourceId: post.id,
  })
  return { post }
})

const listRevisions = impl.listRevisions.handler(async ({ input, context }) => {
  const revisions = await listPostRevisionsForAdmin(context.db, idFromString(input.id), context.viewer)
  return { revisions }
})

const mySummary = impl.mySummary.handler(async ({ context }) => {
  const authorId = idFromString(context.viewer.id)
  const [draftCount, publishedCount, recentDraftRows, recentPublishedRows] = await Promise.all([
    countPostMetas(context.db, { authorId, deletedStatus: 'normal', lifecycle: 'draft' }),
    countPostMetas(context.db, { authorId, deletedStatus: 'normal', lifecycle: 'published' }),
    listPostMetas(context.db, {
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'draft',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      limit: RECENT_DRAFTS_LIMIT,
    }),
    listPostMetas(context.db, {
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'published',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
      limit: RECENT_PUBLISHED_LIMIT,
    }),
  ])
  return {
    draftCount,
    publishedCount,
    recentDrafts: recentDraftRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      updatedAtIso: row.updatedAt.toISOString(),
    })),
    recentPublished: recentPublishedRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      updatedAtIso: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(),
    })),
  }
})

const analytics = impl.analytics.handler(async ({ input, context }) => {
  const meta = findPostMetaById(context.db, input.postId)
  assertOwnPostOr404(meta, context.viewer)
  const tags = await findTagNamesByPostId(context.db, input.postId)
  const post = toAdminPostDto(meta, { tags })
  const overview = await loadAnalyticsOverview(getAnalyticsReader(), {
    ...parseAnalyticsSearch(new URLSearchParams(input.search)),
    entityType: 'post',
    entityId: input.postId,
  })
  return { post, ...overview }
})

export const adminPostsRouter = impl.router({
  list,
  get,
  delete: remove,
  restore,
  unpublish,
  saveDraft,
  publishLatest,
  upsertMeta,
  listRevisions,
  mySummary,
  analytics,
})
