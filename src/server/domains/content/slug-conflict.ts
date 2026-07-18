import type { ContentEntityType } from '@/server/domains/content/shared'

import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'

/**
 * Single owner for the slug unique-constraint → CONFLICT mapping. Covers
 * the entity meta-table constraint (derived via the
 * `${entityType}_slug_key` naming convention) and the slug-registry
 * constraint. Mount it in every content entity's mutation catch — a raced
 * create/rename that loses the reservation window must surface as a clean
 * 409, never a raw 23505. Anything else is rethrown unchanged.
 *
 * Drizzle wraps driver errors in `DrizzleQueryError`, so the match looks
 * through one level of `cause` to reach the original `pg.DatabaseError`.
 */
export function rethrowSlugConflict(err: unknown, entityType: ContentEntityType, slug: string): never {
  const candidates = [err, err instanceof Error ? err.cause : undefined]
  const isSlugConflict = candidates.some(
    (candidate) =>
      isUniqueConstraintError(candidate, `${entityType}_slug_key`) ||
      isUniqueConstraintError(candidate, 'uq_slug_registry_slug'),
  )
  if (isSlugConflict) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
  }
  throw err
}
