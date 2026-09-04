import { resolveBodyHtml } from '@/server/domains/content/services/body-html'
import { listAllFriends } from '@/server/domains/friends/service'
import { selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { getTagsByNames, listAllTags } from '@/server/domains/taxonomies/tags/service'
import { translateThrownResponse } from '@/server/http/content-signals'
import { loadPublicDetailData } from '@/server/http/loaders/detail'
import { loadPagePreview } from '@/server/http/loaders/page-preview'
import { loadPostPreview } from '@/server/http/loaders/post-detail'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { publicProc } from '@/server/http/orpc-base'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import {
  contentPageBySlugInputSchema,
  contentPageBySlugOutputSchema,
  contentPostBySlugInputSchema,
  contentPostBySlugOutputSchema,
} from '@/shared/contracts/content'
import { idFromString } from '@/shared/utils/id'

// `/posts/:slug`. The decision tree (ETag probe → draft fallback → 404 →
// canonical 301 → ETag re-check) lives in `loadPostPreview`, which throws
// Responses translated here. Comments stream via a separate fan-out. The body
// is the saved `body_html` projection (compute-on-read fallback inside
// `resolveBodyHtml`) — image meta and music data are baked in at save time.
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
        role: context.viewer?.role,
        ifNoneMatch: input.ifNoneMatch,
      })
    } catch (error) {
      return translateThrownResponse(error)
    }

    // Parallel: the critical path is the max of these reads, not their sum.
    const [visibleTags, bodyHtml, sidebarTags, sidebarPosts, critical] = await Promise.all([
      getTagsByNames(db, preview.post.tags),
      resolveBodyHtml(preview.sourcePost),
      listAllTags(db).then(selectSidebarTags),
      selectSidebarPosts(db, getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts')),
      loadPublicDetailData(context, { type: 'post', ownerId: idFromString(preview.post.id) }),
    ])

    return {
      kind: 'ok' as const,
      etag: preview.etag,
      payload: {
        post: preview.post,
        bodyHtml,
        visibleTags,
        sidebarPosts,
        tags: sidebarTags,
        draftMarker: preview.draftMarker,
        critical,
      },
    }
  })

// `/:slug`. Same union shape; branches preserved through `loadPagePreview`
// (throws Responses, translated here): post slug → redirect 301; draft
// previews skip the ETag re-check (`etag: null`).
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
        role: context.viewer?.role,
        ifNoneMatch: input.ifNoneMatch,
      })
    } catch (error) {
      return translateThrownResponse(error)
    }

    // The friends scan (only when the section renders) and the body_html
    // fallback projection run in parallel.
    const [friends, bodyHtml] = await Promise.all([
      preview.showFriends ? listAllFriends(db) : [],
      resolveBodyHtml(preview.sourcePage),
    ])

    // Dependency-forced serial: the detail target needs the resolved page id.
    const critical = await loadPublicDetailData(context, { type: 'page', ownerId: idFromString(preview.page.id) })

    return {
      kind: 'ok' as const,
      etag: preview.publicEtag,
      payload: {
        page: preview.page,
        bodyHtml,
        friends,
        showFriends: preview.showFriends,
        draftMarker: preview.draftMarker,
        critical,
      },
    }
  })

export const contentDetailRouter = {
  postBySlug,
  pageBySlug,
}
