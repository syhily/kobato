import type { DetailPageShell, DraftMarker, Page } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { loadDraftPreviewBySlug } from '@kobato/server/domains/content/lifecycle'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { pageLifecycleAdapter } from '@kobato/server/domains/pages/services/lifecycle-adapter'
import { findPageBySlug } from '@kobato/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@kobato/server/domains/posts/services/single'
import { redirectPermanent } from '@kobato/server/infra/http/redirects'
import { notFound } from '@kobato/server/infra/http/status'

export interface PagePreviewResult {
  page: DetailPageShell
  sourcePage: Page
  showFriends: boolean
  draftMarker: DraftMarker
}

export async function loadPagePreview({
  db,
  slug,
  wantsDraftPreview,
  viewer,
}: {
  db: Database
  slug: string
  wantsDraftPreview: boolean
  viewer: ViewerIdentity | null | undefined
}): Promise<PagePreviewResult> {
  const postMeta = findPublicPostMetaBySlug(db, slug)

  if (postMeta !== null && isLive(postMeta)) {
    redirectPermanent(`/posts/${slug}`)
  }

  const page = await findPageBySlug(db, slug)

  const publishedPage = page ?? undefined

  let sourcePage = publishedPage
  let draftMarker: DraftMarker = null

  const needsDraftLookup = sourcePage === undefined || (wantsDraftPreview && publishedPage !== undefined)
  if (needsDraftLookup && viewer) {
    const draftPreview = await loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug, viewer)
    if (draftPreview !== null) {
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
