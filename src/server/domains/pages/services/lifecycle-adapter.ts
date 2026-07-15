import type { ContentEntityAdapter, ForceOverwriteEntry } from '@/server/domains/content/lifecycle'
import type { PageMetaRow } from '@/server/infra/db/types'

import { clearContentCaches } from '@/server/domains/content/shared'
import { toCmsPage, type CmsPage } from '@/server/domains/pages/projection'
import { findPageMetaById, findPublicPageMetaBySlug } from '@/server/domains/pages/repo'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const auditLog = getLogger('audit.cms.pages')

function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
}

export const pageLifecycleAdapter: ContentEntityAdapter<PageMetaRow, CmsPage> = {
  entityType: 'page',
  findMetaById: findPageMetaById,
  findPublicMetaBySlug: findPublicPageMetaBySlug,
  assertAccess: assertPageExists,
  getId: (meta) => meta.id,
  getPublishedRevisionId: (meta) => meta.publishedRevisionId,
  projectPreview: (meta, revision) => toCmsPage(meta, revision),
  recordForceOverwrite(entry: ForceOverwriteEntry<PageMetaRow>): void {
    auditLog.info('force_overwrite_save', {
      mode: entry.mode,
      actor: entry.authorId === null ? null : entry.authorId.toString(),
      pageMetaId: entry.meta.id.toString(),
      overwrittenRevisionId: entry.overwritten.id.toString(),
      overwrittenRevisionToken: entry.overwritten.clientRevisionToken,
      clientExpectedToken: entry.expectedClientRevisionToken ?? null,
      resultRevisionId: entry.resultRow.id.toString(),
    })
  },
  async afterPublish(_db, meta) {
    await clearContentCaches('page', meta.id)
  },
}
