import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import {
  listPostsSchema,
  previewPostBodySchema,
  savePostBodySchema,
  upsertPostMetaSchema,
} from '@/server/domains/posts/schema'
import {
  getPostDetailForAdmin,
  listPostsForAdmin,
  listRevisionsForAdmin as listPostRevisionsForAdmin,
} from '@/server/domains/posts/services/admin-query'
import { saveDraft as savePostDraft, publishLatest as publishPostLatest } from '@/server/domains/posts/services/draft'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@/server/domains/posts/services/mutate'
import { authorProc } from '@/server/http/orpc-base'
import { deriveSlug } from '@/server/infra/slug'
import { renderPortableTextToHtml as renderPostPortableTextToHtml } from '@/server/render/feed/feed-pt-render'
import {
  adminPostDetailDto,
  adminPostDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
} from '@/shared/contracts/posts'
import { previewOutputDto, saveResultOutput } from '@/shared/contracts/revision'
import { collectHeadings } from '@/shared/pt/utils'
import { idFromString } from '@/shared/utils/id'

const idInput = z.object({ id: z.string().min(1) })

const list = authorProc
  .route({ method: 'GET', path: '/admin/posts/list' })
  .input(listPostsSchema)
  .output(listPostsOutputDto)
  .handler(({ input, context }) => listPostsForAdmin(context.db, input, context.viewer))

const get = authorProc
  .route({ method: 'GET', path: '/admin/posts/get' })
  .input(idInput)
  .output(adminPostDetailDto)
  .handler(async ({ input, context }) => {
    const detail = await getPostDetailForAdmin(context.db, idFromString(input.id), context.viewer)
    if (detail === null) {
      throw new ORPCError('NOT_FOUND', { message: '文章不存在或已被删除。' })
    }
    return detail
  })

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

const saveDraft = authorProc
  .route({ method: 'POST', path: '/admin/posts/save-draft' })
  .input(savePostBodySchema)
  .output(saveResultOutput)
  .handler(async ({ input, context }) => {
    const result = await savePostDraft(
      context.db,
      {
        postId: idFromString(input.id),
        body: input.body,
        expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
        force: input.force,
        authorId: idFromString(context.viewer.userId),
      },
      context.viewer,
    )
    if (result.status === 'saved') {
      recordAuditEventFromContext(context, {
        action: 'post_draft_saved',
        resourceType: 'post',
        resourceId: input.id,
      })
    }
    return result
  })

const publishLatest = authorProc
  .route({ method: 'POST', path: '/admin/posts/publish-latest' })
  .input(savePostBodySchema)
  .output(saveResultOutput)
  .handler(async ({ input, context }) => {
    const result = await publishPostLatest(
      context.db,
      {
        postId: idFromString(input.id),
        body: input.body,
        expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
        force: input.force,
        authorId: idFromString(context.viewer.userId),
        publishedAt: input.publishedAt !== undefined ? new Date(input.publishedAt) : undefined,
      },
      context.viewer,
    )
    if (result.status === 'saved') {
      recordAuditEventFromContext(context, {
        action: 'post_published',
        resourceType: 'post',
        resourceId: input.id,
        details: { publishedAt: input.publishedAt },
      })
    }
    return result
  })

const preview = authorProc
  .route({ method: 'POST', path: '/admin/posts/preview' })
  .input(previewPostBodySchema)
  .output(previewOutputDto)
  .handler(async ({ input, context }) => {
    const html = await renderPostPortableTextToHtml(context.db, input.body, [])
    const headings = collectHeadings(input.body, deriveSlug)
    return { html, headings }
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
      showToc: input.showToc,
      showUpdated: input.showUpdated,
      visible: input.visible,
      category: input.category,
      tags: input.tags,
      alias: input.alias,
      pinnedAt: input.pinnedAt === undefined || input.pinnedAt === null ? input.pinnedAt : new Date(input.pinnedAt),
      publishedAt: input.publishedAt === undefined ? undefined : new Date(input.publishedAt),
    }
    const sessionUserId = idFromString(context.viewer.userId)
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
}
