import { avatarFindInputSchema, avatarFindOutputSchema } from '@kobato/api/contracts/public/avatar'
import {
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/api/contracts/public/comments'
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
} from '@kobato/api/contracts/public/content'
import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/api/contracts/public/github'
import {
  imageResolveThumbhashInputSchema,
  imageResolveThumbhashOutputSchema,
} from '@kobato/api/contracts/public/images'
import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/api/contracts/public/music'
import { webmentionPublicListOutputSchema, webmentionPublicListSchema } from '@kobato/api/contracts/public/webmentions'
import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { commentsContract, commentsPublicContract, commentsTokenContract } from '@kobato/api/rpc/public/comments'
import {
  contentBootstrapContract,
  contentCommentsContract,
  contentContract,
  contentDetailContract,
  contentListingsContract,
} from '@kobato/api/rpc/public/content'
import { githubContract } from '@kobato/api/rpc/public/github'
import { imagesContract } from '@kobato/api/rpc/public/images'
import { musicContract } from '@kobato/api/rpc/public/music'
import { webmentionsContract } from '@kobato/api/rpc/public/webmentions'
import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

interface RouteSpec {
  method: 'GET' | 'POST'
  path: string
  input?: unknown
  output: unknown
}

interface ContractSpec {
  contract: Record<string, unknown>
  routes: Record<string, RouteSpec>
}

const CONTRACT_SPECS: Record<string, ContractSpec> = {
  avatar: {
    contract: avatarContract as unknown as Record<string, unknown>,
    routes: {
      find: { method: 'GET', path: '/avatar/find', input: avatarFindInputSchema, output: avatarFindOutputSchema },
    },
  },
  'comments/public': {
    contract: commentsPublicContract as unknown as Record<string, unknown>,
    routes: {
      replyComment: {
        method: 'POST',
        path: '/comments/reply',
        input: commentReplySchema,
        output: replyCommentOutputSchema,
      },
      loadComments: {
        method: 'GET',
        path: '/comments/list',
        input: commentListInputSchema,
        output: commentListOutputSchema,
      },
      getRaw: {
        method: 'GET',
        path: '/comments/get-raw',
        input: commentRidSchema,
        output: commentGetRawOutputSchema,
      },
      edit: {
        method: 'POST',
        path: '/comments/edit',
        input: commentEditInputSchema,
        output: ownCommentMutationDto,
      },
    },
  },
  'comments/token': {
    contract: commentsTokenContract as unknown as Record<string, unknown>,
    routes: {
      revokeToken: {
        method: 'POST',
        path: '/comments/revoke-token',
        input: commentRevokeTokenInputSchema,
        output: commentRevokeTokenOutputSchema,
      },
      myComments: {
        method: 'GET',
        path: '/comments/my-comments',
        input: commentMyCommentsInputSchema,
        output: myCommentsOutputSchema,
      },
    },
  },
  'content/bootstrap': {
    contract: contentBootstrapContract as unknown as Record<string, unknown>,
    routes: {
      bootstrap: { method: 'GET', path: '/content/bootstrap', output: contentBootstrapOutputSchema },
    },
  },
  'content/listings': {
    contract: contentListingsContract as unknown as Record<string, unknown>,
    routes: {
      home: { method: 'GET', path: '/content/home', input: contentHomeInputSchema, output: contentHomeOutputSchema },
      postsList: {
        method: 'GET',
        path: '/content/posts/list',
        input: contentPostsListInputSchema,
        output: contentPostsListOutputSchema,
      },
      search: {
        method: 'GET',
        path: '/content/search',
        input: contentSearchInputSchema,
        output: contentSearchOutputSchema,
      },
      categoriesList: {
        method: 'GET',
        path: '/content/categories/list',
        input: contentCategoriesListInputSchema,
        output: contentCategoriesListOutputSchema,
      },
      archives: {
        method: 'GET',
        path: '/content/archives',
        input: contentArchivesInputSchema,
        output: contentArchivesOutputSchema,
      },
    },
  },
  'content/detail': {
    contract: contentDetailContract as unknown as Record<string, unknown>,
    routes: {
      postBySlug: {
        method: 'GET',
        path: '/content/posts/bySlug',
        input: contentPostBySlugInputSchema,
        output: contentPostBySlugOutputSchema,
      },
      pageBySlug: {
        method: 'GET',
        path: '/content/pages/bySlug',
        input: contentPageBySlugInputSchema,
        output: contentPageBySlugOutputSchema,
      },
    },
  },
  'content/comments': {
    contract: contentCommentsContract as unknown as Record<string, unknown>,
    routes: {
      byKey: {
        method: 'GET',
        path: '/content/comments/byKey',
        input: contentCommentsByKeyInputSchema,
        output: contentCommentsByKeyOutputSchema,
      },
    },
  },
  github: {
    contract: githubContract as unknown as Record<string, unknown>,
    routes: {
      avatar: { method: 'GET', path: '/github/avatar', output: githubAvatarOutputSchema },
      release: { method: 'GET', path: '/github/release', output: githubReleaseOutputSchema },
    },
  },
  images: {
    contract: imagesContract as unknown as Record<string, unknown>,
    routes: {
      resolveThumbhash: {
        method: 'GET',
        path: '/image/resolve-thumbhash',
        input: imageResolveThumbhashInputSchema,
        output: imageResolveThumbhashOutputSchema,
      },
    },
  },
  music: {
    contract: musicContract as unknown as Record<string, unknown>,
    routes: {
      get: { method: 'GET', path: '/music/get', input: musicGetInputSchema, output: musicGetOutputSchema },
    },
  },
  webmentions: {
    contract: webmentionsContract as unknown as Record<string, unknown>,
    routes: {
      list: {
        method: 'GET',
        path: '/webmention/list',
        input: webmentionPublicListSchema,
        output: webmentionPublicListOutputSchema,
      },
    },
  },
}

