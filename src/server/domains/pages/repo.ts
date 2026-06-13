import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, getColumns, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import type { CmsPage } from '@/server/domains/pages/projection'
import type { NewPageMeta, PageMetaRow } from '@/server/infra/db/types'
import type { Page } from '@/shared/types/catalog'

import { findContentById, findContentsByIds } from '@/server/domains/content/repos/query'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toCmsPage } from '@/server/domains/pages/projection'
import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { user } from '@/server/infra/db/schema/user'

// --- Reads -------------------------------------------------------------------

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

export interface ListPagesFilters {
  /** Free-text query matched case-insensitively against `slug` and `title`. */
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
  /** Published state filter. */
  published?: boolean
  /** Filter by author. */
  authorId?: bigint
  /** Zero-based offset for pagination. */
  offset?: number
  /** Page size. When undefined every match is returned. */
  limit?: number
}

function buildPagesWhere(filters: ListPagesFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.deletedStatus === 'deleted') {
    conditions.push(isNotNull(pageMetaTable.deletedAt))
  } else if (filters.deletedStatus === 'normal') {
    conditions.push(isNull(pageMetaTable.deletedAt))
  }
  if (filters.published !== undefined) {
    conditions.push(eq(pageMetaTable.published, filters.published))
  }
  if (filters.authorId) {
    conditions.push(eq(pageMetaTable.authorId, filters.authorId))
  }
  if (filters.q && filters.q.trim() !== '') {
    const search = or(
      ilikeEscape(pageMetaTable.slug, filters.q.trim()),
      ilikeEscape(pageMetaTable.title, filters.q.trim()),
    )
    if (search) {
      conditions.push(search)
    }
  }
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

export async function listPageMetas(db: NodePgDatabase, filters: ListPagesFilters = {}): Promise<PageMetaWithAuthor[]> {
  const where = buildPagesWhere(filters)
  const base = db
    .select({
      ...getColumns(pageMetaTable),
      authorName: user.name,
    })
    .from(pageMetaTable)
    .leftJoin(user, eq(user.id, pageMetaTable.authorId))
    .orderBy(desc(pageMetaTable.updatedAt))
  const q = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    if (filters.offset !== undefined && filters.offset > 0) {
      return q.limit(filters.limit).offset(filters.offset)
    }
    return q.limit(filters.limit)
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    return q.offset(filters.offset)
  }
  return q
}

export async function countPageMetas(db: NodePgDatabase, filters: ListPagesFilters = {}): Promise<number> {
  const where = buildPagesWhere(filters)
  const builder = where
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(pageMetaTable)
        .where(where)
    : db.select({ count: sql<number>`count(*)::int` }).from(pageMetaTable)
  const rows = await builder
  return rows[0]?.count ?? 0
}

