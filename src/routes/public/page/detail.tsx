import { Suspense } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'

import { detailHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, streamDetailExtras, unwrapDetail } from '@/server/http/ssr-caller'
import { bundleFromMatches, routeMeta, seoForPage } from '@/shared/seo/meta'
import { FriendApplyForm } from '@/ui/public/friends/FriendApplyForm'
import { Friends } from '@/ui/public/friends/Friends'
import { PageDetailBody } from '@/ui/public/post/PageDetailBody'
import { WebmentionList } from '@/ui/public/webmentions/WebmentionList'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { footer: false, postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  const wantsDraftPreview = new URL(request.url).searchParams.get('draft') === 'true'

  const result = await unwrapDetail(
    caller.content.pages.bySlug({
      slug: params.slug,
      draft: wantsDraftPreview,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )

  // Comments and webmentions chain off the critical's comment key — known
  // only once the page read settles — and stream through <Await>.
  const { comments, webmentions } = streamDetailExtras(caller, result.payload.critical.commentKey)

  return data(
    {
      page: result.payload.page,
      bodyHtml: result.payload.bodyHtml,
      friends: result.payload.friends,
      showFriends: result.payload.showFriends,
      draftMarker: result.payload.draftMarker,
      detail: { ...result.payload.critical, comments, webmentions },
    },
    {
      headers: result.etag === null ? undefined : { ETag: result.etag },
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
  const { page, bodyHtml, friends, showFriends, draftMarker, detail } = loaderData
  return (
    <PageDetailBody
      page={page}
      headings={page.headings}
      bodyHtml={bodyHtml}
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
      {showFriends && <Friends friends={friends} />}
      {showFriends && <FriendApplyForm />}
    </PageDetailBody>
  )
}
