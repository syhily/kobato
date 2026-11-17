import type { EntityTarget } from '@kobato/db/target.ts'

import { resolveBodyHtml } from '@kobato/server/domains/content/services/body-html.ts'
import { listAllFriends } from '@kobato/server/domains/friends/service.ts'
import { selectSidebarPosts } from '@kobato/server/domains/posts/services/featured.ts'
import { getTagsByNames, listAllTags } from '@kobato/server/domains/taxonomies/tags/service.ts'
import { translateThrownResponse } from '@kobato/server/http/content-signals.ts'
import { loadDetailCritical, trackDetailPageView } from '@kobato/server/http/loaders/detail.ts'
import { loadPagePreview } from '@kobato/server/http/loaders/page-preview.ts'
import { loadPostPreview } from '@kobato/server/http/loaders/post-detail.ts'
import { selectSidebarTags, sidebarSelection } from '@kobato/server/http/loaders/sidebar-select.ts'
import { publicProc } from '@kobato/server/http/orpc-base.ts'
import {
  etagHeaderMatches,
  pageEtag,
  postEtag,
  representationFromLocalization,
} from '@kobato/server/infra/http/etag.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import {
  contentPageBySlugInputSchema,
  contentPageBySlugOutputSchema,
  contentPostBySlugInputSchema,
  contentPostBySlugOutputSchema,
} from '@kobato/shared/contracts/content.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'

// `/posts/:slug`. The decision tree (draft fallback → 404 → canonical 301)
// lives in `loadPostPreview`, which throws Responses translated here. The
// detail ETag is computed AFTER the full payload is assembled — it covers the
// post shell, body html, tags, sidebar and the interaction critical, so it can
// only be compared once every one of those reads has settled. Draft previews
// never carry a published ETag. Comments stream via a separate fan-out.
const postBySlug = publicProc
  .route({ method: 'GET', path: '/content/posts/bySlug' })
  .input(contentPostBySlugInputSchema)
  .output(contentPostBySlugOutputSchema)
  .handler(async ({ input, context }) => {
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

    // ONE sidebar selection for this representation: scope (the content id) +
    // site calendar day + settings revision. It is shared by both widgets so
    // repeated renders pick the same sidebar and the ETag stays stable.
    const sidebar = sidebarSelection({
      settings: requireBlogSettingsSection('sidebar', context.settings),
      scope: `post:${preview.sourcePost.id}`,
      now: new Date(),
      localization: context.localization,
    })

    // Parallel: the critical path is the max of these reads, not their sum.
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

// `/:slug`. Same union shape; branches preserved through `loadPagePreview`
// (throws Responses, translated here): post slug → redirect 301; draft
// previews never carry the published ETag (`etag: null`).
const pageBySlug = publicProc
  .route({ method: 'GET', path: '/content/pages/bySlug' })
  .input(contentPageBySlugInputSchema)
  .output(contentPageBySlugOutputSchema)
  .handler(async ({ input, context }) => {
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

    // Friends (only when the section renders), the body_html fallback
    // projection and the interaction critical load in parallel.
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

export const contentDetailRouter = {
  postBySlug,
  pageBySlug,
}
