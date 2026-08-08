import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@/server/domains/content/entities/descriptor'
import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'

import { recordForceOverwriteAudit } from '@/server/domains/content/lifecycle'
import { getLogger } from '@/server/infra/logger'

/**
 * Builds the body-lifecycle adapter from the same descriptor that drives
 * the meta CRUD skeleton. Lives outside `lifecycle.ts` for test seams.
 */
export function makeContentEntityAdapter<
  TMeta extends MetaRowBase,
  TNew,
  TInput extends UpsertMetaInputBase,
  TExtras extends object,
  TAdminDto,
  TPreview,
  TRestore,
>(
  descriptor: MetaEntityDescriptor<TMeta, TNew, TInput, TExtras, TAdminDto, TPreview, TRestore>,
): ContentEntityAdapter<TMeta, TPreview> {
  const auditLog = getLogger(descriptor.audit.loggerScope)
  return {
    entityType: descriptor.entityType,
    findMetaById: descriptor.repos.findMetaById,
    findPublicMetaBySlug: descriptor.repos.findPublicMetaBySlug,
    assertAccess: descriptor.access.assertAccess,
    canPreviewDraft: descriptor.access.canPreviewDraft,
    getId: (meta) => meta.id,
    getPublishedRevisionId: (meta) => meta.publishedRevisionId,
    projectPreview: descriptor.preview.project,
    recordForceOverwrite: (entry) => recordForceOverwriteAudit(auditLog, descriptor.audit.metaIdKey, entry),
    afterPublish: (db, meta, body, warnings) => descriptor.preview.afterPublish(db, meta, body, warnings),
  }
}
