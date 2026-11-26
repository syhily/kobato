import { resourceOutputSchema } from '@kobato/api/contracts/primitives'
import { deviceEnvBeaconOutputSchema, deviceEnvBeaconSchema } from '@kobato/api/contracts/public/analytics'
import {
  avatarFindInputSchema,
  avatarFindOutputSchema,
  avatarImageInputSchema,
  avatarImageOutputSchema,
} from '@kobato/api/contracts/public/avatar'
import { brandingAssetInputSchema, brandingAssetOutputSchema } from '@kobato/api/contracts/public/branding'
import {
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentIdInputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  commentUpdateOwnInputSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/api/contracts/public/comments'
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
  isContentRedirectSignal,
} from '@kobato/api/contracts/public/content'
import { feedOutputSchema, feedScopeInputSchema } from '@kobato/api/contracts/public/feeds'
import { embeddedFontInputSchema, embeddedFontOutputSchema } from '@kobato/api/contracts/public/fonts'
import { applyFriendSchema, friendsApplyOutputSchema } from '@kobato/api/contracts/public/friends'
import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/api/contracts/public/github'
import {
  calendarImageInputSchema,
  calendarImageOutputSchema,
  imageResolveThumbhashInputSchema,
  imageResolveThumbhashOutputSchema,
  ogImageInputSchema,
  ogImageOutputSchema,
} from '@kobato/api/contracts/public/images'
import {
  likeDecreaseInput,
  likeDecreaseOutput,
  likeIncreaseInput,
  likeIncreaseOutput,
  likeValidateInput,
  likeValidateOutput,
} from '@kobato/api/contracts/public/likes'
import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/api/contracts/public/music'
import {
  newsletterConfirmSchema,
  newsletterOkOutputSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/api/contracts/public/newsletter'
import {
  listNotificationsInput,
  listNotificationsOutput,
  markNotificationsReadInput,
  markNotificationsUnreadInput,
  notificationThreadInput,
  notificationThreadOutput,
  replyNotificationInput,
  replyNotificationOutput,
  unreadCountOutput,
} from '@kobato/api/contracts/public/notifications'
import {
  publicRumStatusInputSchema,
  publicRumStatusOutputSchema,
  rumIntakeInputSchema,
  rumIntakeOutputSchema,
} from '@kobato/api/contracts/public/observability'
import { sitemapInputSchema, sitemapOutputSchema } from '@kobato/api/contracts/public/sitemap'
import { storageObjectInputSchema, storageObjectOutputSchema } from '@kobato/api/contracts/public/storage'
import {
  webmentionPublicListOutputSchema,
  webmentionPublicListSchema,
  webmentionReceiveInputSchema,
  webmentionReceiveOutputSchema,
} from '@kobato/api/contracts/public/webmentions'
import { publicAnalyticsContract } from '@kobato/api/rpc/public/analytics'
import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { brandingContract } from '@kobato/api/rpc/public/branding'
import {
  commentsContract,
  commentsOwnContract,
  commentsPublicContract,
  commentsTokenContract,
} from '@kobato/api/rpc/public/comments'
import {
  contentBootstrapContract,
  contentCommentsContract,
  contentContract,
  contentDetailContract,
  contentListingsContract,
} from '@kobato/api/rpc/public/content'
import { feedsContract } from '@kobato/api/rpc/public/feeds'
import { fontsContract } from '@kobato/api/rpc/public/fonts'
import { friendsContract } from '@kobato/api/rpc/public/friends'
import { githubContract } from '@kobato/api/rpc/public/github'
import { imagesContract } from '@kobato/api/rpc/public/images'
import { likesContract } from '@kobato/api/rpc/public/likes'
import { musicContract } from '@kobato/api/rpc/public/music'
import { newsletterContract } from '@kobato/api/rpc/public/newsletter'
import { notificationsContract } from '@kobato/api/rpc/public/notifications'
import { publicObservabilityContract } from '@kobato/api/rpc/public/observability'
import { sitemapContract } from '@kobato/api/rpc/public/sitemap'
import { storageContract } from '@kobato/api/rpc/public/storage'
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
  analytics: {
    contract: publicAnalyticsContract as unknown as Record<string, unknown>,
    routes: {
      recordDeviceEnv: {
        method: 'POST',
        path: '/analytics/env',
        input: deviceEnvBeaconSchema,
        output: deviceEnvBeaconOutputSchema,
      },
    },
  },
  observability: {
    contract: publicObservabilityContract as unknown as Record<string, unknown>,
    routes: {
      rumStatus: {
        method: 'GET',
        path: '/rum/status',
        input: publicRumStatusInputSchema,
        output: publicRumStatusOutputSchema,
      },
      rumIntake: {
        method: 'POST',
        path: '/api/rum/intake/*',
        input: rumIntakeInputSchema,
        output: rumIntakeOutputSchema,
      },
    },
  },
  avatar: {
    contract: avatarContract as unknown as Record<string, unknown>,
    routes: {
      find: { method: 'GET', path: '/avatar/find', input: avatarFindInputSchema, output: avatarFindOutputSchema },
      image: { method: 'GET', path: '/images/avatar', input: avatarImageInputSchema, output: avatarImageOutputSchema },
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
  'comments/own': {
    contract: commentsOwnContract as unknown as Record<string, unknown>,
    routes: {
      updateOwn: {
        method: 'POST',
        path: '/comments/update-own',
        input: commentUpdateOwnInputSchema,
        output: ownCommentMutationDto,
      },
      requestDeleteOwn: {
        method: 'POST',
        path: '/comments/request-delete-own',
        input: commentIdInputSchema,
        output: ownCommentMutationDto,
      },
      cancelDeleteOwn: {
        method: 'POST',
        path: '/comments/cancel-delete-own',
        input: commentIdInputSchema,
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
  likes: {
    contract: likesContract as unknown as Record<string, unknown>,
    routes: {
      increase: { method: 'POST', path: '/likes/increase', input: likeIncreaseInput, output: likeIncreaseOutput },
      decrease: { method: 'POST', path: '/likes/decrease', input: likeDecreaseInput, output: likeDecreaseOutput },
      validate: { method: 'GET', path: '/likes/validate', input: likeValidateInput, output: likeValidateOutput },
    },
  },
  friends: {
    contract: friendsContract as unknown as Record<string, unknown>,
    routes: {
      apply: { method: 'POST', path: '/friends/apply', input: applyFriendSchema, output: friendsApplyOutputSchema },
    },
  },
  notifications: {
    contract: notificationsContract as unknown as Record<string, unknown>,
    routes: {
      list: {
        method: 'GET',
        path: '/notifications/list',
        input: listNotificationsInput,
        output: listNotificationsOutput,
      },
      unreadCount: { method: 'GET', path: '/notifications/unread-count', output: unreadCountOutput },
      markRead: {
        method: 'POST',
        path: '/notifications/mark-read',
        input: markNotificationsReadInput,
        output: unreadCountOutput,
      },
      markUnread: {
        method: 'POST',
        path: '/notifications/mark-unread',
        input: markNotificationsUnreadInput,
        output: unreadCountOutput,
      },
      thread: {
        method: 'GET',
        path: '/notifications/thread',
        input: notificationThreadInput,
        output: notificationThreadOutput,
      },
      reply: {
        method: 'POST',
        path: '/notifications/reply',
        input: replyNotificationInput,
        output: replyNotificationOutput,
      },
    },
  },
  newsletter: {
    contract: newsletterContract as unknown as Record<string, unknown>,
    routes: {
      subscribe: {
        method: 'POST',
        path: '/newsletter/subscribe',
        input: newsletterSubscribeSchema,
        output: newsletterOkOutputSchema,
      },
      confirm: {
        method: 'POST',
        path: '/newsletter/confirm',
        input: newsletterConfirmSchema,
        output: newsletterOkOutputSchema,
      },
      unsubscribe: {
        method: 'POST',
        path: '/newsletter/unsubscribe',
        input: newsletterUnsubscribeSchema,
        output: newsletterOkOutputSchema,
      },
    },
  },
  'content/bootstrap': {
    contract: contentBootstrapContract as unknown as Record<string, unknown>,
    routes: {
      bootstrap: {
        method: 'GET',
        path: '/content/bootstrap',
        input: contentBootstrapInputSchema,
        output: contentBootstrapOutputSchema,
      },
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
      og: { method: 'GET', path: '/images/og', input: ogImageInputSchema, output: ogImageOutputSchema },
      calendar: {
        method: 'GET',
        path: '/images/calendar',
        input: calendarImageInputSchema,
        output: calendarImageOutputSchema,
      },
    },
  },
  branding: {
    contract: brandingContract as unknown as Record<string, unknown>,
    routes: {
      asset: {
        method: 'GET',
        path: '/branding/asset',
        input: brandingAssetInputSchema,
        output: brandingAssetOutputSchema,
      },
    },
  },
  fonts: {
    contract: fontsContract as unknown as Record<string, unknown>,
    routes: {
      embedded: {
        method: 'GET',
        path: '/fonts/embedded',
        input: embeddedFontInputSchema,
        output: embeddedFontOutputSchema,
      },
    },
  },
  storage: {
    contract: storageContract as unknown as Record<string, unknown>,
    routes: {
      object: {
        method: 'GET',
        path: '/storage/object',
        input: storageObjectInputSchema,
        output: storageObjectOutputSchema,
      },
    },
  },
  music: {
    contract: musicContract as unknown as Record<string, unknown>,
    routes: {
      get: { method: 'GET', path: '/music/get', input: musicGetInputSchema, output: musicGetOutputSchema },
    },
  },
  feeds: {
    contract: feedsContract as unknown as Record<string, unknown>,
    routes: {
      rss: { method: 'GET', path: '/feeds/rss', input: feedScopeInputSchema, output: feedOutputSchema },
      atom: { method: 'GET', path: '/feeds/atom', input: feedScopeInputSchema, output: feedOutputSchema },
    },
  },
  sitemap: {
    contract: sitemapContract as unknown as Record<string, unknown>,
    routes: {
      xml: { method: 'GET', path: '/sitemap/xml', input: sitemapInputSchema, output: sitemapOutputSchema },
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
      receive: {
        method: 'POST',
        path: '/webmention',
        input: webmentionReceiveInputSchema,
        output: webmentionReceiveOutputSchema,
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
  it('commentsContract merges the anonymous, own-write, and token surfaces flat', () => {
    expect(Object.keys(commentsContract)).toEqual([
      ...Object.keys(commentsPublicContract),
      ...Object.keys(commentsOwnContract),
      ...Object.keys(commentsTokenContract),
    ])
    expect(commentsContract.replyComment).toBe(commentsPublicContract.replyComment)
    expect(commentsContract.updateOwn).toBe(commentsOwnContract.updateOwn)
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

  it('isContentRedirectSignal accepts exactly the redirect signal shape', () => {
    expect(isContentRedirectSignal({ kind: 'redirect', to: '/', status: 302 })).toBe(true)
    expect(isContentRedirectSignal({ kind: 'redirect', to: '/posts/x', status: 301 })).toBe(true)
    expect(isContentRedirectSignal({ kind: 'not-modified', etag: 'W/"x"' })).toBe(false)
    expect(isContentRedirectSignal({ kind: 'redirect', to: '/', status: 303 })).toBe(false)
    expect(isContentRedirectSignal({ pageNum: 1, totalPage: 2 })).toBe(false)
    expect(isContentRedirectSignal(null)).toBe(false)
  })

  it('keeps the feed scope input to category, tag, and ifNoneMatch', () => {
    expect(feedScopeInputSchema.safeParse({}).success).toBe(true)
    expect(feedScopeInputSchema.safeParse({ category: 'tech' }).success).toBe(true)
    expect(feedScopeInputSchema.safeParse({ tag: 'ai', ifNoneMatch: 'W/"x"' }).success).toBe(true)
    expect(feedScopeInputSchema.safeParse({ category: 'a', tag: 'b' }).success).toBe(true)
    expect(feedScopeInputSchema.parse({ scope: 'tech', category: 'tech' })).toEqual({ category: 'tech' })
    expect(feedOutputSchema).toBe(resourceOutputSchema)
    expect(sitemapOutputSchema).toBe(resourceOutputSchema)
  })

  it('resourceOutputSchema answers exactly the ok / not-modified cases', () => {
    expect(
      resourceOutputSchema.safeParse({
        kind: 'ok',
        body: '<rss/>',
        etag: '"abc"',
        contentType: 'application/xml; charset=utf-8',
        cacheControl: 'public, no-cache',
        contentLanguage: 'zh-CN',
      }).success,
    ).toBe(true)
    expect(
      resourceOutputSchema.safeParse({
        kind: 'not-modified',
        etag: '"abc"',
        contentType: 'application/xml; charset=utf-8',
        cacheControl: 'public, no-cache',
        contentLanguage: null,
      }).success,
    ).toBe(true)
    expect(resourceOutputSchema.safeParse({ kind: 'redirect', to: '/' }).success).toBe(false)
    expect(resourceOutputSchema.safeParse({ kind: 'ok', body: '<rss/>' }).success).toBe(false)
  })
})
