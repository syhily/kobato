import type { ContentType } from '@/server/domains/content/schemas/revision'
import type { Database } from '@/server/infra/db/database'

import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'
import { isUniqueConstraintError } from '@/server/infra/http/errors'

const ENTITY_LABEL: Record<ContentType, string> = { post: '文章', page: '页面' }

/** Re-claims a soft-deleted entity's slug during restore; returns the warning when occupied or stolen mid-restore. */
// Sync (node:sqlite): transactions are sync callbacks.
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
    // SQLite names columns, not the index.
    if (!isUniqueConstraintError(err, 'slug_registry.slug')) {
      throw err
    }
    return `slug "${slug}" 在恢复过程中被其它内容占用，URL 不会指向此${ENTITY_LABEL[entityType]}。`
  }
  return undefined
}
