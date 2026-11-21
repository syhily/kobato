import type { Page } from '@kobato/catalog/model'
import type { AdminPageDto } from '@kobato/contracts/pages'
import type { NewPageMeta, PageMetaRow } from '@kobato/db/types'
import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor'

import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { toAdminPageDto, toCmsPage } from '@kobato/server/domains/pages/projection'
import {
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@kobato/server/domains/pages/repo'
import { findPublicPageMetaBySlug } from '@kobato/server/domains/pages/services/public-query'
import { assertPageExists, type PageMetaWriteInput } from '@kobato/server/domains/pages/services/shared'
import { requireBlogSettingsSection } from '@kobato/settings/getters'

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
