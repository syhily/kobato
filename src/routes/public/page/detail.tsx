import { Suspense, useMemo } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'

import { listAllFriends } from '@/server/domains/friends/service'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { prerenderMusicPlayerBlocks } from '@/server/domains/pt/prerender'
import { loadPublicDetailData } from '@/server/http/loaders/detail'
import { loadPagePreview } from '@/server/http/loaders/page-preview'
import { detailHeaders } from '@/server/http/loaders/route-exports'
import { getRequestContext } from '@/server/http/request-context'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { bundleFromMatches, routeMeta, seoForPage } from '@/shared/seo/meta'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { idFromString } from '@/shared/utils/id'
import { Friends } from '@/ui/pt/blocks/Friends'
import { PortableTextBody } from '@/ui/pt/render'
import { FriendApplyForm } from '@/ui/public/friends/FriendApplyForm'
import { PageDetailBody } from '@/ui/public/post/PageDetailBody'
import { WebmentionList } from '@/ui/public/webmentions/WebmentionList'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { footer: false, postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { db } = getRequestContext({ request, context })
  const url = new URL(request.url)
  const wantsDraftPreview = url.searchParams.get('draft') === 'true'

  // One parallel block keyed off the preview promise. The music-player
  // prerender starts the moment the preview resolves instead of waiting
  // for the friends read, and the friends full-table scan + image
  // hydration only run when the page actually renders the section — a
  // hidden section keeps the payload an honest empty list.
  const previewPromise = loadPagePreview({ db, slug: params.slug, wantsDraftPreview, request, context })
  const [preview, friends, enrichedBody] = await Promise.all([
    previewPromise,
    previewPromise.then((p) => (p.showFriends ? listAllFriends(db) : [])),
    previewPromise.then((p) =>
      prerenderMusicPlayerBlocks(p.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds)),
    ),
  ])

  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

  // Dependency-forced serial: the detail target needs the resolved page id.
  const { detail } = await loadPublicDetailData(db, {
    request,
    context,
    target: { type: 'page', ownerId: idFromString(preview.page.id) },
  })

  return data(
    {
      page: preview.page,
      body: enrichedBody ?? preview.body,
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
        webmentions={
          <Suspense fallback={null}>
            <Await resolve={detail.webmentions}>{(mentions) => <WebmentionList mentions={mentions} />}</Await>
          </Suspense>
        }
        currentUser={detail.currentUser}
        mode={detail.admin ? 'admin' : 'public'}
      >
        <PortableTextBody
          body={body}
          imageMeta={imageMeta}
          headingSlugs={headingSlugs}
          footnotesSectionTitle={footnotesSectionTitle}
        />
        {showFriends && <Friends friends={friends} />}
        {showFriends && <FriendApplyForm />}
      </PageDetailBody>
    </>
  )
}
