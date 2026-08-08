import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { DetailPageShell, DraftMarker } from '@/shared/types/catalog'
import type { ResolvedImageMeta } from '@/shared/types/images'
import type { RoleOrNull } from '@/shared/utils/roles'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import { findPageBySlug, findPageEtagInputBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { etagHeaderMatches, notModifiedResponse, pageEtag } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'

export interface PagePreviewResult {
  page: DetailPageShell
  body: PortableTextBody
  showFriends: boolean
  draftMarker: DraftMarker
  publicEtag: string | null
  imageMeta: Record<string, ResolvedImageMeta>
}

// Page-detail pipeline for `content.pages.bySlug`: plain HTTP facts in,
// thrown Responses out (translated by the controller).
export async function loadPagePreview({
  db,
  slug,
  wantsDraftPreview,
  role,
  ifNoneMatch,
}: {
  db: Database
  slug: string
  wantsDraftPreview: boolean
  /** Viewer role for the draft-preview gate (`undefined`/`null` = anonymous). */
  role: RoleOrNull | undefined
  ifNoneMatch: string | null | undefined
}): Promise<PagePreviewResult> {
  // findPublicPostMetaBySlug is sync (node:sqlite); the probe and
  // findPageBySlug stay async — no Promise.all needed.
  const postMeta = findPublicPostMetaBySlug(db, slug)

  // Live post slug → canonical 301 (only live posts appear in the catalog).
  if (postMeta !== null && isLive(postMeta)) {
    redirectPermanent(`/posts/${slug}`)
  }

  // Slim ETag probe answers repeat requests before the full load; draft
  // previews skip it — the published ETag must not 304 a swapped body.
  if (!wantsDraftPreview) {
    const etagInput = await findPageEtagInputBySlug(db, slug)
    if (etagInput !== null) {
      const probeEtag = pageEtag(etagInput.id, etagInput.publishedRevisionId, etagInput.publishedAt)
      if (etagHeaderMatches(ifNoneMatch, probeEtag)) {
        throw notModifiedResponse(probeEtag)
      }
    }
  }

  const page = await findPageBySlug(db, slug)

  const publishedPage = page ?? undefined

  let sourcePage = publishedPage
  let draftMarker: DraftMarker = null

  const needsDraftLookup = sourcePage === undefined || (wantsDraftPreview && publishedPage !== undefined)
  if (needsDraftLookup) {
    if (pageLifecycleAdapter.canPreviewDraft(role)) {
      const draftPreview = await loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug)
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
  }

  if (sourcePage === undefined) {
    notFound()
  }

  // Same builder as the early probe — repeat visits keep hitting the same 304.
  const publicEtag =
    draftMarker === null ? pageEtag(sourcePage.id, sourcePage.publishedRevisionId, sourcePage.updated) : null
  if (publicEtag !== null && etagHeaderMatches(ifNoneMatch, publicEtag)) {
    throw notModifiedResponse(publicEtag)
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
    headings: sourcePage.headings,
  }

  const imageMeta = Object.fromEntries(await resolveImageMetaBySources(db, sourcePage.imageSources))

  return {
    page: pageProjection,
    body: sourcePage.body,
    showFriends: sourcePage.showFriends,
    draftMarker,
    publicEtag,
    imageMeta,
  }
}
