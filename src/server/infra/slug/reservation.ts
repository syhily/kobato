import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { findSlugRegistryBySlugForUpdate } from '@/server/infra/db/operations/slug-registry'
import { DomainError } from '@/server/infra/http/errors'

export type EntityType = 'post' | 'page'

export interface SlugReservationDeps {
  findOwnMetaBySlugForUpdate: (tx: NodePgDatabase, slug: string) => Promise<{ id: bigint } | null>
}

export async function reserveSlugInTransaction(
  tx: NodePgDatabase,
  entityType: EntityType,
  slug: string,
  ownEntityId: bigint | undefined,
  deps: SlugReservationDeps,
): Promise<void> {
  const ownMeta = await deps.findOwnMetaBySlugForUpdate(tx, slug)
  if (ownMeta !== null && ownMeta.id !== ownEntityId) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它${entityType === 'post' ? '文章' : '页面'}占用。`)
  }
  const crossCollision = await findSlugRegistryBySlugForUpdate(tx, slug)
  if (crossCollision !== null && crossCollision.entityType !== entityType) {
    const otherEntity = crossCollision.entityType === 'post' ? '文章' : '页面'
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它${otherEntity}占用。`)
  }
}
