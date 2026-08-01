import type { LoaderFunctionArgs } from 'react-router'

import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { DraftMarker } from '@/shared/types/catalog'
import type { ResolvedImageMeta } from '@/shared/types/images'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import { findPageBySlug, findPageEtagInputBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { getRequestContext } from '@/server/http/request-context'
import { ifNoneMatch, notModifiedResponse, weakEtag } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'

export interface PagePreviewResult {
  page: {
    id: string
    slug: string
    title: string
    summary: string
    cover: string
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
    permalink: string
    date: Date
    updated?: Date
    og?: string
    comments: boolean
    toc: boolean
    showUpdated: boolean
    headings: MarkdownHeading[]
  }
  body: PortableTextBody
  showFriends: boolean
  draftMarker: DraftMarker
  publicEtag: string | null
  imageMeta: Record<string, ResolvedImageMeta>
}

export async function loadPagePreview({
  db,
  slug,
  wantsDraftPreview,
  request,
  context,
}: {
  db: Database
  slug: string
  wantsDraftPreview: boolean
  request: Request
  context: LoaderFunctionArgs['context']
}): Promise<PagePreviewResult> {
  // findPublicPostMetaBySlug is sync (node:sqlite); the probe and
  // findPageBySlug stay async — no Promise.all needed.
  const postMeta = findPublicPostMetaBySlug(db, slug)

  // If the slug belongs to a live post (not deleted, published, not
  // scheduled), redirect to the canonical post URL. Matches the old
  // slug-map semantics where only live posts appeared in the catalog.
  if (postMeta !== null && isLive(postMeta)) {
    redirectPermanent(`/posts/${slug}`)
  }

  // Cheap ETag probe: a repeat request whose If-None-Match still matches
  // is answered 304 from one slim meta read, before the full load below
  // (meta + revision + image hydration) and the draft lookup ever run.
  // The probe inputs — id + publishedRevisionId + publishedAt — are
  // exactly the ETag parts recomputed on the full path. Draft-preview
  // requests skip the probe: an admin's `?draft=true` may swap the body,
  // so the published ETag must not 304 it.
  if (!wantsDraftPreview) {
    const etagInput = await findPageEtagInputBySlug(db, slug)
    if (etagInput !== null) {
      const probeEtag = weakEtag(['page', String(etagInput.id), etagInput.publishedRevisionId, etagInput.publishedAt])
      if (ifNoneMatch(request, probeEtag)) {
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
    const role = getRequestContext({ request, context }).viewer?.role
    if (pageLifecycleAdapter.canPreviewDraft(role)) {
      const draftPreview = await loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug)
      if (draftPreview !== null) {
        // `draftPreview.preview` is already the shared `Page` DTO
        // (`toCmsPage` returns it directly) — no promotion step.
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

  // Same inputs as the early probe above (id + publishedRevisionId +
  // publishedAt — `updated` projects `meta.publishedAt`) — keep the two
  // weakEtag calls in sync or repeat visits never see a 304.
  const publicEtag =
    draftMarker === null ? weakEtag(['page', sourcePage.id, sourcePage.publishedRevisionId, sourcePage.updated]) : null
  if (publicEtag !== null && ifNoneMatch(request, publicEtag)) {
    throw notModifiedResponse(publicEtag)
  }

  const pageProjection = {
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
