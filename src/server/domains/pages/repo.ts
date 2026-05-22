import { and, desc, eq, getColumns, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

import type { CmsPage } from '@/server/domains/pages/projection'
import type { NewPageMeta, PageMetaRow } from '@/server/infra/db/types'
import type { Page } from '@/shared/types/catalog'

import { findContentById, findContentsByIds } from '@/server/domains/content/repo'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { hydrateImageRefs } from '@/server/domains/images/image-meta'
import { toCmsPage } from '@/server/domains/pages/projection'
import { db } from '@/server/infra/db/pool'
import { page as pageMetaTable, user } from '@/server/infra/db/schema'
import { escapeLikePattern } from '@/shared/utils/escape-like'

export {
  findContentById,
  findContentsByIds,
  findLatestDraft,
  findLatestRevision,
  listRevisions,
  maxRevisionNo,
  publishLatestRevision,
  saveDraftRevision,
} from '@/server/domains/content/repo'
export type {
  ContentType,
  PublishLatestInput,
  PublishLatestResult,
  SaveDraftInput,
  SaveDraftResult,
} from '@/server/domains/content/schema'

// --- Reads -------------------------------------------------------------------

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

export interface ListPagesFilters {
  /** Free-text query matched case-insensitively against `slug` and `title`. */
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
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
  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    conditions.push(sql`(${pageMetaTable.slug} ILIKE ${pattern} OR ${pageMetaTable.title} ILIKE ${pattern})`)
  }
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

export async function listPageMetas(filters: ListPagesFilters = {}): Promise<PageMetaWithAuthor[]> {
  const where = buildPagesWhere(filters)
  const base = db
    .select({
      ...getColumns(pageMetaTable),
      authorName: user.name,
    })
    .from(pageMetaTable)
    .leftJoin(user, eq(user.id, pageMetaTable.authorId))
    .orderBy(desc(pageMetaTable.updatedAt))
  let q = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

export async function countPageMetas(filters: ListPagesFilters = {}): Promise<number> {
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

export async function findPageMetaById(id: bigint): Promise<PageMetaRow | null> {
  const rows = await db.select().from(pageMetaTable).where(eq(pageMetaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findPageMetaBySlug(slug: string): Promise<PageMetaRow | null> {
  const rows = await db.select().from(pageMetaTable).where(eq(pageMetaTable.slug, slug)).limit(1)
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
export async function findPublicPageMetaBySlug(slug: string): Promise<PageMetaRow | null> {
  const rows = await db
    .select()
    .from(pageMetaTable)
    .where(and(eq(pageMetaTable.slug, slug), isNull(pageMetaTable.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** All non-deleted page meta rows; cataloged at startup. */
export async function listPublicPageMetas(): Promise<PageMetaRow[]> {
  return db
    .select()
    .from(pageMetaTable)
    .where(isNull(pageMetaTable.deletedAt))
    .orderBy(desc(pageMetaTable.firstPublishedAt))
}

// --- Writes ------------------------------------------------------------------

export async function insertPageMeta(values: NewPageMeta): Promise<PageMetaRow> {
  const rows = await db.insert(pageMetaTable).values(values).returning()
  return rows[0]
}

export async function updatePageMetaById(
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
export async function softDeletePageMeta(id: bigint): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(pageMetaTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(pageMetaTable.id, id), isNull(pageMetaTable.deletedAt)))
    .returning({ id: pageMetaTable.id })
  return rows.length > 0
}

export async function restorePageMeta(id: bigint): Promise<boolean> {
  const rows = await db
    .update(pageMetaTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(pageMetaTable.id, id))
    .returning({ id: pageMetaTable.id })
  return rows.length > 0
}

// --- Hydrated queries (return public Page DTOs) ------------------------------

async function hydratePageImages(pages: Page[]): Promise<void> {
  await hydrateImageRefs(
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

export async function findPageBySlug(slug: string): Promise<Page | null> {
  const meta = await findPublicPageMetaBySlug(slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  const page = buildDbPage(toCmsPage(meta, revision))
  await hydratePageImages([page])
  return page
}

export async function listAllPages(): Promise<Page[]> {
  const metas = await listPublicPageMetas()
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    return []
  }

  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, Awaited<ReturnType<typeof findContentsByIds>>[number]>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }

  const pages = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return buildDbPage(toCmsPage(meta, revision))
  })
  await hydratePageImages(pages)
  return pages
}
