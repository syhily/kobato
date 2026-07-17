import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { LoaderFunctionArgs } from 'react-router'

import type { ResolvedImageMeta } from '@/server/domains/images/services/enhance'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { DraftMarker } from '@/shared/types/catalog'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { tryGetSessionContext } from '@/server/domains/auth/context'
import { resolveSessionContext } from '@/server/domains/auth/primitives'
import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { isLive } from '@/server/domains/content/schema'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { buildDbPage, findPageBySlug } from '@/server/domains/pages/repo'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
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
  db: NodePgDatabase
  slug: string
  wantsDraftPreview: boolean
  request: Request
  context: LoaderFunctionArgs['context']
}): Promise<PagePreviewResult> {
  const [postMeta, page] = await Promise.all([findPublicPostMetaBySlug(db, slug), findPageBySlug(db, slug)])

  // If the slug belongs to a live post (not deleted, published, not
  // scheduled), redirect to the canonical post URL. Matches the old
  // slug-map semantics where only live posts appeared in the catalog.
  if (postMeta !== null && isLive(postMeta)) {
    redirectPermanent(`/posts/${slug}`)
  }

  const publishedPage = page ?? undefined

  let sourcePage = publishedPage
  let draftMarker: DraftMarker = null

  const needsDraftLookup = sourcePage === undefined || (wantsDraftPreview && publishedPage !== undefined)
  if (needsDraftLookup) {
    const sessionContext = tryGetSessionContext(context) ?? (await resolveSessionContext(db, request))
    if (sessionContext.role === 'admin') {
      const draftPreview = await loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug)
      if (draftPreview !== null) {
        if (sourcePage === undefined) {
          sourcePage = buildDbPage(draftPreview.preview)
          draftMarker = 'draft'
        } else if (wantsDraftPreview) {
          if (draftPreview.hasNewerDraft) {
            sourcePage = buildDbPage(draftPreview.preview)
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
