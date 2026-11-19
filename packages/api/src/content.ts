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

export const contentBootstrapContract = {
  bootstrap: oc.route({ method: 'GET', path: '/content/bootstrap' }).output(contentBootstrapOutputSchema),
}

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
