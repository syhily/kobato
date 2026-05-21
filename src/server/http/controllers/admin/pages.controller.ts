import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { listPagesSchema, savePageBodySchema, upsertPageMetaSchema } from '@/server/domains/pages/schema'
import {
  createPage,
  deletePage,
  getPageDetailForAdmin,
  listPagesForAdmin,
  listRevisionsForAdmin as listPageRevisionsForAdmin,
  publishLatest as publishPageLatest,
  restorePage,
  saveDraft as savePageDraft,
  unpublishPage,
  updatePageMeta,
} from '@/server/domains/pages/service'
import { adminProc } from '@/server/http/orpc-base'
import { deriveSlug } from '@/server/infra/slug'
import { renderPortableTextToHtml as renderPagePortableTextToHtml } from '@/server/render/feed/feed-pt-render'
import {
  adminPageDetailDto,
  adminPageDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
} from '@/shared/contracts/pages'
import { previewOutputDto, saveResultOutput } from '@/shared/contracts/revision'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { collectHeadings } from '@/shared/pt/utils'

const idInput = z.object({ id: z.string().min(1) })

const list = adminProc
  .route({ method: 'GET', path: '/admin/pages/list' })
  .input(listPagesSchema)
  .output(listPagesOutputDto)
  .handler(({ input }) => listPagesForAdmin(input))

const get = adminProc
  .route({ method: 'GET', path: '/admin/pages/get' })
  .input(idInput)
  .output(adminPageDetailDto)
  .handler(async ({ input }) => {
    const detail = await getPageDetailForAdmin(BigInt(input.id))
    if (detail === null) {
      throw new ORPCError('NOT_FOUND', { message: '页面不存在或已被删除。' })
    }
    return detail
  })

const remove = adminProc
  .route({ method: 'POST', path: '/admin/pages/remove' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const result = await deletePage(BigInt(input.id))
    if (!result.deleted) {
      throw new ORPCError('NOT_FOUND', { message: '页面不存在或已被删除。' })
    }
    recordAuditEventFromContext(context, {
      action: 'page_deleted',
      resourceType: 'page',
      resourceId: input.id,
    })
  })

const restore = adminProc
  .route({ method: 'POST', path: '/admin/pages/restore' })
  .input(idInput)
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const result = await restorePage(BigInt(input.id))
    if (!result.restored) {
      throw new ORPCError('NOT_FOUND', { message: '页面不存在或未被删除。' })
    }
    recordAuditEventFromContext(context, {
      action: 'page_restored',
      resourceType: 'page',
      resourceId: input.id,
    })
    return { success: true }
  })

const unpublish = adminProc
  .route({ method: 'POST', path: '/admin/pages/unpublish' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ page: adminPageDto }))
  .handler(async ({ input, context }) => {
    const page = await unpublishPage(BigInt(input.id))
    recordAuditEventFromContext(context, {
      action: 'page_unpublished',
      resourceType: 'page',
      resourceId: input.id,
    })
    return { page }
  })

const saveDraft = adminProc
  .route({ method: 'POST', path: '/admin/pages/save-draft' })
  .input(savePageBodySchema)
  .output(saveResultOutput)
  .handler(async ({ input, context }) => {
    const result = await savePageDraft({
      pageId: BigInt(input.id),
      body: input.body,
      expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
      force: input.force,
      authorId: BigInt(context.viewer.userId),
    })
    if (result.status === 'saved') {
      recordAuditEventFromContext(context, {
        action: 'page_draft_saved',
        resourceType: 'page',
        resourceId: input.id,
      })
    }
    return result
  })

const publishLatest = adminProc
  .route({ method: 'POST', path: '/admin/pages/publish-latest' })
  .input(savePageBodySchema)
  .output(saveResultOutput)
  .handler(async ({ input, context }) => {
    const result = await publishPageLatest({
      pageId: BigInt(input.id),
      body: input.body,
      expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
      force: input.force,
      authorId: BigInt(context.viewer.userId),
      publishedAt: input.publishedAt !== undefined ? new Date(input.publishedAt) : undefined,
    })
    if (result.status === 'saved') {
      recordAuditEventFromContext(context, {
        action: 'page_published',
        resourceType: 'page',
        resourceId: input.id,
        details: { publishedAt: input.publishedAt },
      })
    }
    return result
  })

const preview = adminProc
  .route({ method: 'POST', path: '/admin/pages/preview' })
  .input(z.object({ body: portableTextBodySchema }))
  .output(previewOutputDto)
  .handler(async ({ input }) => {
    const html = await renderPagePortableTextToHtml(input.body, [])
    const headings = collectHeadings(input.body, deriveSlug)
    return { html, headings }
  })

const upsertMeta = adminProc
  .route({ method: 'POST', path: '/admin/pages/upsert-meta' })
  .input(upsertPageMetaSchema)
  .output(z.object({ page: adminPageDto }))
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
      showFriends: input.showFriends,
      publishedAt: input.publishedAt === undefined ? undefined : new Date(input.publishedAt),
    }
    const sessionUserId = BigInt(context.viewer.userId)
    const page =
      input.id === undefined
        ? await createPage(meta, sessionUserId)
        : await updatePageMeta({ id: BigInt(input.id), ...meta })
    recordAuditEventFromContext(context, {
      action: input.id === undefined ? 'page_created' : 'page_meta_updated',
      resourceType: 'page',
      resourceId: String(page.id),
    })
    return { page }
  })

const listRevisions = adminProc
  .route({ method: 'GET', path: '/admin/pages/list-revisions' })
  .input(z.object({ id: z.string().min(1) }))
  .output(listPageRevisionsOutputDto)
  .handler(async ({ input }) => {
    const revisions = await listPageRevisionsForAdmin(BigInt(input.id))
    return { revisions }
  })

export const adminPagesRouter = {
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
