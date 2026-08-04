import type { ListingPageLoaderData } from '@kobato/shared/types/catalog'

import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { resolveFontsForRender } from '@kobato/server/domains/fonts/services/render'
import { verifyPreviewToken } from '@kobato/server/domains/preview-token/service'
import { redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks'
import { findCategoryBySlug, listAllCategories } from '@kobato/server/domains/taxonomies/categories/services/query'
import { findTagBySlug } from '@kobato/server/domains/taxonomies/tags/service'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service'
import { handlerContextToRequestContext } from '@kobato/server/http/handler-context-projection'
import { loadCommentsAndItems } from '@kobato/server/http/loaders/comments'
import { loadPostDetailData, loadPageDetailData } from '@kobato/server/http/loaders/detail-data'
import {
  loadArchivesData,
  loadCategoryListData,
  loadHomeData,
  loadPostListData,
  loadTagListData,
} from '@kobato/server/http/loaders/listing-data'
import { searchLoader } from '@kobato/server/http/loaders/search'
import { loadSidebarData } from '@kobato/server/http/loaders/sidebar'
import { publicProc } from '@kobato/server/http/orpc-base'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { publicWebmentionDto } from '@kobato/shared/contracts/webmentions'
import { ORPCError, type as typeSchema } from '@orpc/server'
import { z } from 'zod'

/**
 * Headless Content API — the read surface the public frontend consumes
 * (official frontend over `/rpc`, third-party frontends over `/api`).
 * Every procedure wraps an existing page loader so the output shape is
 * identical to what SSR reads today; the route modules stop importing
 * server code and call these through the injected client instead.
 */

/** Root-layout data: settings bundle (secrets redacted) + resolved font slots. */
const layout = publicProc.route({ method: 'GET', path: '/content/v1/layout' }).handler(async ({ context }) => {
  const rawBundle = getBlogSettingsBundleSync()
  const blogSettings = rawBundle ? redactSecretsFromBundle(rawBundle) : null
  // Same eager resolution as the root loader (`wantsPostFonts: true` —
  // the root layout cannot know which child routes opt in until render).
  const fonts = blogSettings?.fonts ? await resolveFontsForRender(context.db, blogSettings.fonts, true) : null
  return { blogSettings, fonts }
})

/** Sidebar widgets (admin flag + latest comments when enabled). */
const sidebar = publicProc
  .route({ method: 'GET', path: '/content/v1/sidebar' })
  .handler(async ({ context }) => loadSidebarData(context.db, context.session))

/**
 * Approved webmentions for one page — keyed by the metric `public_id`
 * (`page_key`), identical to the comments list. The display gates
 * (global `displayOnPosts` + per-entity meta toggle) live in
 * `loadPublicWebmentionsForTarget`, the single owner shared with the
 * detail loader.
 */
const listWebmentions = publicProc
  .route({ method: 'GET', path: '/content/v1/webmentions' })
  .input(z.object({ page_key: z.string() }))
  .output(z.object({ webmentions: z.array(publicWebmentionDto) }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.page_key)
    return { webmentions: await loadPublicWebmentionsForTarget(context.db, target) }
  })

/**
 * Post detail — the full page-assembly data SSR renders (minus the
 * streaming Promise fields; comments / webmentions come from their own
 * list procedures, the frontend loader fans them out un-awaited).
 *
 * Control flow is expressed in the payload, not thrown redirects:
 *   - not found     → NOT_FOUND (frontend answers 404)
 *   - alias hit     → `canonicalSlug` set; the frontend replays the 301
 *     (`wire.slug !== urlSlug` — the v8 key-flow design)
 */
