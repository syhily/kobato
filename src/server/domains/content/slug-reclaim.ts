import type { ContentType } from '@/server/domains/content/schemas/revision'
import type { Database } from '@/server/infra/db/database'

import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'
import { isUniqueConstraintError } from '@/server/infra/http/errors'

const ENTITY_LABEL: Record<ContentType, string> = { post: '文章', page: '页面' }

/**
 * Re-claims a soft-deleted entity's slug during restore. Runs inside the
 * caller's restore transaction: the row lock comes from
 * `findSlugRegistryBySlugForUpdate`, and a non-unique insert error aborts
 * the transaction. Returns the warning to surface when the slug could not
 * be reclaimed — occupied by another entity, or stolen by a concurrent
 * writer mid-restore — or undefined when the registry row now points at
 * the restored entity. Callers keep their own flow shape (post prepends
 * the warning at the end, page returns early).
 */
// Sync (node:sqlite): runs inside the caller's restore transaction.
export function reclaimSlugOnRestore(
  tx: Database,
  entityType: ContentType,
  entityId: number,
  slug: string,
): string | undefined {
  const existing = findSlugRegistryBySlugForUpdate(tx, slug)
  if (existing !== null && !(existing.entityType === entityType && existing.entityId === entityId)) {
    return `slug "${slug}" 已被另一个${ENTITY_LABEL[existing.entityType]}占用，恢复后该 URL 不会指向此${ENTITY_LABEL[entityType]}。请修改 slug 或先处理占用方。`
  }
  try {
    insertSlugRegistry(tx, { slug, entityType, entityId })
  } catch (err) {
    if (!isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
      throw err
    }
    return `slug "${slug}" 在恢复过程中被其它内容占用，URL 不会指向此${ENTITY_LABEL[entityType]}。`
  }
  return undefined
}
