import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'
import type { PageMetaRow } from '@/server/infra/db/types'
import type { Page } from '@/shared/types/catalog'

import { recordForceOverwriteAudit } from '@/server/domains/content/lifecycle'
import { clearContentCaches } from '@/server/domains/content/shared'
import { toCmsPage } from '@/server/domains/pages/projection'
import { findPageMetaById, findPublicPageMetaBySlug } from '@/server/domains/pages/repo'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const auditLog = getLogger('audit.cms.pages')

function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
}

export const pageLifecycleAdapter: ContentEntityAdapter<PageMetaRow, Page> = {
  entityType: 'page',
  findMetaById: findPageMetaById,
  findPublicMetaBySlug: findPublicPageMetaBySlug,
  assertAccess: assertPageExists,
  canPreviewDraft: (role) => role === 'admin',
  getId: (meta) => meta.id,
  getPublishedRevisionId: (meta) => meta.publishedRevisionId,
  projectPreview: (meta, revision) => toCmsPage(meta, revision),
  recordForceOverwrite: (entry) => recordForceOverwriteAudit(auditLog, 'pageMetaId', entry),
  async afterPublish(db, meta) {
    await clearContentCaches(db, 'page', meta.id)
  },
}
