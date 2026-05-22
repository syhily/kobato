// Polymorphic entity reference shared by the metric / comment / like
// tables. Mirrors the `(type, owner_id)` discriminator the `content`
// table established for revision rows (`schema.ts` `content` block).
// Server-only because `ownerId` is a `bigint` and the public wire uses
// the opaque `metric.public_id` UUID instead.

import { idFromString } from '@/shared/utils/id'

export type EntityType = 'post' | 'page'

export interface EntityTarget {
  type: EntityType
  ownerId: bigint
}

export function targetKey(target: EntityTarget): string {
  return `${target.type}:${target.ownerId}`
}

export function parseTargetKey(key: string): EntityTarget | null {
  const idx = key.indexOf(':')
  if (idx <= 0) {
    return null
  }
  const type = key.slice(0, idx)
  if (type !== 'post' && type !== 'page') {
    return null
  }
  const idStr = key.slice(idx + 1)
  if (idStr === '') {
    return null
  }
  try {
    return { type, ownerId: idFromString(idStr) }
  } catch {
    return null
  }
}
