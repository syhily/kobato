import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { listPagesSchema, upsertPageMetaSchema } from '@/server/domains/pages/schema'
import {
  listPagesForAdmin,
  getPageDetailForAdmin,
  listRevisionsForAdmin as listPageRevisionsForAdmin,
} from '@/server/domains/pages/services/admin-query'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import {
  createPage,
  deletePage,
  restorePage,
  unpublishPage,
  updatePageMeta,
} from '@/server/domains/pages/services/mutate'
import { makeRevisionRouter } from '@/server/http/controllers/admin/revision-router'
import { adminProc } from '@/server/http/orpc-base'
import {
  adminPageDetailDto,
  adminPageDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
} from '@/shared/contracts/pages'
import { idFromString } from '@/shared/utils/id'

const idInput = z.object({ id: z.string().min(1) })

const list = adminProc
  .route({ method: 'GET', path: '/admin/pages/list' })
  .input(listPagesSchema)
  .output(listPagesOutputDto)
  .handler(({ input, context }) => listPagesForAdmin(context.db, input))

const get = adminProc
  .route({ method: 'GET', path: '/admin/pages/get' })
  .input(idInput)
  .output(adminPageDetailDto)
  // NOT_FOUND comes from the service (DomainError, translated by
  // `domainErrorGuard`) — same contract as the posts controller.
  .handler(({ input, context }) => getPageDetailForAdmin(context.db, idFromString(input.id)))

const remove = adminProc
  .route({ method: 'POST', path: '/admin/pages/remove' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const result = await deletePage(context.db, idFromString(input.id))
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
  .output(z.object({ success: z.boolean(), warning: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const result = await restorePage(context.db, idFromString(input.id))
    if (!result.restored) {
      throw new ORPCError('NOT_FOUND', { message: '页面不存在或未被删除。' })
    }
    recordAuditEventFromContext(context, {
      action: 'page_restored',
      resourceType: 'page',
      resourceId: input.id,
    })
    return { success: true, warning: result.warning }
  })

const unpublish = adminProc
  .route({ method: 'POST', path: '/admin/pages/unpublish' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ page: adminPageDto }))
  .handler(async ({ input, context }) => {
    const page = await unpublishPage(context.db, idFromString(input.id))
    recordAuditEventFromContext(context, {
      action: 'page_unpublished',
      resourceType: 'page',
      resourceId: input.id,
    })
    return { page }
  })

// save-draft / publish-latest / preview come from the shared revision
// factory. Pages deliberately do NOT pass `context.viewer` into
// `saveBody`: editing is already admin-only via `adminProc`, so the page
// adapter has no ownership rule to evaluate — see the
// `passViewerToSaveBody` option doc in `controllers/admin/revision-router.ts`.
const { saveDraft, publishLatest, preview } = makeRevisionRouter({
  proc: adminProc,
  adapter: pageLifecycleAdapter,
  basePath: '/admin/pages',
  audit: {
    resourceType: 'page',
    draftSavedAction: 'page_draft_saved',
    publishedAction: 'page_published',
  },
  passViewerToSaveBody: false,
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
    const sessionUserId = idFromString(context.viewer.id)
    const page =
      input.id === undefined
        ? await createPage(context.db, meta, sessionUserId)
        : await updatePageMeta(context.db, { id: idFromString(input.id), ...meta })
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
  .handler(async ({ input, context }) => {
    const revisions = await listPageRevisionsForAdmin(context.db, idFromString(input.id))
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
