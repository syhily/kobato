import { useMemo } from 'react'
import { data } from 'react-router'

import type { RouteHandle } from '@/root'

import { getDbFromContext } from '@/server/domains/auth/context'
import { listAllFriends } from '@/server/domains/friends/service'
import { prerenderInklingMusicPlayers } from '@/server/domains/inkling/music-prerender'
import { loadPublicDetailData } from '@/server/http/loaders/detail'
import { loadPagePreview } from '@/server/http/loaders/page-preview'
import { detailHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { bundleFromMatches, routeMeta, seoForPage } from '@/server/render/seo/meta'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { Friends } from '@/ui/inkling/render/components/Friends'
import { InklingBody } from '@/ui/inkling/render/InklingBody'
import { PageDetailBody } from '@/ui/public/post/PageDetailBody'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { footer: false, postFonts: true }
export const headers = detailHeaders
export const shouldRevalidate = publicShouldRevalidate

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  const url = new URL(request.url)
  const wantsDraftPreview = url.searchParams.get('draft') === 'true'

  const [preview, friends] = await Promise.all([
    loadPagePreview({ db, slug: params.slug, wantsDraftPreview, request, context }),
    listAllFriends(db),
  ])

  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))
  const enrichedBody = await prerenderInklingMusicPlayers(db, preview.body)
  const body = enrichedBody ?? preview.body

  const { detail } = await loadPublicDetailData(db, {
    request,
    context,
    target: { type: 'page', ownerId: BigInt(preview.page.id) },
    preload: () => Promise.resolve(),
  })

  return data(
    {
      page: preview.page,
      body,
      friends,
      showFriends: preview.showFriends,
      draftMarker: preview.draftMarker,
      detail,
      imageMeta: preview.imageMeta,
      footnotesSectionTitle,
    },
    {
      headers: preview.publicEtag === null ? undefined : { ETag: preview.publicEtag },
    },
  )
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const bundle = bundleFromMatches(matches)
  if (!loaderData) {
    return routeMeta(undefined, bundle)
  }
  return routeMeta(seoForPage(loaderData.page), bundle)
}

export default function PageDetailRoute({ loaderData }: Route.ComponentProps) {
  const { page, body, friends, showFriends, draftMarker, detail, imageMeta, footnotesSectionTitle } = loaderData
  const headingSlugs = useMemo(() => page.headings.map((h) => h.slug), [page.headings])
  return (
    <>
      <PageDetailBody
        page={page}
        headings={page.headings}
        draftMarker={draftMarker}
        likes={detail.likes}
        commentKey={detail.commentKey}
        commentsPromise={detail.comments}
        currentUser={detail.currentUser}
        mode={detail.admin ? 'admin' : 'public'}
      >
        <InklingBody
          document={body}
          imageMeta={imageMeta}
          headingSlugs={headingSlugs}
          footnotesSectionTitle={footnotesSectionTitle}
        />
        {showFriends && <Friends friends={friends} />}
      </PageDetailBody>
    </>
  )
}
