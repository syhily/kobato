import type { ContentType } from '@kobato/server/domains/content/schemas/revision'

import { isUniqueConstraintError } from '@kobato/db/errors'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export function rethrowSlugConflict(err: unknown, entityType: ContentType, slug: string): never {
  // SQLite errors name the offending column, not the index.
  if (isUniqueConstraintError(err, `${entityType}.slug`) || isUniqueConstraintError(err, 'slug_registry.slug')) {
    throw new DomainError('CONFLICT', descriptorFor('content.error.slugConflict', { slug }))
  }
  throw err
}
