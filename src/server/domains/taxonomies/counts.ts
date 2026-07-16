import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, sql, type SQL } from 'drizzle-orm'

import { livePostWhere } from '@/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'

export interface CountPostsByTaxonomyOptions {
  kind: 'category' | 'tag'
  /**
   * `admin` counts every live post including scheduled ones (admin
   * screens show what will go live); `public` counts only posts that
   * are live right now AND `visible`.
   */
  gate: 'admin' | 'public'
  /** Narrow the count to a single taxonomy term (e.g. the just-upserted row). */
  name?: string
}

/**
 * The single implementation behind every per-term post count — admin
 * screens and public catalog alike. Both gates delegate to
 * `livePostWhere`, the repo-bound live gate, so a count can never drift
 * from what "live" means. Returns a `Map<term name, count>`; terms with
 * no matching posts are absent (callers default to 0).
 */
export async function countPostsByTaxonomy(
  db: NodePgDatabase,
  options: CountPostsByTaxonomyOptions,
): Promise<Map<string, number>> {
  const gate =
    options.gate === 'admin'
      ? livePostWhere({ includeScheduled: true })
      : and(livePostWhere(), eq(postMetaTable.visible, true))!

  if (options.kind === 'category') {
    const conditions: SQL[] = [gate]
    if (options.name !== undefined) {
      conditions.push(eq(postMetaTable.category, options.name))
    }
    const rows = await db
      .select({ name: postMetaTable.category, count: sql<number>`count(${postMetaTable.id})::int` })
      .from(postMetaTable)
      .where(and(...conditions))
      .groupBy(postMetaTable.category)
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (row.name) {
        counts.set(row.name, row.count)
      }
    }
    return counts
  }

  const base = db
    .select({ name: tagTable.name, count: sql<number>`count(${postMetaTable.id})::int` })
    .from(tagTable)
    .leftJoin(postTag, eq(postTag.tagId, tagTable.id))
    .leftJoin(postMetaTable, and(eq(postMetaTable.id, postTag.postId), gate))
    .$dynamic()
  const rows = await (options.name !== undefined ? base.where(eq(tagTable.name, options.name)) : base).groupBy(
    tagTable.name,
  )
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.name, row.count)
  }
  return counts
}
