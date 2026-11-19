import { adminPagesContract } from '@kobato/api/admin/pages.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import {
  listPagesForAdmin,
  getPageDetailForAdmin,
  listRevisionsForAdmin as listPageRevisionsForAdmin,
} from '@kobato/server/domains/pages/services/admin-query.ts'
import { pageLifecycleAdapter } from '@kobato/server/domains/pages/services/lifecycle-adapter.ts'
import {
  createPage,
  deletePage,
  restorePage,
  unpublishPage,
  updatePageMeta,
} from '@kobato/server/domains/pages/services/mutate.ts'
import { makeRevisionRouter } from '@kobato/server/http/controllers/admin/revision-shared.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { formatWarningDescriptors } from '@kobato/server/http/translate-domain-error.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { idFromString } from '@kobato/utils/id.ts'

const impl = implementAdmin(adminPagesContract)

const list = impl.list.handler(({ input, context }) => listPagesForAdmin(context.db, input))

const get = impl.get.handler(({ input, context }) => getPageDetailForAdmin(context.db, idFromString(input.id)))

const remove = impl.delete.handler(async ({ input, context }) => {
  const result = await deletePage(context.db, idFromString(input.id))
  if (!result.deleted) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'content.error.entityNotFound', { entity: 'page' })
  }
  recordAuditEventFromContext(context, {
    action: 'page_deleted',
    resourceType: 'page',
    resourceId: input.id,
  })
})

const restore = impl.restore.handler(async ({ input, context }) => {
  const result = await restorePage(context.db, idFromString(input.id))
  if (!result.restored) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'content.error.entityNotDeleted', { entity: 'page' })
  }
  recordAuditEventFromContext(context, {
    action: 'page_restored',
    resourceType: 'page',
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
  const page = await unpublishPage(context.db, idFromString(input.id))
  recordAuditEventFromContext(context, {
    action: 'page_unpublished',
    resourceType: 'page',
    resourceId: input.id,
  })
  return { page }
})

const { saveDraft, publishLatest } = makeRevisionRouter({
  impl,
  adapter: pageLifecycleAdapter,
  audit: {
    resourceType: 'page',
    draftSavedAction: 'page_draft_saved',
    publishedAction: 'page_published',
  },
  passViewerToSaveBody: false,
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
    showFriends: input.showFriends,
    publishedAt:
      input.publishedAt === undefined || input.publishedAt === null ? input.publishedAt : new Date(input.publishedAt),
  }
  const sessionUserId = idFromString(context.viewer.id)
  const page =
    input.id === undefined
      ? await createPage(context.db, meta, sessionUserId)
      : await updatePageMeta(context.db, { id: idFromString(input.id), ...meta })
  recordAuditEventFromContext(context, {
    action: input.id === undefined ? 'page_created' : 'page_meta_updated',
    resourceType: 'page',
    resourceId: page.id,
  })
  return { page }
})

const listRevisions = impl.listRevisions.handler(async ({ input, context }) => {
  const revisions = await listPageRevisionsForAdmin(context.db, idFromString(input.id))
  return { revisions }
})

export const adminPagesRouter = impl.router({
  list,
  get,
  delete: remove,
  restore,
  unpublish,
  saveDraft,
  publishLatest,
  upsertMeta,
  listRevisions,
})
