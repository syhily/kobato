import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'
import type { DetailPageShell, DraftMarker, Page } from '@/shared/types/catalog'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import { findPageBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'

export interface PagePreviewResult {
  page: DetailPageShell
  /** The full page row — the controller needs `bodyHtml`/`bodyState` and the published revision. */
  sourcePage: Page
  showFriends: boolean
  draftMarker: DraftMarker
}

// Page-detail pipeline for `content.pages.bySlug`: plain HTTP facts in,
// thrown Responses out (translated by the controller). Revalidation happens
// in the controller AFTER the payload is assembled; draft previews never
// carry a published ETag at all.
export async function loadPagePreview({
  db,
  slug,
  wantsDraftPreview,
  viewer,
}: {
  db: Database
  slug: string
  wantsDraftPreview: boolean
  /** Viewer identity for the draft-preview gate (`undefined`/`null` = anonymous). */
  viewer: ViewerIdentity | null | undefined
}): Promise<PagePreviewResult> {
  // findPublicPostMetaBySlug is sync (node:sqlite); findPageBySlug stays async.
  const postMeta = findPublicPostMetaBySlug(db, slug)

  // Live post slug → canonical 301 (only live posts appear in the catalog).
  if (postMeta !== null && isLive(postMeta)) {
    redirectPermanent(`/posts/${slug}`)
  }

  const page = await findPageBySlug(db, slug)

  const publishedPage = page ?? undefined

  let sourcePage = publishedPage
  let draftMarker: DraftMarker = null

  const needsDraftLookup = sourcePage === undefined || (wantsDraftPreview && publishedPage !== undefined)
  if (needsDraftLookup && viewer) {
    // The page descriptor owns the rule (admin only) — load denies anyone else.
    const draftPreview = await loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug, viewer)
    if (draftPreview !== null) {
      // `draftPreview.preview` is already the shared `Page` DTO — no promotion.
      if (sourcePage === undefined) {
        sourcePage = draftPreview.preview
        draftMarker = 'draft'
      } else if (wantsDraftPreview) {
        if (draftPreview.hasNewerDraft) {
          sourcePage = draftPreview.preview
          draftMarker = 'unpublished-draft'
        } else {
          draftMarker = 'published-draft'
        }
      }
    }
  }

  if (sourcePage === undefined) {
    notFound()
  }

  const pageProjection: DetailPageShell = {
    id: sourcePage.id,
    slug: sourcePage.slug,
    title: sourcePage.title,
    summary: sourcePage.summary,
    cover: sourcePage.cover,
    coverThumbhash: sourcePage.coverThumbhash,
    coverWidth: sourcePage.coverWidth,
    coverHeight: sourcePage.coverHeight,
    permalink: sourcePage.permalink,
    date: sourcePage.date,
    updated: sourcePage.updated,
    og: sourcePage.og,
    comments: sourcePage.comments,
    toc: sourcePage.toc,
    showUpdated: sourcePage.showUpdated,
    contentLanguage: sourcePage.contentLanguage,
    headings: sourcePage.headings,
  }

  return {
    page: pageProjection,
    sourcePage,
    showFriends: sourcePage.showFriends,
    draftMarker,
  }
}
