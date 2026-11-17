import type { ErrorMessageDescriptor } from '@kobato/shared/contracts/api-error.ts'

import type { Database } from '../../infra/db/database'
import type { ContentType } from './schemas/revision'

import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '../../infra/db/operations/slug-registry'
import { descriptorFor } from '../../infra/http/error-descriptor'
import { isUniqueConstraintError } from '../../infra/http/errors'

/** Re-claims a soft-deleted entity's slug during restore; returns the warning when occupied or stolen mid-restore. */
// Sync (node:sqlite): transactions are sync callbacks.
export function reclaimSlugOnRestore(
  tx: Database,
  entityType: ContentType,
  entityId: number,
  slug: string,
): ErrorMessageDescriptor | undefined {
  const existing = findSlugRegistryBySlugForUpdate(tx, slug)
  if (existing !== null && !(existing.entityType === entityType && existing.entityId === entityId)) {
    return descriptorFor('content.warning.slugTakenOnRestore', {
      slug,
      occupant: existing.entityType,
      target: entityType,
    })
  }
  try {
    insertSlugRegistry(tx, { slug, entityType, entityId })
  } catch (err) {
    // SQLite names columns, not the index.
    if (!isUniqueConstraintError(err, 'slug_registry.slug')) {
      throw err
    }
    return descriptorFor('content.warning.slugStolenOnRestore', { slug, target: entityType })
  }
  return undefined
}
