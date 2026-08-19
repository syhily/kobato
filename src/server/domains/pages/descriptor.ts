import type { MetaEntityDescriptor } from '@/server/domains/content/entities/descriptor'
import type { NewPageMeta, PageMetaRow } from '@/server/infra/db/types'
import type { AdminPageDto } from '@/shared/contracts/pages'
import type { Page } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@/server/domains/content/render-warmup'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { toAdminPageDto, toCmsPage } from '@/server/domains/pages/projection'
import {
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'
import { findPublicPageMetaBySlug } from '@/server/domains/pages/services/public-query'
import { assertPageExists, type PageMetaWriteInput } from '@/server/domains/pages/services/shared'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Warm key must mirror the OG resolver (`http/resources/images.ts`): empty summary → site description.
function pageOgTarget(meta: PageMetaRow) {
  return {
    slug: meta.slug,
    title: meta.title,
    summary: meta.summary || requireBlogSettingsSection('siteIdentity').description,
    cover: meta.cover,
  }
}

/**
 * The page entity descriptor: existence-only access, admin-only draft
 * preview, `showFriends`, and invalidation on every meta mutation
 * (the sitemap lists pages). The rest comes from `content/entities/*`.
 */
export const pageDescriptor: MetaEntityDescriptor<
  PageMetaRow,
  NewPageMeta,
  PageMetaWriteInput,
  Record<string, never>,
  AdminPageDto,
  Page
> = {
  entityType: 'page',
  label: '页面',
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
    canPreviewDraft: (role) => role === 'admin',
  },
  audit: { loggerScope: 'audit.cms.pages', metaIdKey: 'pageMetaId' },
  preview: {
    project: (meta, revision) => toCmsPage(meta, revision),
    async afterPublish(db, meta) {
      invalidateContent(db, { entity: 'page' })
      warmContentRenderCaches(db, pageOgTarget(meta))
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
      invalidateContent(db, { entity: 'page' })
      // Re-warm only when the mutation leaves a publicly reachable page.
      if (isLive(meta)) {
        warmContentRenderCaches(db, pageOgTarget(meta))
      }
    },
    async afterRestore(db) {
      invalidateContent(db, { entity: 'page' })
      return undefined
    },
  },
}
