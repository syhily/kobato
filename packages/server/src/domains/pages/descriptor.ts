import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor'
import type { NewPageMeta, PageMetaRow } from '@kobato/server/infra/db/types'
import type { Page } from '@kobato/shared/types/catalog'

import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { toAdminPageDto, toCmsPage, type AdminPageDto } from '@kobato/server/domains/pages/projection'
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
import { assertPageExists, type UpsertPageMetaInput } from '@kobato/server/domains/pages/services/shared'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'

// The OG request path (`http/resources/images.ts`) resolves an empty
// page summary to the site description — the warm key must fold the same
// inputs or it fills a key the crawler never asks for.
function pageOgTarget(meta: PageMetaRow) {
  return {
    slug: meta.slug,
    title: meta.title,
    summary: meta.summary || requireBlogSettingsSection('siteIdentity').description,
    cover: meta.cover,
  }
}

/**
 * The page entity: existence-only access (admin-only surface), admin-only
 * draft preview, the showFriends flag, and cache invalidation on every
 * meta mutation (the sitemap lists pages, so any meta change can stale
 * it). Everything else — the body lifecycle and the meta CRUD/mutation
 * skeleton — comes from the generic implementations this descriptor
 * feeds (`content/entities/*`).
 */
export const pageDescriptor: MetaEntityDescriptor<
  PageMetaRow,
  NewPageMeta,
  UpsertPageMetaInput,
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
      // Same crawler-first-scan warm as posts — the request path falls
      // back to the site description when the page summary is empty.
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
      // Re-warm only when the mutation leaves a publicly reachable page —
      // creates/updates of unpublished pages and deletes/unpublishes
      // would render a card the OG route never serves.
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
