import { LexicalBody } from '@kobato/editor/lexical-html/LexicalBody'
import { ifNoneMatch, notModifiedResponse, weakEtag } from '@kobato/shared/http/etag'
import { detailHeaders } from '@kobato/shared/http/headers'
import { redirectPermanent } from '@kobato/shared/http/redirects'
import { notFound } from '@kobato/shared/http/status'
import { bundleFromMatches, routeMeta, seoForPost } from '@kobato/shared/seo/meta'
import { PostDetailBody } from '@kobato/ui/public/post/PostDetailBody'
import { WebmentionList } from '@kobato/ui/public/webmentions/WebmentionList'
import { Suspense, useMemo } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/detail'

import { getPublicClient } from '../client'

export const handle: RouteHandle = { postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const fctx = getFrontendContext({ request, context })
  const client = getPublicClient(fctx)

  // Draft-preview credential minted by the admin app (plan 0.5 §5): the
  // core session cookie cannot cross the two-domain topology, so the
  // role-bound token in the URL is what authorizes the draft read.
  const previewToken = new URL(request.url).searchParams.get('preview_token') ?? undefined

  // Headless form: the frontend has no database, so the slim pre-probe of
  // the single-package form is gone — the full payload must arrive before
  // the etag can be computed. The post DTO's `updated` projects
  // `published_at`, so the post-load etag below uses the SAME inputs the
  // old probe used (`['post', id, publishedAt]`) — repeat visitors keep
  // seeing 304 with an unchanged etag.
  const pageData = await client.postDetail({ slug: params.slug, previewToken }).catch((err: { code?: string }) => {
    if (err.code === 'NOT_FOUND') {
      notFound()
    }
    throw err
  })

  if (pageData.canonicalSlug !== null) {
    redirectPermanent(`/posts/${pageData.canonicalSlug}`)
  }

  const etag = weakEtag(['post', pageData.post.id, pageData.post.updated])
  if (ifNoneMatch(request, etag)) {
    throw notModifiedResponse(etag)
  }

  // Streaming rule: comments / webmentions ride as un-awaited client
  // promises through the loader so `<Await>` boundaries stream them
  // after the critical body (the detail procedure intentionally returns
  // critical only — the RPC wire cannot carry promises).
  const comments = client.commentsTree({ page_key: pageData.detail.commentKey })
  const webmentions = client.listWebmentions({ page_key: pageData.detail.commentKey }).then((r) => r.webmentions)

  return data(
    {
      post: pageData.post,
      body: pageData.body,
      musicMeta: pageData.musicMeta,
      visibleTags: pageData.visibleTags,
      sidebarPosts: pageData.sidebarPosts,
      tags: pageData.tags,
      detail: { ...pageData.detail, comments, webmentions },
      imageMeta: pageData.imageMeta,
      draftMarker: pageData.draftMarker,
    },
    { headers: { ETag: etag } },
  )
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const bundle = bundleFromMatches(matches)
  if (!loaderData) {
    return routeMeta(undefined, bundle)
  }
  return routeMeta(seoForPost(loaderData.post), bundle)
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  const { post, body, musicMeta, visibleTags, sidebarPosts, tags, detail, imageMeta, draftMarker } = loaderData
  const headingSlugs = useMemo(() => post.headings.map((h) => h.slug), [post.headings])
  const sidebar = useMemo(
    () => ({
      posts: sidebarPosts,
      tags,
      recentComments: detail.recentComments,
    }),
    [sidebarPosts, tags, detail.recentComments],
  )
  return (
    <>
      <PostDetailBody
        post={post}
        headings={post.headings}
        visibleTags={visibleTags}
        mode={detail.admin ? 'admin' : 'public'}
        likes={detail.likes}
        commentKey={detail.commentKey}
        commentsPromise={detail.comments}
        webmentions={
          <Suspense fallback={null}>
            <Await resolve={detail.webmentions}>{(mentions) => <WebmentionList mentions={mentions} />}</Await>
          </Suspense>
        }
        currentUser={detail.currentUser}
        draftMarker={draftMarker}
        sidebar={sidebar}
      >
        <LexicalBody
          body={body}
          headingSlugs={headingSlugs}
          imageMeta={imageMeta}
          musicMeta={(playerId) => musicMeta[playerId]}
        />
      </PostDetailBody>
    </>
  )
}