const postDetail = publicProc
  .route({ method: 'GET', path: '/content/v1/posts/:slug' })
  .input(z.object({ slug: z.string().min(1), previewToken: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const rc = handlerContextToRequestContext(context)
    // Draft preview (plan 0.5 §5): `previewToken` is the role-bound
    // credential minted by the admin app (`admin.previewToken.mint`) —
    // the session cookie cannot cross the two-domain topology, so the
    // token is what authorizes author/admin draft reads here. Anonymous
    // callers without a token never see drafts (the role override stays
    // `undefined` → `canPreviewDraft` answers false).
    const previewRole =
      input.previewToken === undefined ? undefined : (verifyPreviewToken(input.previewToken)?.role ?? undefined)
    const data = await loadPostDetailData(context.db, rc, context.request, input.slug, previewRole)
    if (data === null) {
      throw new ORPCError('NOT_FOUND', { message: '文章不存在' })
    }
    // The RPC wire cannot carry Promises — comments / webmentions stay
    // out of the payload; the frontend loader fans them out from their
    // own list procedures (streaming rule, 0.5 phase design).
    const { comments: _comments, webmentions: _webmentions, ...detail } = data.detail
    return { ...data, detail }
  })

/** Page detail — same contract as the post detail, plus draft preview. */
const pageDetail = publicProc
  .route({ method: 'GET', path: '/content/v1/pages/:slug' })
  // `wantsDraftPreview` accepts the REST wire's `"true"`/`"false"` strings
  // AND the RPC wire's native booleans (`z.coerce.boolean()` would turn
  // `"false"` into `true`, so the union is the honest coercion).
  .input(
    z.object({
      slug: z.string().min(1),
      wantsDraftPreview: z
        .union([z.boolean(), z.literal('true'), z.literal('false')])
        .optional()
        .transform((value) => (value === 'true' ? true : value === 'false' ? false : value)),
      // Role-bound draft-preview credential (see the post detail comment).
      previewToken: z.string().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const rc = handlerContextToRequestContext(context)
    const previewRole =
      input.previewToken === undefined ? undefined : (verifyPreviewToken(input.previewToken)?.role ?? undefined)
    try {
      const data = await loadPageDetailData(
        context.db,
        rc,
        context.request,
        input.slug,
        input.wantsDraftPreview === true,
        previewRole,
      )
      const { comments: _comments, webmentions: _webmentions, ...detail } = data.detail
      return { ...data, detail }
    } catch (err) {
      // The shared assembly reuses `loadPagePreview` verbatim, whose
      // control flow is React-Router-shaped: a live post slug under a
      // page URL throws a 301, a missing page a 404. Translate those to
      // the procedure contract; the frontend replays redirects.
      if (err instanceof Response) {
        if (err.status === 301 || err.status === 308) {
          return { redirectTo: err.headers.get('Location') ?? `/posts/${input.slug}` }
        }
        if (err.status === 404) {
          throw new ORPCError('NOT_FOUND', { message: '页面不存在' })
        }
      }
      throw err
    }
  })

/** Full-text search listing — wraps `searchLoader` shape-for-shape. */
const search = publicProc
  .route({ method: 'GET', path: '/content/v1/search' })
  .input(z.object({ keyword: z.string().min(1), num: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const rc = handlerContextToRequestContext(context)
    return withRedirectPayload(() =>
      searchLoader(context.db, { keyword: input.keyword, num: input.num, auditContext: rc }),
    )
  })

/** Homepage listing (featured + recent sidebar, paginated). */
/** Shared redirect adaptation: the page loaders throw React-Router-shaped
 * 301/302 `Response`s (canonical page collapse, overflow redirects); the
 * RPC wire cannot carry them, so they become a `redirectTo` payload the
 * frontend loader replays with `throw redirect(...)`. */
async function withRedirectPayload<T>(run: () => Promise<T>): Promise<T | { redirectTo: string }> {
  try {
    return await run()
  } catch (err) {
    if (err instanceof Response && (err.status === 301 || err.status === 302 || err.status === 308)) {
      return { redirectTo: err.headers.get('Location') ?? '/' }
    }
    throw err
  }
}

const home = publicProc
  .route({ method: 'GET', path: '/content/v1/home' })
  .input(z.object({ num: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const rc = handlerContextToRequestContext(context)
    return withRedirectPayload(() => loadHomeData(context.db, rc, input.num))
  })

/**
 * Plain paginated post listing — the home listing without the
 * featured/sidebar extras. Same post set, page size, tail-merge and
 * overflow/canonical redirects as `/content/v1/home` (the `redirectTo`
 * payload on overflow), so third-party frontends that only need a
 * posts index paginate here instead of paying for the `extra` payload.
 */
const postList = publicProc
  .route({ method: 'GET', path: '/content/v1/posts' })
  .input(z.object({ num: z.string().optional() }))
  .output(typeSchema<ListingPageLoaderData | { redirectTo: string }>())
  .handler(async ({ input, context }) => {
    return withRedirectPayload(() => loadPostListData(context.db, input.num))
  })

/** Category listing; NOT_FOUND when the category slug is unknown. */
const categoryList = publicProc
  .route({ method: 'GET', path: '/content/v1/categories/:slug' })
  .input(z.object({ slug: z.string().min(1), num: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const data = await withRedirectPayload(() => loadCategoryListData(context.db, input.slug, input.num))
    if (data === null) {
      throw new ORPCError('NOT_FOUND', { message: '分类不存在' })
    }
    return data
  })

/** Every category (taxonomy overview page). */
const allCategories = publicProc
  .route({ method: 'GET', path: '/content/v1/categories' })
  .handler(async ({ context }) => ({ categories: await listAllCategories(context.db) }))

/** Category meta (slug/name/description) for third-party navigation. */
const categoryDetail = publicProc
  .route({ method: 'GET', path: '/content/v1/categories/:slug/meta' })
  .input(z.object({ slug: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const category = await findCategoryBySlug(context.db, input.slug)
    if (category === null) {
      throw new ORPCError('NOT_FOUND', { message: '分类不存在' })
    }
    return { slug: category.slug, name: category.name, description: category.description ?? null }
  })

/** Tag listing; NOT_FOUND when the tag slug is unknown. */
const tagList = publicProc
  .route({ method: 'GET', path: '/content/v1/tags/:slug' })
  .input(z.object({ slug: z.string().min(1), num: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const data = await withRedirectPayload(() => loadTagListData(context.db, input.slug, input.num))
    if (data === null) {
      throw new ORPCError('NOT_FOUND', { message: '标签不存在' })
    }
    return data
  })

/** Tag meta (slug/name) for third-party navigation. */
const tagDetail = publicProc
  .route({ method: 'GET', path: '/content/v1/tags/:slug/meta' })
  .input(z.object({ slug: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const tag = await findTagBySlug(context.db, input.slug)
    if (tag === null) {
      throw new ORPCError('NOT_FOUND', { message: '标签不存在' })
    }
    return { slug: tag.slug, name: tag.name }
  })

/** Comment tree for one page — the streaming payload the detail routes
 * fan out un-awaited (comment data tree + flattened wire items). The
 * flat paginated list stays available as `comments.loadComments` for
 * third-party consumers; the renderer needs the tree. */
const commentsTree = publicProc
  .route({ method: 'GET', path: '/content/v1/comments/tree' })
  .input(z.object({ page_key: z.string() }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.page_key)
    const { commentData, commentItems } = await loadCommentsAndItems(context.db, context.session, target)
    if (commentData === null) {
      throw new ORPCError('BAD_GATEWAY', { message: '无法连接到评论服务器' })
    }
    return { commentData, commentItems }
  })

/** Archives: every live post with like/view metadata. */
const archives = publicProc
  .route({ method: 'GET', path: '/content/v1/archives' })
  .handler(async ({ context }) => loadArchivesData(context.db))

export const contentPublicRouter = {
  layout,
  sidebar,
  listWebmentions,
  postDetail,
  pageDetail,
  search,
  home,
  postList,
  categoryList,
  categoryDetail,
  tagList,
  tagDetail,
  archives,
  commentsTree,
  allCategories,
}
