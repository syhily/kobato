import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'

import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { syncLibraryImageBlocks } from '@/server/domains/pages/image-sync'
import {
  toAdminPageDto,
  toAdminRevisionDto,
  toCmsPage,
  type AdminPageDetailDto,
  type AdminPageDto,
  type AdminRevisionDto,
  type CmsPage,
} from '@/server/domains/pages/projection'
import {
  countPageMetas,
  findContentById,
  findContentsByIds,
  findLatestDraft,
  findLatestRevision,
  findPageMetaById,
  findPageMetaBySlug,
  findPublicPageMetaBySlug,
  insertPageMeta,
  listPageMetas,
  listPublicPageMetas,
  listRevisions,
  publishLatestRevision,
  restorePageMeta,
  saveDraftRevision,
  softDeletePageMeta,
  updatePageMetaById,
  type ListPagesFilters,
  type PublishLatestResult,
  type SaveDraftResult,
} from '@/server/domains/pages/repo'
import { createProcessCache } from '@/server/infra/cache/process-cache'
import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetric } from '@/server/infra/db/operations/metric'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

// Audit logger for force-overwrite saves. Emits at info level so
// admin actions stay visible in production without being noisy in
// dev. Fields:
//   - actor (admin user id, L2)
//   - pageMetaId (page id, L2)
//   - overwrittenRevisionId (server's latest revision id when the
//     conflict guard was bypassed)
//   - overwrittenRevisionToken (the token the server held just
//     before the overwrite)
//   - clientExpectedToken (what the client thought it was rebasing
//     against — handy for forensics)
//   - mode ('draft' | 'publish')
//   - resultRevisionId (the row that ended up persisted)
const log = getLogger('pages.service')
const auditLog = getLogger('audit.cms.pages')

// Service layer for the page CMS. Wraps the repository's transactional
// state machines with input validation, ActionFailure surfacing, and
// the projections the API/SSR consumers want.
//
// All public functions in this module either return a DTO ready to
// hand to the wire, or throw `ActionFailure` (translated by `runApi`
// at the route perimeter into the standard error envelope).

// --- Public catalog --------------------------------------------------------

// Visibility gate shared by the listing and single-page lookups.
// A page is considered live publicly iff:
const pagesCache = createProcessCache<CmsPage[]>({ ttlMs: 10_000 })

function clearPagesCache(): void {
  pagesCache.clear()
}

/** All non-deleted, non-scheduled, published pages joined with their content. */
export async function loadCatalogPages(): Promise<CmsPage[]> {
  const cached = pagesCache.get()
  if (cached !== null) {
    return cached.map((p) => ({ ...p }))
  }
  const metas = await listPublicPageMetas()
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    pagesCache.set([])
    return []
  }
  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, ContentRow>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }
  const result = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPage(meta, revision)
  })
  pagesCache.set(result)
  return result.map((p) => ({ ...p }))
}

/**
 * Single-page lookup for the public detail route. Returns `null` when
 * the slug is unknown, soft-deleted, taken offline, or scheduled for
 * the future. Soft-deleted pages 404; pages with `published=false`
 * on the meta row also 404 — same semantics as MDX `published` on posts.
 * Scheduled (future-dated) pages
 * 404 too so the catalog stays consistent with `loadCatalogPages()`.
 */
