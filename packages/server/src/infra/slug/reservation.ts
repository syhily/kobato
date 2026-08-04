import type { Database } from '@kobato/server/infra/db/database'

import { findSlugRegistryBySlugForUpdate } from '@kobato/server/infra/db/operations/slug-registry'
import { DomainError } from '@kobato/server/infra/http/errors'

export type EntityType = 'post' | 'page'

// Route-prefix fence shared by posts and pages. Slug uniqueness across
// the two tables is enforced here: `reserveSlugInTransaction` below
// checks the `slug_registry` row in-transaction, and raced DB UNIQUE
// violations are mapped to a clean 409 by `rethrowSlugConflict`
// (`@kobato/server/domains/content/slug-conflict`). Taxonomy slugs are exempt
// — they never mount at a route prefix of their own.
export const RESERVED_SLUGS = new Set<string>([
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

export interface SlugReservationDeps {
  findOwnMetaBySlugForUpdate: (tx: Database, slug: string) => { id: number } | null
}

// Sync (node:sqlite): called inside entity transactions.
export function reserveSlugInTransaction(
  tx: Database,
  entityType: EntityType,
  slug: string,
  ownEntityId: number | undefined,
  deps: SlugReservationDeps,
): void {
  const ownMeta = deps.findOwnMetaBySlugForUpdate(tx, slug)
  if (ownMeta !== null && ownMeta.id !== ownEntityId) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它${entityType === 'post' ? '文章' : '页面'}占用。`)
  }
  const crossCollision = findSlugRegistryBySlugForUpdate(tx, slug)
  if (crossCollision !== null && crossCollision.entityType !== entityType) {
    const otherEntity = crossCollision.entityType === 'post' ? '文章' : '页面'
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它${otherEntity}占用。`)
  }
}
