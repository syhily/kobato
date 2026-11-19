import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@kobato/server/domains/content/entities/descriptor.ts'
import type { ContentEntityAdapter } from '@kobato/server/domains/content/lifecycle.ts'

import { recordForceOverwriteAudit } from '@kobato/server/domains/content/lifecycle.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'

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