export async function loadCatalogPageBySlug(slug: string): Promise<CmsPage | null> {
  const meta = await findPublicPageMetaBySlug(slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  return toCmsPage(meta, revision)
}

/**
 * Result of `loadPageDraftPreviewBySlug`. The caller (the page-detail
 * route) picks the on-screen draft marker from the combination of
 * `page.published` and `hasNewerDraft`:
 *
 *   - unpublished page                      → 【草稿】
 *   - published page + hasNewerDraft        → 【未发布的草稿】
 *   - published page + !hasNewerDraft       → 【已发布的草稿】
 *
 * Soft-deleted rows still return `null`.
 */
export interface PageDraftPreview {
  page: CmsPage
  /**
   * True when the page has a `status='draft'` revision newer than its
   * `publishedRevisionId`. The body returned in `page` is the draft
   * one when this is true.
   */
  hasNewerDraft: boolean
}

/**
 * Admin-only single-page lookup that surfaces draft / unpublished /
 * scheduled rows so an authenticated admin can preview the page
 * exactly as it would render once published — and, on already-live
 * pages, can preview the in-progress draft via `?draft=true`.
 *
 * Body resolution: the latest `status='draft'` revision wins when
 * one exists (the admin is mid-edit). Otherwise the published
 * revision wins (the page is steady-state). When neither exists
 * (a freshly-created page that hasn't been saved yet) the body is
 * the empty array and `hasNewerDraft` is `false`.
 *
 * Soft-deleted rows still return `null`: an admin who wants the
 * deleted page back must restore it first from `/admin/pages`.
 */
export async function loadPageDraftPreviewBySlug(slug: string): Promise<PageDraftPreview | null> {
  const meta = await findPublicPageMetaBySlug(slug)
  if (meta === null) {
    return null
  }
  const draft = await findLatestDraft('page', meta.id)
  let revision: ContentRow | null = draft
  if (revision === null && meta.publishedRevisionId !== null) {
    revision = await findContentById(meta.publishedRevisionId)
  }
  return { page: toCmsPage(meta, revision), hasNewerDraft: draft !== null }
}

// --- Admin list / get ------------------------------------------------------

export interface AdminPagesListResult {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

export async function listPagesForAdmin(filters: ListPagesFilters = {}): Promise<AdminPagesListResult> {
  const offset = filters.offset ?? 0
  const limit = filters.limit ?? 100
  const [rows, total] = await Promise.all([listPageMetas({ ...filters, limit, offset }), countPageMetas(filters)])
  if (rows.length === 0) {
    return { pages: [], total, hasMore: false }
  }
  // Ensure every listed page has a `metric` row so the admin
  // comment-count link can compose `?pageKey=<publicId>` even before
  // the page has been visited publicly. The upsert is idempotent and
  // batched in a single Promise.all.
  const ownerIds = rows.map((row) => row.id)
  await Promise.all(rows.map((row) => ensureMetric({ type: 'page', ownerId: row.id })))
  const [metrics, countRows] = await Promise.all([
    metricsByOwnerIds('page', ownerIds),
    commentCountsByOwnerIds('page', ownerIds),
  ])
  const publicIdByOwner = new Map(metrics.map((m) => [String(m.ownerId), m.publicId]))
  const countByOwner = new Map(countRows.map((r) => [String(r.ownerId), r.count]))
  return {
    pages: rows.map((row) =>
      toAdminPageDto(row, {
        commentCount: countByOwner.get(String(row.id)) ?? 0,
        commentPublicId: publicIdByOwner.get(String(row.id)) ?? '',
      }),
    ),
    total,
    hasMore: offset + rows.length < total,
  }
}

export async function getPageDetailForAdmin(id: bigint): Promise<AdminPageDetailDto | null> {
  const meta = await findPageMetaById(id)
  if (meta === null) {
    return null
  }
  const [latest, published] = await Promise.all([
    findLatestRevision('page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(meta.publishedRevisionId),
  ])
  return {
    page: toAdminPageDto(meta),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(id: bigint): Promise<AdminRevisionDto[]> {
  const rows = await listRevisions('page', id)
  return rows.map(toAdminRevisionDto)
}

// --- Admin metadata CRUD ---------------------------------------------------

const RESERVED_PAGE_SLUGS = new Set<string>([
  // Route-prefix fence only. page↔post slug uniqueness is enforced by
  // `validateSlugFence` at every catalog snapshot rebuild.
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

const SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export interface UpsertPageMetaInput {
  /** Existing page id; omitted on create. */
  id?: bigint
  /**
   * Explicit URL slug. Optional — when omitted (or empty), the
   * service derives one from `title` via `deriveSlug` (the canonical
   * pinyin -> github-slugger pipeline). Authors only set this when
   * they want a custom URL like `about-us` for a Han-titled page.
   */
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  /**
   * Render the「修改于 XXXX」secondary timestamp on the public detail
   * page. Defaults `false` on create so most pages stay single-date.
   */
  showUpdated?: boolean
  /**
   * Render the global friends grid at the bottom of the page (see
   * `routes/public/page/detail.tsx`). Defaults to `false` on create — only
   * the legacy `links` page typically opts in.
   */
  showFriends?: boolean
  publishedAt?: Date
}

function ensureSlugLegal(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new DomainError('BAD_REQUEST', '页面 slug 格式不合法（仅允许小写字母、数字、`-` `_` `.`）。')
  }
  if (slug.length > 80) {
    throw new DomainError('BAD_REQUEST', '页面 slug 长度不得超过 80 个字符。')
  }
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`)
  }
}

// Resolve the effective slug. An explicit non-empty value wins; an
// empty / missing value falls back to `deriveSlug(title)`. Pages that
// can't produce a slug from their title (e.g. emoji-only titles) get
// a friendly 400 instead of falling through to the regex check with
// the empty string.
function resolveSlugForPage(explicit: string | undefined, title: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim()
  }
  const derived = deriveSlug(title)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从标题推导出 slug，请手动填写。', [
      { message: '标题推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}

export async function createPage(input: UpsertPageMetaInput, authorId: bigint | null): Promise<AdminPageDto> {
  const slug = resolveSlugForPage(input.slug, input.title)
  ensureSlugLegal(slug)
  // page↔page collision; the cross-table page↔post fence runs in the
  // catalog snapshot rebuild after invalidate.
  const collision = await findPageMetaBySlug(slug)
  if (collision !== null) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
  }
  const now = new Date()
  const row = await insertPageMeta({
    slug,
    title: input.title,
    summary: input.summary ?? '',
    cover: input.cover ?? '',
    og: input.og ?? null,
    // New pages default to `published = false` — creating + saving
    // is "draft only". The page becomes public when the operator
    // hits "发布" (which both promotes the latest revision *and*
    // flips this flag in the same transaction).
    published: false,
    commentsEnabled: input.commentsEnabled ?? true,
    showToc: input.showToc ?? false,
    showUpdated: input.showUpdated ?? false,
    showFriends: input.showFriends ?? false,
    publishedAt: input.publishedAt ?? now,
    authorId,
  })
  clearPagesCache()
  return toAdminPageDto(row)
}

export async function updatePageMeta(input: UpsertPageMetaInput): Promise<AdminPageDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePageMeta requires an id')
  }
  const slug = resolveSlugForPage(input.slug, input.title)
  ensureSlugLegal(slug)
  const existing = await findPageMetaById(input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  if (existing.slug !== slug) {
    const collision = await findPageMetaBySlug(slug)
    if (collision !== null && collision.id !== input.id) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
    }
  }
  const updated = await updatePageMetaById(input.id, {
    slug,
    title: input.title,
    summary: input.summary ?? existing.summary,
    cover: input.cover ?? existing.cover,
    og: input.og === undefined ? existing.og : input.og,
    commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
    showToc: input.showToc ?? existing.showToc,
    showUpdated: input.showUpdated ?? existing.showUpdated,
    showFriends: input.showFriends ?? existing.showFriends,
    publishedAt: input.publishedAt ?? existing.publishedAt,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  clearPagesCache()
  return toAdminPageDto(updated)
}

export async function deletePage(id: bigint): Promise<{ deleted: boolean }> {
  const deleted = await softDeletePageMeta(id)
  if (deleted) {
    clearPagesCache()
  }
  return { deleted }
}

export async function restorePage(id: bigint): Promise<{ restored: boolean }> {
  const restored = await restorePageMeta(id)
  if (restored) {
    clearPagesCache()
  }
  return { restored }
}

export async function unpublishPage(id: bigint): Promise<AdminPageDto> {
  const existing = await findPageMetaById(id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const updated = await updatePageMetaById(id, { published: false })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  clearPagesCache()
  return toAdminPageDto(updated)
}

// --- Save / publish --------------------------------------------------------

export interface SavePageBodyInput {
  pageId: bigint
  body: unknown
  /** When provided, must match the latest revision's token. */
  expectedClientRevisionToken?: string | null
  /** When true, ignore token mismatch and overwrite. */
  force?: boolean
  /** Author user id stamped on the saved revision. */
  authorId: bigint | null
  /**
   * Publish target (only honoured by `publishLatest`). Omit for
   * "publish immediately" (server uses `now()`); pass a future
   * `Date` to schedule. The catalog hides scheduled pages until
   * `publishedAt <= now()`.
   */
  publishedAt?: Date
}

export type SavePageResult =
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      /** Token the editor must echo on the next attempt. */
      expectedToken: string
    }

async function savePageBodyInternal(input: SavePageBodyInput, mode: 'draft' | 'publish'): Promise<SavePageResult> {
  // Ensure the page row exists before we open a transaction. Doing
  // it upfront produces a friendly 404 instead of a transaction-
  // rollback error on the operator's screen.
  const meta = await findPageMetaById(input.pageId)
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  // Validate body + pre-render heavy blocks (Shiki / KaTeX /
  // Mermaid) so SSR public renders stay cheap. The pre-render is
  // best-effort: it mutates the validated body in place, leaving
  // already-rendered fields alone and skipping blocks whose
  // renderer throws so a single bad block doesn't fail the save.
  const body = await canonicalizeBodyOrThrow(input.body)
  // Library `image` blocks (those carrying an `imageId`) are
  // re-resolved from the canonical `image` row so the body stays in
  // lockstep with the media library; external blocks are stripped of
  // any incidental `storagePath` so they aren't projected into
  // `image_sources`. Best-effort — failures don't block the save.
  await syncLibraryImageBlocks(body).catch((err: unknown) => {
    log.warn('sync library image blocks failed', { pageId: input.pageId, error: err })
  })
  const imageSources = collectImageStoragePaths(body)
  const headings = collectHeadings(body, deriveSlug)

  // Capture the row that's about to be overwritten when force=true,
  // so we can record an audit trail even though the repo already
  // discarded that information by the time it returns. Best-effort
  // — a failure here doesn't block the save (the audit log is
  // diagnostic, not authoritative).
  const overwriteContext = input.force === true ? await findLatestRevision('page', meta.id).catch(() => null) : null

  const repoInput = {
    ownerId: meta.id,
    body,
    imageSources,
    headings,
    authorId: input.authorId,
    expectedClientRevisionToken: input.expectedClientRevisionToken,
    force: input.force,
  }

  const result =
    mode === 'draft'
      ? await saveDraftRevision('page', repoInput)
      : // Publish path: pass through the optional `publishedAt`. The
        // repo defaults to `now()` when undefined, so omitting it from
        // the wire = "publish immediately".
        await publishLatestRevision('page', { ...repoInput, publishedAt: input.publishedAt })
  // Repository status is `'saved'` for drafts and `'published'` for
  // publishes — both indicate a successful write that the audit
  // trail should observe.
  const wroteSuccessfully = result.status === 'saved' || result.status === 'published'
  if (input.force === true && wroteSuccessfully && overwriteContext !== null) {
    // We only emit when an overwrite was actually consequential —
    // i.e. the server's stored token differed from what the client
    // expected. Equal tokens with `force=true` is a no-op overwrite
    // (e.g. the user clicked "use local" on a body that hadn't
    // really diverged) and isn't worth a log line.
    if (
      input.expectedClientRevisionToken === undefined ||
      input.expectedClientRevisionToken !== overwriteContext.clientRevisionToken
    ) {
      auditLog.info('force_overwrite_save', {
        mode,
        actor: input.authorId === null ? null : input.authorId.toString(),
        pageMetaId: meta.id.toString(),
        overwrittenRevisionId: overwriteContext.id.toString(),
        overwrittenRevisionToken: overwriteContext.clientRevisionToken,
        clientExpectedToken: input.expectedClientRevisionToken ?? null,
        resultRevisionId: result.row.id.toString(),
      })
    }
  }
  if (mode === 'publish' && wroteSuccessfully) {
    clearPagesCache()
  }
  return projectSaveResult(result)
}

export function saveDraft(input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(input, 'draft')
}

export function publishLatest(input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(input, 'publish')
}

function projectSaveResult(result: SaveDraftResult | PublishLatestResult): SavePageResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row) }
}

// --- Re-exports -------------------------------------------------------------

export type { AdminPageDetailDto, AdminPageDto, AdminRevisionDto, CmsPage } from '@/server/domains/pages/projection'

// Convenience for the editor "preview" path: fetch + project the
// latest draft, falling back to the published revision when the
// editor is opened without an in-progress draft.
export async function loadEditorBody(id: bigint): Promise<{
  meta: PageMetaRow
  draft: ContentRow | null
  published: ContentRow | null
}> {
  const meta = await findPageMetaById(id)
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const [draft, published] = await Promise.all([
    findLatestDraft('page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(meta.publishedRevisionId),
  ])
  return { meta, draft, published }
}
