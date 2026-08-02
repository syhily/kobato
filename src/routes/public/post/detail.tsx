import { Suspense, useMemo } from 'react'
import { Await, data } from 'react-router'

import type { RouteHandle } from '@/root'
import type { DraftMarker } from '@/shared/types/catalog'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug, findPostEtagInputBySlug } from '@/server/domains/posts/services/single'
import { prerenderMusicPlayerBlocks } from '@/server/domains/pt/prerender'
import { getTagsByNames, listAllTags } from '@/server/domains/taxonomies/tags/service'
import { loadPublicDetailData } from '@/server/http/loaders/detail'
import { detailHeaders } from '@/server/http/loaders/route-exports'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { getRequestContext } from '@/server/http/request-context'
import { ifNoneMatch, notModifiedResponse, weakEtag } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import { bundleFromMatches, routeMeta, seoForPost } from '@/shared/seo/meta'
import { toClientPost, toDetailPostShell } from '@/shared/types/catalog'
import { idFromString } from '@/shared/utils/id'
import { canonicalPostPath } from '@/shared/utils/paths'
import { PortableTextBody } from '@/ui/pt/render'
import { PostDetailBody } from '@/ui/public/post/PostDetailBody'
import { WebmentionList } from '@/ui/public/webmentions/WebmentionList'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { postFonts: true }
export const headers = detailHeaders

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db

  // Cheap ETag probe: a repeat request whose If-None-Match still matches
  // is answered 304 from one slim meta read, before the full load below
  // (meta+revision join, tags, category, image hydration) ever runs. The
  // probe inputs — id + publishedAt — are exactly the ETag parts recomputed
  // on the full path. Alias hits carry a different slug and fall through
  // to the full load so the canonical 301 still fires.
  const etagInput = await findPostEtagInputBySlug(db, params.slug)
  if (etagInput !== null && etagInput.slug === params.slug) {
    const probeEtag = weakEtag(['post', String(etagInput.id), etagInput.publishedAt])
    if (ifNoneMatch(request, probeEtag)) {
      throw notModifiedResponse(probeEtag)
    }
  }

  let sourcePost = (await findPostBySlug(db, params.slug)) ?? undefined
  let draftMarker: DraftMarker = null

  if (sourcePost === undefined) {
    const role = rc.viewer?.role
    if (postLifecycleAdapter.canPreviewDraft(role)) {
      const preview = await loadDraftPreviewBySlug(db, postLifecycleAdapter, params.slug)
      if (preview !== null) {
        sourcePost = preview.preview
        draftMarker = 'draft'
      }
    }
  }

  if (sourcePost === undefined) {
    notFound()
  }

  const clientPost = toClientPost(sourcePost)
  const canonical = canonicalPostPath(params.slug, clientPost.slug)
  if (canonical !== undefined) {
    redirectPermanent(canonical)
  }

  const post = toDetailPostShell(clientPost)

  // Same inputs as the early probe above (id + publishedAt) — keep the
  // two weakEtag calls in sync or repeat visits never see a 304.
  const etag = weakEtag(['post', clientPost.id, post.updated])
  if (ifNoneMatch(request, etag)) {
    throw notModifiedResponse(etag)
  }

  // One parallel block: the detail orchestrator (likes, comment key,
  // streaming comments) is independent of the tag/sidebar/prerender
  // reads — awaiting it after them would make the critical path their
  // sum instead of their max.
  const [visibleTags, imageMeta, sidebarTags, sidebarPosts, enrichedBody, { detail }] = await Promise.all([
    getTagsByNames(db, post.tags),
    resolveImageMetaBySources(db, sourcePost.imageSources).then((r) => Object.fromEntries(r)),
    listAllTags(db).then(selectSidebarTags),
    selectSidebarPosts(db, getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts')),
    prerenderMusicPlayerBlocks(sourcePost.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds)),
    loadPublicDetailData(db, {
      request,
      context,
      target: { type: 'post', ownerId: idFromString(post.id) },
    }),
  ])

  return data(
    {
      post,
      body: enrichedBody ?? sourcePost.body,
      visibleTags,
      sidebarPosts,
      tags: sidebarTags,
      detail,
      imageMeta,
      draftMarker,
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
