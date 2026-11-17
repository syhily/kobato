import {
  adminPostAnalyticsInputSchema,
  adminPostAnalyticsOutputSchema,
  adminPostsMySummaryOutputSchema,
} from '@kobato/contracts/admin.ts'
import {
  adminPostDetailDto,
  adminPostDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
} from '@kobato/contracts/posts.ts'
import { findTagNamesByPostId } from '@kobato/db/operations/post-tag.ts'
import { getAnalyticsReader } from '@kobato/server/bootstrap/analytics-lifecycle.ts'
import { loadAnalyticsOverview } from '@kobato/server/domains/analytics/services/overview.ts'
import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-filter.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { toAdminPostDto } from '@kobato/server/domains/posts/projection.ts'
import { listPostsSchema, upsertPostMetaSchema } from '@kobato/server/domains/posts/schema.ts'
import {
  countPostMetas,
  getPostDetailForAdmin,
  listPostMetas,
  listPostsForAdmin,
  listRevisionsForAdmin as listPostRevisionsForAdmin,
} from '@kobato/server/domains/posts/services/admin-query.ts'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter.ts'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@kobato/server/domains/posts/services/mutate.ts'
import { assertOwnPostOr404 } from '@kobato/server/domains/posts/services/shared.ts'
import { findPostMetaById } from '@kobato/server/domains/posts/services/single.ts'
import { makeRevisionRouter } from '@kobato/server/http/controllers/admin/revision-router.ts'
import { authorProc, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { formatWarningDescriptors } from '@kobato/server/http/translate-domain-error.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { idFromString } from '@kobato/utils/id.ts'
import { z } from 'zod'

const idInput = z.object({ id: z.string().min(1) })

const RECENT_DRAFTS_LIMIT = 5
const RECENT_PUBLISHED_LIMIT = 5

const list = authorProc
  .route({ method: 'GET', path: '/admin/posts/list' })
  .input(listPostsSchema)
  .output(listPostsOutputDto)
  .handler(({ input, context }) => listPostsForAdmin(context.db, input, context.viewer))

const get = authorProc
  .route({ method: 'GET', path: '/admin/posts/get' })
  .input(idInput)
  .output(adminPostDetailDto)
  // NOT_FOUND comes from the service — no null branch here.
  .handler(({ input, context }) => getPostDetailForAdmin(context.db, idFromString(input.id), context.viewer))

const remove = authorProc
  .route({ method: 'POST', path: '/admin/posts/remove' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
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

const restore = authorProc
  .route({ method: 'POST', path: '/admin/posts/restore' })
  .input(idInput)
  .output(z.object({ success: z.boolean(), warning: z.string().optional() }))
  .handler(async ({ input, context }) => {
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

const unpublish = authorProc
  .route({ method: 'POST', path: '/admin/posts/unpublish' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ post: adminPostDto }))
  .handler(async ({ input, context }) => {
    const post = await unpublishPost(context.db, idFromString(input.id), context.viewer)
    recordAuditEventFromContext(context, {
      action: 'post_unpublished',
      resourceType: 'post',
      resourceId: input.id,
    })
    return { post }
  })

// Shared revision factory; posts pass `viewer` so the adapter enforces
// author-owns-post (see `passViewerToSaveBody` in `revision-router.ts`).
const { saveDraft, publishLatest } = makeRevisionRouter({
  proc: authorProc,
  adapter: postLifecycleAdapter,
  basePath: '/admin/posts',
  audit: {
    resourceType: 'post',
    draftSavedAction: 'post_draft_saved',
    publishedAction: 'post_published',
  },
  passViewerToSaveBody: true,
})

const upsertMeta = authorProc
  .route({ method: 'POST', path: '/admin/posts/upsert-meta' })
  .input(upsertPostMetaSchema)
  .output(z.object({ post: adminPostDto }))
  .handler(async ({ input, context }) => {
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

const listRevisions = authorProc
  .route({ method: 'GET', path: '/admin/posts/list-revisions' })
  .input(z.object({ id: z.string().min(1) }))
  .output(listPostRevisionsOutputDto)
  .handler(async ({ input, context }) => {
    const revisions = await listPostRevisionsForAdmin(context.db, idFromString(input.id), context.viewer)
    return { revisions }
  })

// Dashboard card data (counts + recent-5), scoped to the author — consumed
// verbatim by `routes/admin/dashboard.tsx`.
const mySummary = authorProc
  .route({ method: 'GET', path: '/admin/posts/my-summary' })
  .output(adminPostsMySummaryOutputSchema)
  .handler(async ({ context }) => {
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

// Per-post analytics behind both admin/editor analytics routes; `search` is
// parsed server-side.
const analytics = authorProc
  .route({ method: 'GET', path: '/admin/posts/analytics' })
  .input(adminPostAnalyticsInputSchema)
  .output(adminPostAnalyticsOutputSchema)
  .handler(async ({ input, context }) => {
    const meta = findPostMetaById(context.db, input.postId)
    // Authors reach only their own posts' analytics; admins are unrestricted.
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

export const adminPostsRouter = {
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
}
