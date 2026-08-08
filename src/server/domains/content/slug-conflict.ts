import type { ContentType } from '@/server/domains/content/schemas/revision'

import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'

/**
 * Single owner for the slug unique-constraint → CONFLICT mapping;
 * anything else is rethrown unchanged.
 */
export function rethrowSlugConflict(err: unknown, entityType: ContentType, slug: string): never {
  // SQLite errors name the offending column, not the index.
  if (isUniqueConstraintError(err, `${entityType}.slug`) || isUniqueConstraintError(err, 'slug_registry.slug')) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
  }
  throw err
}