export async function findPageMetaById(db: NodePgDatabase, id: bigint): Promise<PageMetaRow | null> {
  const rows = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findPageMetaBySlug(db: NodePgDatabase, slug: string): Promise<PageMetaRow | null> {
  const rows = await db.select().from(pageMetaTable).where(eq(pageMetaTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function findPageMetaBySlugForUpdate(db: NodePgDatabase, slug: string): Promise<PageMetaRow | null> {
  const rows = await db.select().from(pageMetaTable).where(eq(pageMetaTable.slug, slug)).for('update').limit(1)
  return rows[0] ?? null
}

/**
 * Slug-keyed lookup that **excludes** soft-deleted rows. Used by the
 * public catalog where deleted pages should 404 even if they share a
 * slug with a future restoration target. Scheduled pages (rows with
 * `published_at > now()`) are NOT filtered here because the catalog
 * caller is the only place where the visibility check belongs;
 * keeping the row reachable from the admin path through this same
 * helper would force a parallel "include scheduled" boolean. The
 * catalog applies the timestamp gate in the service layer instead.
 */
export async function findPublicPageMetaBySlug(db: NodePgDatabase, slug: string): Promise<PageMetaRow | null> {
  const rows = await db
    .select()
    .from(pageMetaTable)
    .where(and(eq(pageMetaTable.slug, slug), isNull(pageMetaTable.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** All non-deleted page meta rows; cataloged at startup. */
export async function listPublicPageMetas(db: NodePgDatabase, limit = 500): Promise<PageMetaRow[]> {
  return db
    .select()
    .from(pageMetaTable)
    .where(isNull(pageMetaTable.deletedAt))
    .orderBy(desc(pageMetaTable.firstPublishedAt))
    .limit(limit)
}

/** Slim row for sitemap generation — only the fields needed to derive `permalink` + `lastmod`. */
export interface SitemapPageRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

/**
 * Sitemap-only projection of published pages. Mirrors the visibility
 * gate enforced by `isCatalogVisible` (used inside `listAllPages`) —
 * not deleted, published, has a published revision, `published_at`
 * not in the future — but selects only `slug` + `firstPublishedAt` +
 * `publishedAt` to skip the revision-join + image-hydration the full
 * `listAllPages` path performs.
 */
export async function listSitemapPages(db: NodePgDatabase, now = new Date()): Promise<SitemapPageRow[]> {
  return db
    .select({
      slug: pageMetaTable.slug,
      firstPublishedAt: pageMetaTable.firstPublishedAt,
      publishedAt: pageMetaTable.publishedAt,
    })
    .from(pageMetaTable)
    .where(
      and(
        isNull(pageMetaTable.deletedAt),
        eq(pageMetaTable.published, true),
        isNotNull(pageMetaTable.publishedRevisionId),
        sql`${pageMetaTable.publishedAt} <= ${now}`,
      ),
    )
    .orderBy(desc(pageMetaTable.firstPublishedAt))
}

// --- Writes ------------------------------------------------------------------

export async function insertPageMeta(db: NodePgDatabase, values: NewPageMeta): Promise<PageMetaRow> {
  const rows = await db.insert(pageMetaTable).values(values).returning()
  return rows[0]
}

export async function updatePageMetaById(
  db: NodePgDatabase,
  id: bigint,
  patch: Partial<Omit<NewPageMeta, 'id' | 'createdAt'>>,
): Promise<PageMetaRow | null> {
  const rows = await db
    .update(pageMetaTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pageMetaTable.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * Soft-delete: stamp `deleted_at` so listing routes hide the row but
 * the rows themselves stay around for `restorePage`. Returns false
 * when the row was already deleted (idempotent for the admin button).
 */
export async function softDeletePageMeta(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(pageMetaTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(pageMetaTable.id, id), isNull(pageMetaTable.deletedAt)))
    .returning({ id: pageMetaTable.id })
  return rows.length > 0
}

export async function restorePageMeta(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const rows = await db
    .update(pageMetaTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(pageMetaTable.id, id))
    .returning({ id: pageMetaTable.id })
  return rows.length > 0
}

// --- Hydrated queries (return public Page DTOs) ------------------------------

async function hydratePageImages(db: NodePgDatabase, pages: Page[]): Promise<void> {
  await hydrateImageRefs(
    db,
    pages,
    (p) => p.cover,
    (p, lookup) => {
      p.coverThumbhash = lookup?.thumbhash
      p.coverWidth = lookup?.width
      p.coverHeight = lookup?.height
      if (lookup?.publicUrl != null) {
        p.cover = lookup.publicUrl
      }
    },
  )
}

// Promote a `CmsPage` (DB-backed projection) into the public `Page` shape.
export function buildDbPage(page: CmsPage): Page {
  return {
    id: page.id,
    title: page.title,
    date: page.date,
    updated: page.updated,
    comments: page.comments,
    cover: page.cover,
    coverThumbhash: page.coverThumbhash,
    coverWidth: page.coverWidth,
    coverHeight: page.coverHeight,
    og: page.og,
    published: page.published,
    summary: page.summary,
    toc: page.toc,
    showUpdated: page.showUpdated,
    showFriends: page.showFriends,
    slug: page.slug,
    permalink: page.permalink,
    headings: page.headings,
    body: page.body,
    imageSources: page.imageSources,
    publishedRevisionId: page.publishedRevisionId,
  }
}

export async function findPageBySlug(db: NodePgDatabase, slug: string): Promise<Page | null> {
  const meta = await findPublicPageMetaBySlug(db, slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(db, meta.publishedRevisionId)
  const page = buildDbPage(toCmsPage(meta, revision))
  await hydratePageImages(db, [page])
  return page
}

export async function listAllPages(db: NodePgDatabase): Promise<Page[]> {
  const metas = await listPublicPageMetas(db)
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    return []
  }

  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, Awaited<ReturnType<typeof findContentsByIds>>[number]>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(db, revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }

  const pages = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return buildDbPage(toCmsPage(meta, revision))
  })
  await hydratePageImages(db, pages)
  return pages
}
