import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@kobato/server/domains/content/entities/descriptor'
import type { ContentEntityAdapter } from '@kobato/server/domains/content/lifecycle'

import { recordForceOverwriteAudit } from '@kobato/server/domains/content/lifecycle'
import { getLogger } from '@kobato/server/infra/logger'

/**
 * Builds the body-lifecycle adapter (consumed by `saveBody` /
 * `loadDraftPreviewBySlug`) from the same descriptor that drives the
 * meta CRUD skeleton, so one declaration owns both halves of entity
 * behavior. Lives outside `content/lifecycle.ts` so tests that mock the
 * lifecycle module keep the adapter factory real.
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
