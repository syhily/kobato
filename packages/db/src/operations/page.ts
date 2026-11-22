import type { Database } from '@kobato/db/database'

import { sqliteOf } from '@kobato/db/database'
import { liveEntityWhere } from '@kobato/db/operations/entity-meta'
import { page as pageMetaTable } from '@kobato/db/schema/page'
import { and, desc, eq } from 'drizzle-orm'

export async function findLivePageBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  const rows = await sqliteOf(db)
    .select({ id: pageMetaTable.id, title: pageMetaTable.title })
    .from(pageMetaTable)
    .where(and(eq(pageMetaTable.slug, slug), liveEntityWhere(pageMetaTable)))
    .limit(1)
  return rows[0] ?? null
}

export interface SitemapPageRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

export async function listSitemapPages(db: Database, now = new Date()): Promise<SitemapPageRow[]> {
  return sqliteOf(db)
    .select({
      slug: pageMetaTable.slug,
      firstPublishedAt: pageMetaTable.firstPublishedAt,
      publishedAt: pageMetaTable.publishedAt,
    })
    .from(pageMetaTable)
    .where(liveEntityWhere(pageMetaTable, { asOf: now }))
    .orderBy(desc(pageMetaTable.firstPublishedAt))
}
