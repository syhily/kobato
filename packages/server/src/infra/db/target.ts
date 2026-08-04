// Polymorphic entity reference shared by the metric / comment / like
// tables. Mirrors the `(type, owner_id)` discriminator the `content`
// table established for revision rows (`schema.ts` `content` block).
// Server-only because the public wire uses the opaque `metric.public_id`
// UUID instead of the numeric id.

export type EntityType = 'post' | 'page'

export interface EntityTarget {
  type: EntityType
  ownerId: number
}

export function targetKey(target: EntityTarget): string {
  return `${target.type}:${target.ownerId}`
}
