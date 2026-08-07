import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { loadAnalyticsOverview } from '@/server/domains/analytics/services/overview'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { toAdminPostDto } from '@/server/domains/posts/projection'
import { listPostsSchema, upsertPostMetaSchema } from '@/server/domains/posts/schema'
import {
  countPostMetas,
  getPostDetailForAdmin,
  listPostMetas,
  listPostsForAdmin,
  listRevisionsForAdmin as listPostRevisionsForAdmin,
} from '@/server/domains/posts/services/admin-query'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@/server/domains/posts/services/mutate'
import { findPostMetaById } from '@/server/domains/posts/services/single'
import { makeRevisionRouter } from '@/server/http/controllers/admin/revision-router'
import { authorProc } from '@/server/http/orpc-base'
import { findTagNamesByPostId } from '@/server/infra/db/operations/post-tag'
import {
  adminPostAnalyticsInputSchema,
  adminPostAnalyticsOutputSchema,
  adminPostsMySummaryOutputSchema,
} from '@/shared/contracts/admin'
import {
  adminPostDetailDto,
  adminPostDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
} from '@/shared/contracts/posts'
import { idFromString } from '@/shared/utils/id'

const idInput = z.object({ id: z.string().min(1) })

// The recent-5 window of the dashboard cards — must stay in lockstep
// with `RECENT_DRAFTS_LIMIT` / `RECENT_PUBLISHED_LIMIT` in
// `src/routes/admin/dashboard.tsx` (the loader projects the same rows).
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
  // NOT_FOUND comes from the service (`assertOwnPostOr404` throws a
  // DomainError, translated by `domainErrorGuard`) — no null branch here.
  .handler(({ input, context }) => getPostDetailForAdmin(context.db, idFromString(input.id), context.viewer))

const remove = authorProc
  .route({ method: 'POST', path: '/admin/posts/remove' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const result = await deletePost(context.db, idFromString(input.id), context.viewer)
    if (!result.deleted) {
      throw new ORPCError('NOT_FOUND', { message: '文章不存在或已被删除。' })
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
      throw new ORPCError('NOT_FOUND', { message: '文章不存在或未被删除。' })
    }
    recordAuditEventFromContext(context, {
      action: 'post_restored',
      resourceType: 'post',
      resourceId: input.id,
    })
    return { success: true, warning: result.warning }
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

// save-draft / publish-latest / preview come from the shared revision
// factory. Posts pass `context.viewer` into `saveBody` so the adapter can
// enforce author-owns-post (`assertOwnPostOr404`) — see the
// `passViewerToSaveBody` option doc in `controllers/admin/revision-router.ts`.
const { saveDraft, publishLatest, preview } = makeRevisionRouter({
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
      resourceId: String(post.id),
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

// Dashboard card data: draft/published counts plus the recent-5 lists,
// scoped to the calling author. The projections below are copied
// verbatim from `loaders/dashboard.ts` (id stringified, title, and the
// published row falling back to `updatedAt` when never published) so the
// cards render bit-identical data.
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

// Per-post analytics behind both `/admin/posts/:id/analytics` and
// `/editor/post/:id/analytics` — semantics replicated from
// `loaders/post-analytics.ts`: NOT_FOUND on a missing meta, the admin
// post DTO (with tags), then the overview fan-out scoped to the post.
// `search` carries the raw query string, parsed server-side.
const analytics = authorProc
  .route({ method: 'GET', path: '/admin/posts/analytics' })
  .input(adminPostAnalyticsInputSchema)
  .output(adminPostAnalyticsOutputSchema)
  .handler(async ({ input, context }) => {
    const meta = findPostMetaById(context.db, input.postId)
    if (meta === null) {
      throw new ORPCError('NOT_FOUND', { message: '文章不存在' })
    }
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
  preview,
  upsertMeta,
  listRevisions,
  mySummary,
  analytics,
}
