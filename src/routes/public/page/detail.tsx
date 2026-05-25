import { data } from 'react-router'

import { listAllFriends } from '@/server/domains/friends/service'
import { loadPagePreview } from '@/server/domains/pages/loader'
import { loadPublicDetailData } from '@/server/http/loaders/detail'
import { detailHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { bundleFromMatches, routeMeta, seoForPage } from '@/server/render/seo/meta'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { Friends } from '@/ui/pt/blocks/Friends'
import { PortableTextBody } from '@/ui/pt/render'
import { PageDetailBody } from '@/ui/public/post/PageDetailBody'
import { PostFontLinks } from '@/ui/public/post/PostFontLinks'

import type { Route } from './+types/detail'

export const handle = { footer: false }
export const headers = detailHeaders
export const shouldRevalidate = publicShouldRevalidate

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const wantsDraftPreview = url.searchParams.get('draft') === 'true'

  const [preview, friends] = await Promise.all([
    loadPagePreview({ slug: params.slug, wantsDraftPreview, request, context }),
    listAllFriends(),
  ])

  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

  const { detail } = await loadPublicDetailData({
    request,
    context,
    target: { type: 'page', ownerId: BigInt(preview.page.id) },
    preload: () => Promise.resolve(),
  })

  return data(
    {
      page: preview.page,
      body: preview.body,
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
  return (
    <>
      <PostFontLinks />
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
        <PortableTextBody
          body={body}
          imageMeta={imageMeta}
          headingSlugs={page.headings.map((h) => h.slug)}
          footnotesSectionTitle={footnotesSectionTitle}
        />
        {showFriends && <Friends friends={[...friends]} />}
      </PageDetailBody>
    </>
  )
}
