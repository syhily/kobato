export interface LiveMeta {
  deletedAt: Date | null
  published: boolean
  publishedRevisionId: number | null
  publishedAt: Date
}

export interface LiveContentOptions {
  asOf?: Date
  includeScheduled?: boolean
}

export function isLive(meta: LiveMeta, options: LiveContentOptions = {}): boolean {
  if (meta.deletedAt !== null) {
    return false
  }
  if (!meta.published) {
    return false
  }
  if (meta.publishedRevisionId === null) {
    return false
  }
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    if (meta.publishedAt.getTime() > asOf.getTime()) {
      return false
    }
  }
  return true
}

export interface PromotedMeta {
  published: boolean
  publishedRevisionId: number | null
}

export function isPromoted(meta: PromotedMeta): meta is PromotedMeta & { publishedRevisionId: number } {
  return meta.published && meta.publishedRevisionId !== null
}
