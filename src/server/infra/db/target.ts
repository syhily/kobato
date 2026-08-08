// Polymorphic entity reference shared by the metric / comment / like
// tables. Server-only — the public wire uses `metric.public_id` UUIDs.

export type EntityType = 'post' | 'page'

export interface EntityTarget {
  type: EntityType
  ownerId: number
}

export function targetKey(target: EntityTarget): string {
  return `${target.type}:${target.ownerId}`
}
