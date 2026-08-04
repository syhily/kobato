import { LexicalBody } from '@kobato/editor/lexical-html/LexicalBody'
import { Friends } from '@kobato/editor/renderer/blocks/Friends'
import { ifNoneMatch, notModifiedResponse } from '@kobato/shared/http/etag'
import { detailHeaders } from '@kobato/shared/http/headers'
import { redirectPermanent } from '@kobato/shared/http/redirects'
import { notFound } from '@kobato/shared/http/status'
import { bundleFromMatches, routeMeta, seoForPage } from '@kobato/shared/seo/meta'
import { FriendApplyForm } from '@kobato/ui/public/friends/FriendApplyForm'
import { PageDetailBody } from '@kobato/ui/public/post/PageDetailBody'
import { WebmentionList } from '@kobato/ui/public/webmentions/WebmentionList'
import { Suspense, useMemo } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/detail'

import { getPublicClient } from '../client'

export const handle: RouteHandle = { footer: false, postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const fctx = getFrontendContext({ request, context })
  const url = new URL(request.url)
  const wantsDraftPreview = url.searchParams.get('draft') === 'true'
  // Draft-preview credential minted by the admin app (plan 0.5 §5): the
  // core session cookie cannot cross the two-domain topology, so the
  // role-bound token in the URL is what authorizes the draft read.
  const previewToken = url.searchParams.get('preview_token') ?? undefined

  // Headless form: the slim pre-probe of the single-package form is gone
  // (no database on the frontend). The 304 decision moves after the fetch:
  // the procedure returns `publicEtag` (null for draft previews — an
  // admin's `?draft=true` may swap the body), computed from the SAME
  // inputs the old probe used (`['page', id, publishedRevisionId,
  // publishedAt]`). The transport strips `If-None-Match` from the core
  // request so core never 304s the RPC wire internally.
  const client = getPublicClient(fctx)
  const pageData = await client
    .pageDetail({ slug: params.slug, wantsDraftPreview, previewToken })
    .catch((err: { code?: string }) => {
      if (err.code === 'NOT_FOUND') {
        notFound()
      }
      throw err
    })

  if ('redirectTo' in pageData) {
    redirectPermanent(pageData.redirectTo ?? `/posts/${params.slug}`)
  }

  if (pageData.publicEtag !== null && ifNoneMatch(request, pageData.publicEtag)) {
    throw notModifiedResponse(pageData.publicEtag)
  }

  // Streaming rule: comments / webmentions ride as un-awaited client
  // promises so `<Await>` boundaries stream them after the critical body.
  const comments = client.commentsTree({ page_key: pageData.detail.commentKey })
  const webmentions = client.listWebmentions({ page_key: pageData.detail.commentKey }).then((r) => r.webmentions)

  return data(
    {
      page: pageData.page,
      body: pageData.body,
      friends: pageData.friends,
      showFriends: pageData.showFriends,
      draftMarker: pageData.draftMarker,
      detail: { ...pageData.detail, comments, webmentions },
      imageMeta: pageData.imageMeta,
      musicMeta: pageData.musicMeta,
      footnotesSectionTitle: pageData.footnotesSectionTitle,
    },
    {
      headers: pageData.publicEtag === null ? undefined : { ETag: pageData.publicEtag },
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
  const { page, body, friends, showFriends, draftMarker, detail, imageMeta, musicMeta, footnotesSectionTitle } =
    loaderData
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
        <LexicalBody
          body={body}
          imageMeta={imageMeta}
          headingSlugs={headingSlugs}
          footnotesSectionTitle={footnotesSectionTitle}
          musicMeta={(playerId) => musicMeta[playerId]}
        />
        {showFriends && <Friends friends={friends} />}
        {showFriends && <FriendApplyForm />}
      </PageDetailBody>
    </>
  )
}
