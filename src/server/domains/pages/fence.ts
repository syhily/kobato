export type CatalogEntryType = 'page' | 'post'

export interface CatalogEntry {
  type: CatalogEntryType
  id: number
  slug: string
}

export class CatalogConsistencyError extends Error {
  readonly conflicts: Array<{ slug: string; entries: CatalogEntry[] }>
  constructor(conflicts: Array<{ slug: string; entries: CatalogEntry[] }>) {
    const summary = conflicts
      .slice(0, 5)
      .map((c) => `${c.slug}: ${c.entries.map((e) => `${e.type}#${e.id}`).join(' vs ')}`)
      .join('; ')
    super(`Catalog slug fence violation: ${summary}`)
    this.name = 'CatalogConsistencyError'
    this.conflicts = conflicts
  }
}

export function validateSlugFence(entries: ReadonlyArray<CatalogEntry>): void {
  const seen = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const list = seen.get(entry.slug) ?? []
    list.push(entry)
    seen.set(entry.slug, list)
  }
  const conflicts: Array<{ slug: string; entries: CatalogEntry[] }> = []
  for (const [slug, list] of seen) {
    if (list.length > 1) {
      conflicts.push({ slug, entries: list })
    }
  }
  if (conflicts.length > 0) {
    throw new CatalogConsistencyError(conflicts)
  }
}
