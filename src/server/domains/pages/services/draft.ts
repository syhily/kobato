import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'

import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { syncLibraryImageBlocks } from '@/server/domains/pages/image-sync'
import { toCmsPage, type CmsPage } from '@/server/domains/pages/projection'
import {
  findContentById,
  findLatestDraft,
  findLatestRevision,
  findPageMetaById,
  findPublicPageMetaBySlug,
  publishLatestRevision,
  saveDraftRevision,
} from '@/server/domains/pages/repo'
import {
  clearPagesCache,
  projectSaveResult,
  type SavePageBodyInput,
  type SavePageResult,
} from '@/server/domains/pages/services/shared'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

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

async function savePageBodyInternal(input: SavePageBodyInput, mode: 'draft' | 'publish'): Promise<SavePageResult> {
  const meta = await findPageMetaById(input.pageId)
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const body = await canonicalizeBodyOrThrow(input.body)
  await syncLibraryImageBlocks(body).catch((err: unknown) => {
    log.warn('sync library image blocks failed', { pageId: input.pageId, error: err })
  })
  const imageSources = collectImageStoragePaths(body)
  const headings = collectHeadings(body, deriveSlug)

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
      : await publishLatestRevision('page', { ...repoInput, publishedAt: input.publishedAt })

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
  }
  return projectSaveResult(result)
}

export function saveDraft(input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(input, 'draft')
}

export function publishLatest(input: SavePageBodyInput): Promise<SavePageResult> {
  return savePageBodyInternal(input, 'publish')
}

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
