import type { Page } from '@kobato/catalog/model.ts'
import type { AdminPageDto } from '@kobato/contracts/pages.ts'
import type { NewPageMeta, PageMetaRow } from '@kobato/db/types.ts'
import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor.ts'

import { invalidateContent } from '@kobato/server/domains/content/invalidate.ts'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup.ts'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate.ts'
import { toAdminPageDto, toCmsPage } from '@kobato/server/domains/pages/projection.ts'
import {
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@kobato/server/domains/pages/repo.ts'
import { findPublicPageMetaBySlug } from '@kobato/server/domains/pages/services/public-query.ts'
import { assertPageExists, type PageMetaWriteInput } from '@kobato/server/domains/pages/services/shared.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

// Warm key must mirror the OG resolver (`http/resources/images.ts`): empty summary → site description.
function pageOgTarget(meta: PageMetaRow) {
  return {
    slug: meta.slug,
    title: meta.title,
    summary: meta.summary || requireBlogSettingsSection('siteIdentity').description,
    cover: meta.cover,
  }
}

export const pageDescriptor: MetaEntityDescriptor<
  PageMetaRow,
  NewPageMeta,
  PageMetaWriteInput,
  Record<string, never>,
  AdminPageDto,
  Page
> = {
  entityType: 'page',
  repos: {
    findMetaById: findPageMetaById,
    findMetaBySlug: findPageMetaBySlug,
    findMetaBySlugForUpdate: findPageMetaBySlugForUpdate,
    findPublicMetaBySlug: findPublicPageMetaBySlug,
    insertMeta: insertPageMeta,
    updateMetaById: updatePageMetaById,
    softDeleteMeta: softDeletePageMeta,
    restoreMeta: restorePageMeta,
  },
  defaultAdminListLimit: 100,
  access: {
    assertAccess: assertPageExists,
    canPreviewDraft: (viewer) => viewer?.role === 'admin',
  },
  audit: { loggerScope: 'audit.cms.pages', metaIdKey: 'pageMetaId' },
  preview: {
    project: (meta, revision) => toCmsPage(meta, revision),
    async afterPublish(db, meta) {
      invalidateContent({ entity: 'page' })
      warmContentRenderCaches(pageOgTarget(meta))
    },
  },
  adminDto: {
    project: toAdminPageDto,
  },
  mutations: {
    insertExtras: (input) => ({
      showFriends: input.showFriends ?? false,
    }),
    updateExtras: (input, existing) => ({
      showFriends: input.showFriends ?? existing.showFriends,
    }),
    async afterMutation(db, meta) {
      invalidateContent({ entity: 'page' })
      // Re-warm only when the mutation leaves a publicly reachable page.
      if (isLive(meta)) {
        warmContentRenderCaches(pageOgTarget(meta))
      }
    },
    async afterRestore(_db) {
      invalidateContent({ entity: 'page' })
      return undefined
    },
  },
}
