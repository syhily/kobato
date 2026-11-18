import {
  contentArchivesInputSchema,
  contentArchivesOutputSchema,
  contentBootstrapOutputSchema,
  contentCategoriesListInputSchema,
  contentCategoriesListOutputSchema,
  contentCommentsByKeyInputSchema,
  contentCommentsByKeyOutputSchema,
  contentHomeInputSchema,
  contentHomeOutputSchema,
  contentPageBySlugInputSchema,
  contentPageBySlugOutputSchema,
  contentPostBySlugInputSchema,
  contentPostBySlugOutputSchema,
  contentPostsListInputSchema,
  contentPostsListOutputSchema,
  contentSearchInputSchema,
  contentSearchOutputSchema,
} from '@kobato/contracts/content.ts'
import { oc } from '@orpc/contract'

// The content RPC contract — the Ghost-Content-API-style read-only group every
// public SSR loader consumes. Split by controller surface the same way the
// server splits its controllers; `contentContract` composes the nested
// `apiRouter.content` tree. Route paths are the deployed surface.

// `controllers/content-bootstrap.controller.ts` — the root loader's data segment.
export const contentBootstrapContract = {
  bootstrap: oc.route({ method: 'GET', path: '/content/bootstrap' }).output(contentBootstrapOutputSchema),
}

// `controllers/content-listings.controller.ts` — every paginated listing.
export const contentListingsContract = {
  home: oc
    .route({ method: 'GET', path: '/content/home' })
    .input(contentHomeInputSchema)
    .output(contentHomeOutputSchema),
  postsList: oc
    .route({ method: 'GET', path: '/content/posts/list' })
    .input(contentPostsListInputSchema)
    .output(contentPostsListOutputSchema),
  search: oc
    .route({ method: 'GET', path: '/content/search' })
    .input(contentSearchInputSchema)
    .output(contentSearchOutputSchema),
  categoriesList: oc
    .route({ method: 'GET', path: '/content/categories/list' })
    .input(contentCategoriesListInputSchema)
    .output(contentCategoriesListOutputSchema),
  archives: oc
    .route({ method: 'GET', path: '/content/archives' })
    .input(contentArchivesInputSchema)
    .output(contentArchivesOutputSchema),
}

// `controllers/content-detail.controller.ts` — post/page detail documents.
export const contentDetailContract = {
  postBySlug: oc
    .route({ method: 'GET', path: '/content/posts/bySlug' })
    .input(contentPostBySlugInputSchema)
    .output(contentPostBySlugOutputSchema),
  pageBySlug: oc
    .route({ method: 'GET', path: '/content/pages/bySlug' })
    .input(contentPageBySlugInputSchema)
    .output(contentPageBySlugOutputSchema),
}

// `controllers/content-comments.controller.ts` — the streamed comment thread.
export const contentCommentsContract = {
  byKey: oc
    .route({ method: 'GET', path: '/content/comments/byKey' })
    .input(contentCommentsByKeyInputSchema)
    .output(contentCommentsByKeyOutputSchema),
}

export const contentContract = {
  bootstrap: contentBootstrapContract.bootstrap,
  home: contentListingsContract.home,
  posts: { list: contentListingsContract.postsList, bySlug: contentDetailContract.postBySlug },
  pages: { bySlug: contentDetailContract.pageBySlug },
  comments: { byKey: contentCommentsContract.byKey },
  search: contentListingsContract.search,
  categories: { list: contentListingsContract.categoriesList },
  archives: contentListingsContract.archives,
}
