import type { Database } from '@kobato/db/database.ts'

import { findSlugRegistryBySlugForUpdate } from '@kobato/db/operations/slug-registry.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

export type EntityType = 'post' | 'page'

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
