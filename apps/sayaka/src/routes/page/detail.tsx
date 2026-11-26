import type { RouteHandle } from '@sayaka/root'

import { bundleFromMatches, i18nFromMatches, routeMeta, seoForPage } from '@kobato/catalog/seo/meta'
import { getSayakaContext } from '@sayaka/server/request-context'
import { detailHeaders } from '@sayaka/server/route-cache-headers'
import { sinkUnhandledRejection, streamDetailExtras, unwrapDetail } from '@sayaka/server/unwrap'
import { FriendApplyForm } from '@sayaka/ui/friends/FriendApplyForm'
import { Friends } from '@sayaka/ui/friends/Friends'
import { PageDetailBody } from '@sayaka/ui/post/PageDetailBody'
import { WebmentionList } from '@sayaka/ui/webmentions/WebmentionList'
import { Suspense } from 'react'
import { Await, data } from 'react-router'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { footer: false, postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const wantsDraftPreview = new URL(request.url).searchParams.get('draft') === 'true'

  const detailPromise = sinkUnhandledRejection(
    ctx.client.public.content.pages.bySlug({
      slug: params.slug,
      draft: wantsDraftPreview,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )
  const boot = await ctx.bootstrap()
  const result = await unwrapDetail(detailPromise, boot.i18n.locale)

  const { comments, webmentions } = streamDetailExtras(ctx.client, result.payload.critical.commentKey)

  return data(
    {
      page: result.payload.page,
      bodyHtml: result.payload.bodyHtml,
      friends: result.payload.friends,
      showFriends: result.payload.showFriends,
      draftMarker: result.payload.draftMarker,
      detail: { ...result.payload.critical, comments, webmentions },
      eid: ctx.analyticsEventId,
    },
    {
      headers: result.etag === null ? undefined : { ETag: result.etag },
    },
  )
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const bundle = bundleFromMatches(matches)
  const i18n = i18nFromMatches(matches)
  if (!loaderData) {
    return routeMeta(undefined, bundle, i18n)
  }
  return routeMeta(seoForPage(loaderData.page), bundle, i18n)
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
