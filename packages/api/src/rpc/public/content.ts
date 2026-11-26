import {
  contentArchivesInputSchema,
  contentArchivesOutputSchema,
  contentBootstrapInputSchema,
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
} from '@kobato/api/contracts/public/content'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const contentBootstrapContract = {
  bootstrap: defineProcedure(
    { method: 'GET', path: '/content/bootstrap' },
    { publicRead: true, installGateExempt: true },
  )
    .input(contentBootstrapInputSchema)
    .output(contentBootstrapOutputSchema),
}

export const contentListingsContract = {
  home: defineProcedure({ method: 'GET', path: '/content/home' }, { publicRead: true })
    .input(contentHomeInputSchema)
    .output(contentHomeOutputSchema),
  postsList: defineProcedure({ method: 'GET', path: '/content/posts/list' }, { publicRead: true })
    .input(contentPostsListInputSchema)
    .output(contentPostsListOutputSchema),
  search: defineProcedure({ method: 'GET', path: '/content/search' }, { publicRead: true })
    .input(contentSearchInputSchema)
    .output(contentSearchOutputSchema),
  categoriesList: defineProcedure({ method: 'GET', path: '/content/categories/list' }, { publicRead: true })
    .input(contentCategoriesListInputSchema)
    .output(contentCategoriesListOutputSchema),
  archives: defineProcedure({ method: 'GET', path: '/content/archives' }, { publicRead: true })
    .input(contentArchivesInputSchema)
    .output(contentArchivesOutputSchema),
}

export const contentDetailContract = {
  postBySlug: defineProcedure({ method: 'GET', path: '/content/posts/bySlug' }, { publicRead: true })
    .input(contentPostBySlugInputSchema)
    .output(contentPostBySlugOutputSchema),
  pageBySlug: defineProcedure({ method: 'GET', path: '/content/pages/bySlug' }, { publicRead: true })
    .input(contentPageBySlugInputSchema)
    .output(contentPageBySlugOutputSchema),
}

export const contentCommentsContract = {
  byKey: defineProcedure({ method: 'GET', path: '/content/comments/byKey' }, { publicRead: true })
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
