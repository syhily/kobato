import type { ContentType } from '@kobato/server/domains/content/schemas/revision.ts'

import { isUniqueConstraintError } from '@kobato/db/errors.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

/**
 * Single owner for the slug unique-constraint → CONFLICT mapping;
 * anything else is rethrown unchanged.
 */
export function rethrowSlugConflict(err: unknown, entityType: ContentType, slug: string): never {
  // SQLite errors name the offending column, not the index.
  if (isUniqueConstraintError(err, `${entityType}.slug`) || isUniqueConstraintError(err, 'slug_registry.slug')) {
    throw new DomainError('CONFLICT', descriptorFor('content.error.slugConflict', { slug }))
  }
  throw err
}
