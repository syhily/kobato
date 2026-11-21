import type { ErrorMessageDescriptor } from '@kobato/api/contracts/api-error'
import type { Database } from '@kobato/db/database'
import type { ContentType } from '@kobato/server/domains/content/schemas/revision'

import { isUniqueConstraintError } from '@kobato/db/errors'
import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@kobato/db/operations/slug-registry'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'

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
    if (!isUniqueConstraintError(err, 'slug_registry.slug')) {
      throw err
    }
    return descriptorFor('content.warning.slugStolenOnRestore', { slug, target: entityType })
  }
  return undefined
}
