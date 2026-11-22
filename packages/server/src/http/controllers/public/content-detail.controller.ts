import type { EntityTarget } from '@kobato/db/target'

import { contentDetailContract } from '@kobato/api/rpc/public/content'
import { resolveBodyHtml } from '@kobato/server/domains/content/services/body-html'
import { listAllFriends } from '@kobato/server/domains/friends/service'
import { selectSidebarPosts } from '@kobato/server/domains/posts/services/featured'
import { getTagsByNames, listAllTags } from '@kobato/server/domains/taxonomies/tags/service'
import { translateThrownResponse } from '@kobato/server/http/content-signals'
import { loadDetailCritical, trackDetailPageView } from '@kobato/server/http/loaders/detail-critical'
import { loadPagePreview } from '@kobato/server/http/loaders/page-preview'
import { loadPostPreview } from '@kobato/server/http/loaders/post-detail'
import { selectSidebarTags, sidebarSelection } from '@kobato/server/http/loaders/sidebar-select'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { etagHeaderMatches, pageEtag, postEtag, representationFromLocalization } from '@kobato/server/infra/http/etag'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { idFromString } from '@kobato/utils/id'

const impl = implementPublic(contentDetailContract)

const postBySlug = impl.postBySlug.handler(async ({ input, context }) => {
  const db = context.db

  let preview
  try {
    preview = await loadPostPreview({
      db,
      slug: input.slug,
      viewer: context.viewer,
    })
  } catch (error) {
    return translateThrownResponse(error)
  }

  const target: EntityTarget = { type: 'post', ownerId: idFromString(preview.post.id) }

  const sidebar = sidebarSelection({
    settings: requireBlogSettingsSection('sidebar', context.settings),
    scope: `post:${preview.sourcePost.id}`,
    now: new Date(),
    localization: context.localization,
  })

  const [visibleTags, bodyHtml, sidebarTags, sidebarPosts, critical] = await Promise.all([
    getTagsByNames(db, preview.post.tags),
    resolveBodyHtml(preview.sourcePost),
    listAllTags(db).then((tags) => selectSidebarTags(tags, sidebar)),
    selectSidebarPosts(db, sidebar),
    loadDetailCritical(context, target),
  ])

  const payload = {
    post: preview.post,
    bodyHtml,
    visibleTags,
    sidebarPosts,
    tags: sidebarTags,
    draftMarker: preview.draftMarker,
    critical,
  }

  const etag =
    preview.draftMarker === null
      ? postEtag({
          id: preview.sourcePost.id,
          publishedRevisionId: preview.sourcePost.publishedRevisionId,
          publishedAt: preview.sourcePost.updated,
          representation: representationFromLocalization(context.localization),
          payload,
        })
      : null

  if (etag !== null && etagHeaderMatches(input.ifNoneMatch, etag)) {
    return { kind: 'not-modified' as const, etag }
  }

  trackDetailPageView(context, target)

  return { kind: 'ok' as const, etag, payload }
})

const pageBySlug = impl.pageBySlug.handler(async ({ input, context }) => {
  const db = context.db

  let preview
  try {
    preview = await loadPagePreview({
      db,
      slug: input.slug,
      wantsDraftPreview: input.draft === true,
      viewer: context.viewer,
    })
  } catch (error) {
    return translateThrownResponse(error)
  }

  const target: EntityTarget = { type: 'page', ownerId: idFromString(preview.page.id) }

  const [friends, bodyHtml, critical] = await Promise.all([
    preview.showFriends ? listAllFriends(db) : [],
    resolveBodyHtml(preview.sourcePage),
    loadDetailCritical(context, target),
  ])

  const payload = {
    page: preview.page,
    bodyHtml,
    friends,
    showFriends: preview.showFriends,
    draftMarker: preview.draftMarker,
    critical,
  }

  const etag =
    preview.draftMarker === null
      ? pageEtag({
          id: preview.sourcePage.id,
          publishedRevisionId: preview.sourcePage.publishedRevisionId,
          publishedAt: preview.sourcePage.updated,
          representation: representationFromLocalization(context.localization),
          payload,
        })
      : null

  if (etag !== null && etagHeaderMatches(input.ifNoneMatch, etag)) {
    return { kind: 'not-modified' as const, etag }
  }

  trackDetailPageView(context, target)

  return { kind: 'ok' as const, etag, payload }
})

export const contentDetailRouter = impl.router({
  postBySlug,
  pageBySlug,
})
