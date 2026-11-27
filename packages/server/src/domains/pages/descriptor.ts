import type { AdminPageDto } from '@kobato/api/contracts/admin/pages'
import type { Page } from '@kobato/catalog/model'
import type { NewPageMeta, PageMetaRow } from '@kobato/db/sqlite/types'
import type { MetaEntityDescriptor } from '@kobato/server/domains/content/entities/descriptor'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import {
  findEntityMetaById,
  findEntityMetaBySlug,
  findPublicEntityMetaBySlug,
  insertEntityMeta,
  restoreEntityMeta,
  softDeleteEntityMeta,
  updateEntityMetaById,
} from '@kobato/db/sqlite/operations/content/entity-meta'
import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { toAdminPageDto, toCmsPage } from '@kobato/server/domains/pages/projection'
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
    findMetaById: (db, id) => unsafeCast<PageMetaRow | null>(findEntityMetaById(db, 'page', id)),
    findMetaBySlug: (db, slug) => unsafeCast<PageMetaRow | null>(findEntityMetaBySlug(db, 'page', slug)),
    findMetaBySlugForUpdate: (db, slug) => unsafeCast<PageMetaRow | null>(findEntityMetaBySlug(db, 'page', slug)),
    findPublicMetaBySlug: (db, slug) => unsafeCast<PageMetaRow | null>(findPublicEntityMetaBySlug(db, 'page', slug)),
    insertMeta: (db, values) => unsafeCast<PageMetaRow>(insertEntityMeta(db, 'page', values)),
    updateMetaById: (db, id, patch) => unsafeCast<PageMetaRow | null>(updateEntityMetaById(db, 'page', id, patch)),
    softDeleteMeta: (db, id) => softDeleteEntityMeta(db, 'page', id),
    restoreMeta: (db, id) => restoreEntityMeta(db, 'page', id),
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
