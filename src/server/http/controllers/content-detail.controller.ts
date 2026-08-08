import { listAllFriends } from '@/server/domains/friends/service'
import { resolveImageMetaBySources } from '@/server/domains/images/services/enhance'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { prerenderMusicPlayerBlocks } from '@/server/domains/pt/prerender'
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
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { idFromString } from '@/shared/utils/id'

// `/posts/:slug`. The decision tree (ETag probe → draft fallback → 404 →
// canonical 301 → ETag re-check) lives in `loadPostPreview`, which throws
// Responses translated here. Comments stream via a separate fan-out.
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
    const [visibleTags, imageMeta, sidebarTags, sidebarPosts, enrichedBody, critical] = await Promise.all([
      getTagsByNames(db, preview.post.tags),
      resolveImageMetaBySources(db, preview.sourcePost.imageSources).then((r) => Object.fromEntries(r)),
      listAllTags(db).then(selectSidebarTags),
      selectSidebarPosts(db, getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts')),
      prerenderMusicPlayerBlocks(preview.sourcePost.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds)),
      loadPublicDetailData(context, { type: 'post', ownerId: idFromString(preview.post.id) }),
    ])

    return {
      kind: 'ok' as const,
      etag: preview.etag,
      payload: {
        post: preview.post,
        body: enrichedBody ?? preview.sourcePost.body,
        visibleTags,
        sidebarPosts,
        tags: sidebarTags,
        imageMeta,
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

    // Music prerender and the friends scan (only when the section renders) run in parallel.
    const [friends, enrichedBody] = await Promise.all([
      preview.showFriends ? listAllFriends(db) : [],
      prerenderMusicPlayerBlocks(preview.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds)),
    ])

    const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

    // Dependency-forced serial: the detail target needs the resolved page id.
    const critical = await loadPublicDetailData(context, { type: 'page', ownerId: idFromString(preview.page.id) })

    return {
      kind: 'ok' as const,
      etag: preview.publicEtag,
      payload: {
        page: preview.page,
        body: enrichedBody ?? preview.body,
        friends,
        showFriends: preview.showFriends,
        draftMarker: preview.draftMarker,
        imageMeta: preview.imageMeta,
        footnotesSectionTitle,
        critical,
      },
    }
  })

export const contentDetailRouter = {
  postBySlug,
  pageBySlug,
}
