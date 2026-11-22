import type { Database } from '@kobato/db/database'
import type { EntityType } from '@kobato/db/target'

import { sqliteOf } from '@kobato/db/database'
import { content as contentTable } from '@kobato/db/schema/content'
import { friend } from '@kobato/db/schema/friend'
import { page } from '@kobato/db/schema/page'
import { post } from '@kobato/db/schema/post'
import { category } from '@kobato/db/schema/taxonomy'
import { count, eq, inArray, ne } from 'drizzle-orm'

export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

export async function findEntitySlugTitle(
  db: Database,
  target: { type: 'post' | 'page'; ownerId: number },
): Promise<{ slug: string; title: string } | null> {
  const sdb = sqliteOf(db)
  if (target.type === 'post') {
    const rows = await sdb
      .select({ slug: post.slug, title: post.title })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0] ?? null
  }
  const rows = await sdb
    .select({ slug: page.slug, title: page.title })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0] ?? null
}

export async function resolveEntitiesForComments(
  db: Database,
  pairs: ReadonlyArray<{ type: EntityType; ownerId: number }>,
): Promise<Map<string, EntitySlugTitle>> {
  const out = new Map<string, EntitySlugTitle>()
  if (pairs.length === 0) {
    return out
  }
  const postIds: number[] = []
  const pageIds: number[] = []
  const seen = new Set<string>()
  for (const p of pairs) {
    const key = `${p.type}:${p.ownerId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    if (p.type === 'post') {
      postIds.push(p.ownerId)
    } else if (p.type === 'page') {
      pageIds.push(p.ownerId)
    }
  }
  const sdb = sqliteOf(db)
  if (postIds.length > 0) {
    const rows = await sdb
      .select({ id: post.id, slug: post.slug, title: post.title })
      .from(post)
      .where(inArray(post.id, postIds))
    for (const r of rows) {
      out.set(`post:${r.id}`, { type: 'post', slug: r.slug, title: r.title })
    }
  }
  if (pageIds.length > 0) {
    const rows = await sdb
      .select({ id: page.id, slug: page.slug, title: page.title })
      .from(page)
      .where(inArray(page.id, pageIds))
    for (const r of rows) {
      out.set(`page:${r.id}`, { type: 'page', slug: r.slug, title: r.title })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Asset URL backfill persistence
// ---------------------------------------------------------------------------

export interface ContentBodyRow {
  id: number
  body: unknown
}

export async function listContentBodies(db: Database): Promise<ContentBodyRow[]> {
  return sqliteOf(db).select({ id: contentTable.id, body: contentTable.body }).from(contentTable)
}

export async function updateContentBody(
  db: Database,
  id: number,
  values: { body: unknown; projections?: { bodyHtml: string; bodyText: string; bodyHtmlFeed: string } | null },
): Promise<void> {
  await sqliteOf(db)
    .update(contentTable)
    .set(
      values.projections === null || values.projections === undefined
        ? { body: values.body }
        : {
            body: values.body,
            bodyHtml: values.projections.bodyHtml,
            bodyText: values.projections.bodyText,
            bodyHtmlFeed: values.projections.bodyHtmlFeed,
          },
    )
    .where(eq(contentTable.id, id))
}

export type CoverOwnerEntity = 'post' | 'page' | 'friend' | 'category'

export interface EntityCoverRow {
  id: number
  url: string
}

export async function listNonEmptyCoverRows(db: Database, entity: CoverOwnerEntity): Promise<EntityCoverRow[]> {
  const sdb = sqliteOf(db)
  switch (entity) {
    case 'post':
      return sdb.select({ id: post.id, url: post.cover }).from(post).where(ne(post.cover, ''))
    case 'page':
      return sdb.select({ id: page.id, url: page.cover }).from(page).where(ne(page.cover, ''))
    case 'friend':
      return sdb.select({ id: friend.id, url: friend.poster }).from(friend).where(ne(friend.poster, ''))
    case 'category':
      return sdb.select({ id: category.id, url: category.cover }).from(category).where(ne(category.cover, ''))
  }
}

export async function updateEntityCover(
  db: Database,
  entity: CoverOwnerEntity,
  id: number,
  cover: string,
): Promise<void> {
  const sdb = sqliteOf(db)
  switch (entity) {
    case 'post':
      await sdb.update(post).set({ cover }).where(eq(post.id, id))
      return
    case 'page':
      await sdb.update(page).set({ cover }).where(eq(page.id, id))
      return
    case 'friend':
      await sdb.update(friend).set({ poster: cover }).where(eq(friend.id, id))
      return
    case 'category':
      await sdb.update(category).set({ cover }).where(eq(category.id, id))
  }
}

// ---------------------------------------------------------------------------
// Body projection rebuild (dashboard re-project)
// ---------------------------------------------------------------------------

export interface ContentProjectionRow {
  id: number
  type: string
  ownerId: number
  revisionNo: number
  body: unknown
  bodyHtml: string | null
  bodyText: string | null
  bodyHtmlFeed: string | null
}

export async function listContentProjectionRows(
  db: Database,
  offset: number,
  limit: number,
): Promise<ContentProjectionRow[]> {
  return sqliteOf(db)
    .select({
      id: contentTable.id,
      type: contentTable.type,
      ownerId: contentTable.ownerId,
      revisionNo: contentTable.revisionNo,
      body: contentTable.body,
      bodyHtml: contentTable.bodyHtml,
      bodyText: contentTable.bodyText,
      bodyHtmlFeed: contentTable.bodyHtmlFeed,
    })
    .from(contentTable)
    .orderBy(contentTable.id)
    .limit(limit)
    .offset(offset)
}

export async function countContentRows(db: Database): Promise<number> {
  const rows = await sqliteOf(db).select({ count: count() }).from(contentTable)
  return rows[0].count
}

export async function updateContentProjections(
  db: Database,
  id: number,
  projections: { bodyHtml: string; bodyText: string; bodyHtmlFeed: string },
): Promise<void> {
  await sqliteOf(db).update(contentTable).set(projections).where(eq(contentTable.id, id))
}
