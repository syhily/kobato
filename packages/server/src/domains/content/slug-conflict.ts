import type { ContentType } from '@kobato/server/domains/content/schemas/revision'

import { DomainError, isUniqueConstraintError } from '@kobato/server/infra/http/errors'

/**
 * Single owner for the slug unique-constraint → CONFLICT mapping. Covers
 * the entity meta-table constraint (derived via the
 * `${entityType}_slug_key` naming convention) and the slug-registry
 * constraint. Mount it in every content entity's mutation catch — a raced
 * create/rename that loses the reservation window must surface as a clean
 * 409, never a raw 23505. Anything else is rethrown unchanged.
 *
 * The guard itself looks through one level of `cause`, so driver errors
 * wrapped in drizzle's `DrizzleQueryError` are matched here.
 */
export function rethrowSlugConflict(err: unknown, entityType: ContentType, slug: string): never {
  // SQLite messages name the offending COLUMNS, never the index:
  // `post.slug` for the meta-table UNIQUE, `slug_registry.slug` for the
  // registry's slug index.
  if (isUniqueConstraintError(err, `${entityType}.slug`) || isUniqueConstraintError(err, 'slug_registry.slug')) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
  }
  throw err
}
