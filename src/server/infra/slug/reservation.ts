import type { Database } from '@/server/infra/db/database'

import { findSlugRegistryBySlugForUpdate } from '@/server/infra/db/operations/slug-registry'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

export type EntityType = 'post' | 'page'

// Route-prefix fence shared by posts and pages. Taxonomy slugs are exempt —
// they never mount at a route prefix of their own.
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
    throw new DomainError('CONFLICT', descriptorFor('content.error.slugTakenByEntity', { slug, entity: entityType }))
  }
  const crossCollision = findSlugRegistryBySlugForUpdate(tx, slug)
  if (crossCollision !== null && crossCollision.entityType !== entityType) {
    throw new DomainError(
      'CONFLICT',
      descriptorFor('content.error.slugTakenByEntity', { slug, entity: crossCollision.entityType }),
    )
  }
}
