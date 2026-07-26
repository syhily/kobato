import type { MetaEntityDescriptor } from '@/server/domains/content/entities/descriptor'
import type { NewPageMeta, PageMetaRow } from '@/server/infra/db/types'
import type { Page } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { toAdminPageDto, toCmsPage, type AdminPageDto } from '@/server/domains/pages/projection'
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
import { assertPageExists, type UpsertPageMetaInput } from '@/server/domains/pages/services/shared'

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
    async afterPublish(db) {
      await invalidateContent(db, { entity: 'page' })
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
    async afterMutation(db) {
      await invalidateContent(db, { entity: 'page' })
    },
    async afterRestore(db) {
      await invalidateContent(db, { entity: 'page' })
      return undefined
    },
  },
}