function procedures(router: Record<string, unknown>): Record<string, AnyContractProcedure> {
  return router as Record<string, AnyContractProcedure>
}

describe('public contract shapes', () => {
  it.each(Object.entries(CONTRACT_SPECS))('%s exposes exactly its deployed procedures', (_name, spec) => {
    expect(Object.keys(spec.contract)).toEqual(Object.keys(spec.routes))
    for (const procedure of Object.values(spec.contract)) {
      expect(isContractProcedure(procedure)).toBe(true)
    }
  })

  it.each(Object.entries(CONTRACT_SPECS))('%s pins every method and path', (_name, spec) => {
    const procs = procedures(spec.contract)
    for (const [key, route] of Object.entries(spec.routes)) {
      expect(procs[key]['~orpc'].route, `${key} route`).toEqual({ method: route.method, path: route.path })
    }
  })

  it.each(Object.entries(CONTRACT_SPECS))('%s composes the contracts schemas by reference', (_name, spec) => {
    const procs = procedures(spec.contract)
    for (const [key, route] of Object.entries(spec.routes)) {
      if (route.input !== undefined) {
        expect(procs[key]['~orpc'].inputSchema, `${key} input`).toBe(route.input)
      } else {
        expect(procs[key]['~orpc'].inputSchema, `${key} has no input schema`).toBeUndefined()
      }
      expect(procs[key]['~orpc'].outputSchema, `${key} output`).toBe(route.output)
    }
  })
})

describe('composed public domain contracts', () => {
  it('commentsContract merges the anonymous and token surfaces flat', () => {
    expect(Object.keys(commentsContract)).toEqual([
      ...Object.keys(commentsPublicContract),
      ...Object.keys(commentsTokenContract),
    ])
    expect(commentsContract.replyComment).toBe(commentsPublicContract.replyComment)
    expect(commentsContract.myComments).toBe(commentsTokenContract.myComments)
  })

  it('contentContract mirrors the apiRouter.public.content nesting', () => {
    expect(Object.keys(contentContract)).toEqual([
      'bootstrap',
      'home',
      'posts',
      'pages',
      'comments',
      'search',
      'categories',
      'archives',
    ])
    expect(contentContract.bootstrap).toBe(contentBootstrapContract.bootstrap)
    expect(contentContract.posts.list).toBe(contentListingsContract.postsList)
    expect(contentContract.posts.bySlug).toBe(contentDetailContract.postBySlug)
    expect(contentContract.pages.bySlug).toBe(contentDetailContract.pageBySlug)
    expect(contentContract.comments.byKey).toBe(contentCommentsContract.byKey)
    expect(contentContract.categories.list).toBe(contentListingsContract.categoriesList)
  })
})

describe('public contracts schema sanity (spot checks)', () => {
  it('keeps the rid-regex shared by get-raw and edit', async () => {
    await expect(commentRidSchema.parseAsync({ rid: '42' })).resolves.toEqual({ rid: '42' })
    expect(commentRidSchema.safeParse({ rid: 'abc' }).success).toBe(false)
  })

  it('keeps the comment list input strict about the numeric offset', () => {
    expect(commentListInputSchema.safeParse({ page_key: '/p', offset: 3 }).success).toBe(true)
    expect(commentListInputSchema.safeParse({ page_key: '/p', offset: '3' }).success).toBe(false)
  })

  it('keeps the music player id grammar', () => {
    expect(musicGetInputSchema.safeParse({ id: 'a1b2c3d4e5f6g7h8' }).success).toBe(true)
    expect(musicGetInputSchema.safeParse({ id: 'UPPER' }).success).toBe(false)
  })
})
