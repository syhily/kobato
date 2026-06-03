import { data } from 'react-router'

import type { RouteHandle } from '@/root'
import type { DraftMarker } from '@/ui/public/post/DetailBodyChrome'

import { getDbFromContext, tryGetSessionContext } from '@/server/domains/auth/context'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { selectSidebarPosts } from '@/server/domains/posts/repos/public-query'
import { findPostBySlug } from '@/server/domains/posts/repos/single'
import { loadPostDraftPreviewBySlug } from '@/server/domains/posts/services/draft'
import { getTagsByNames, listAllTags } from '@/server/domains/taxonomies/tags/service'
import { loadPublicDetailData, redirectPermanent } from '@/server/http/loaders/detail'
import { detailHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { ifNoneMatch, notModifiedResponse, weakEtag } from '@/server/infra/http/etag'
import { notFound } from '@/server/infra/http/status'
import { bundleFromMatches, routeMeta, seoForPost } from '@/server/render/seo/meta'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import { toClientPost, toDetailPostShell } from '@/shared/types/catalog'
import { canonicalPostPath } from '@/shared/utils/paths'
import { hasAtLeast } from '@/shared/utils/roles'
import { PortableTextBody } from '@/ui/pt/render'
import { PostDetailBody } from '@/ui/public/post/PostDetailBody'

import type { Route } from './+types/detail'

export const handle: RouteHandle = { postFonts: true }
export const headers = detailHeaders
export const shouldRevalidate = publicShouldRevalidate

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  let sourcePost = (await findPostBySlug(db, params.slug)) ?? undefined
  let draftMarker: DraftMarker = null

  if (sourcePost === undefined) {
    const sessionContext = tryGetSessionContext(context)
    if (!sessionContext) {
      throw new Error('Session context missing in post detail loader')
    }
    if (hasAtLeast(sessionContext.role, 'author')) {
      const preview = await loadPostDraftPreviewBySlug(db, params.slug)
      if (preview !== null) {
        sourcePost = preview.post
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

  const etag = weakEtag(['post', clientPost.id, post.updated])
  if (ifNoneMatch(request, etag)) {
    throw notModifiedResponse(etag)
  }

  const [visibleTags, imageMeta, sidebarTags, sidebarPosts] = await Promise.all([
    getTagsByNames(db, post.tags),
    resolveImageMetaBySources(db, sourcePost.imageSources).then((r) => Object.fromEntries(r)),
    listAllTags(db).then(selectSidebarTags),
    selectSidebarPosts(db, getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts')),
  ])

  const { detail } = await loadPublicDetailData(db, {
    request,
    context,
    target: { type: 'post', ownerId: BigInt(post.id) },
    preload: () => Promise.resolve(),
    sidebar: { posts: sidebarPosts, tags: sidebarTags },
  })

  return data(
    {
      post,
      body: sourcePost.body,
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
        currentUser={detail.currentUser}
        draftMarker={draftMarker}
        sidebar={{
          posts: sidebarPosts,
          tags,
          recentComments: detail.recentComments,
        }}
      >
        <PortableTextBody body={body} headingSlugs={post.headings.map((h) => h.slug)} imageMeta={imageMeta} />
      </PostDetailBody>
    </>
  )
}
