import type { ContentType } from './schemas/revision'

import { descriptorFor } from '../../infra/http/error-descriptor'
import { DomainError, isUniqueConstraintError } from '../../infra/http/errors'

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
