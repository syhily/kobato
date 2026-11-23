export type EntityType = 'post' | 'page'

export interface EntityTarget {
  type: EntityType
  ownerId: number
}

export function targetKey(target: EntityTarget): string {
  return `${target.type}:${target.ownerId}`
}
