import type { Database } from '@kobato/db/database'

import {
  countPostsByTaxonomy as countPostsByTaxonomyOp,
  listPostTitlesByCategoryId as listPostTitlesByCategoryIdOp,
  listPostTitlesByTag as listPostTitlesByTagOp,
} from '@kobato/db/operations/post'

export async function listPostTitlesByTaxonomy(db: Database, name: string): Promise<string[]> {
  return listPostTitlesByTagOp(db, name)
}

export async function listPostTitlesByCategoryId(db: Database, id: number): Promise<string[]> {
  return listPostTitlesByCategoryIdOp(db, id)
}

export interface CountPostsByTaxonomyOptions {
  kind: 'category' | 'tag'
  gate: 'admin' | 'public'
  name?: string
  names?: readonly string[]
}

export async function countPostsByTaxonomy(
  db: Database,
  options: CountPostsByTaxonomyOptions,
): Promise<Map<string, number>> {
  return countPostsByTaxonomyOp(db, options)
}
