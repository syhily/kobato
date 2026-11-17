import type { AdminPageDto } from '@kobato/shared/contracts/pages.ts'
import type { Page } from '@kobato/shared/types/catalog.ts'

import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'

import type { NewPageMeta, PageMetaRow } from '../../infra/db/types'
import type { MetaEntityDescriptor } from '../content/entities/descriptor'

import { invalidateContent } from '../content/invalidate'
import { warmContentRenderCaches } from '../content/render-warmup'
import { isLive } from '../content/schemas/live-gate'
import { toAdminPageDto, toCmsPage } from './projection'
import {
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from './repo'
import { findPublicPageMetaBySlug } from './services/public-query'
import { assertPageExists, type PageMetaWriteInput } from './services/shared'

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
