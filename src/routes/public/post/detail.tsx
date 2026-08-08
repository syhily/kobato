import { Suspense, useMemo } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'

import { detailHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, streamDetailExtras, unwrapDetail } from '@/server/http/ssr-caller'
import { bundleFromMatches, routeMeta, seoForPost } from '@/shared/seo/meta'
import { PortableTextBody } from '@/ui/pt/render'
import { PostDetailBody } from '@/ui/public/post/PostDetailBody'
import { WebmentionList } from '@/ui/public/webmentions/WebmentionList'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })

  const result = await unwrapDetail(
    caller.content.posts.bySlug({
      slug: params.slug,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )

  // Comments and webmentions chain off the critical's comment key — known
  // only once the post read settles — and stream through <Await>. Never fire
  // speculatively: 304/301/404 reads then cost zero comments work.
  const { comments, webmentions } = streamDetailExtras(caller, result.payload.critical.commentKey)

  return data(
    {
      post: result.payload.post,
      body: result.payload.body,
      visibleTags: result.payload.visibleTags,
      sidebarPosts: result.payload.sidebarPosts,
      tags: result.payload.tags,
      detail: { ...result.payload.critical, comments, webmentions },
      imageMeta: result.payload.imageMeta,
      draftMarker: result.payload.draftMarker,
    },
    { headers: { ETag: result.etag } },
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
  const { post, body, visibleTags, sidebarPosts, tags, detail, imageMeta, draftMarker } = loaderData
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
        <PortableTextBody body={body} headingSlugs={headingSlugs} imageMeta={imageMeta} />
      </PostDetailBody>
    </>
  )
}
