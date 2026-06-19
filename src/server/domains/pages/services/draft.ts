import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'

import { publishLatestRevision, saveDraftRevision } from '@/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft, findLatestRevision } from '@/server/domains/content/repos/query'
import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { toCmsPage, type CmsPage } from '@/server/domains/pages/projection'
import { findPageMetaById, findPublicPageMetaBySlug } from '@/server/domains/pages/repo'
import { syncLibraryImageBlocks } from '@/server/domains/pages/services/image-sync'
import {
  clearPagesCache,
  projectSaveResult,
  type SavePageBodyInput,
  type SavePageResult,
} from '@/server/domains/pages/services/shared'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { collectInklingHeadings } from '@/shared/inkling/headings'
import { collectInklingImageStoragePaths } from '@/shared/inkling/images'

const log = getLogger('pages.service')
const auditLog = getLogger('audit.cms.pages')

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
 */
export async function loadPageDraftPreviewBySlug(db: NodePgDatabase, slug: string): Promise<PageDraftPreview | null> {
  const meta = await findPublicPageMetaBySlug(db, slug)
  if (meta === null) {
    return null
  }
  const draft = await findLatestDraft(db, 'page', meta.id)
  let revision: ContentRow | null = draft
  if (revision === null && meta.publishedRevisionId !== null) {
    revision = await findContentById(db, meta.publishedRevisionId)
  }
  return { page: toCmsPage(meta, revision), hasNewerDraft: draft !== null }
}

async function savePageBodyInternal(
  db: NodePgDatabase,
  input: SavePageBodyInput,
  mode: 'draft' | 'publish',
): Promise<SavePageResult> {
  const meta = await findPageMetaById(db, input.pageId)
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const body = await canonicalizeBodyOrThrow(input.body)

  const warnings: string[] = []

  try {
    await syncLibraryImageBlocks(db, body)
  } catch (err: unknown) {
    log.warn('sync library image blocks failed', { pageId: input.pageId, error: err })
    warnings.push('图片库同步失败，部分图片可能无法正常显示。')
  }

  const imageSources = collectInklingImageStoragePaths(body)
  const headings = collectInklingHeadings(body, deriveSlug)

  const overwriteContext = input.force === true ? await findLatestRevision(db, 'page', meta.id).catch(() => null) : null

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
      ? await saveDraftRevision(db, 'page', repoInput)
      : await publishLatestRevision(db, 'page', { ...repoInput, publishedAt: input.publishedAt })

  const wroteSuccessfully = result.status === 'saved' || result.status === 'published'
  if (input.force === true && wroteSuccessfully && overwriteContext !== null) {
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
    await clearPagesCache()
    await clearSitemapCache().catch((err: unknown) => {
      log.warn('clear sitemap cache failed', { pageId: input.pageId, error: err })
    })
  }
  return projectSaveResult(result, warnings.length > 0 ? warnings.join(' ') : undefined)
}

export function saveDraft(db: NodePgDatabase, input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(db, input, 'draft')
}

export function publishLatest(db: NodePgDatabase, input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(db, input, 'publish')
}

// Convenience for the editor "preview" path: fetch + project the
// latest draft, falling back to the published revision when the
// editor is opened without an in-progress draft.
export async function loadEditorBody(
  db: NodePgDatabase,
  id: bigint,
): Promise<{
  meta: PageMetaRow
  draft: ContentRow | null
  published: ContentRow | null
}> {
  const meta = await findPageMetaById(db, id)
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const [draft, published] = await Promise.all([
    findLatestDraft(db, 'page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
  ])
  return { meta, draft, published }
}
