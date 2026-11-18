import type { AnyContractProcedure } from '@orpc/contract'

import { accountContract } from '@kobato/api/account.ts'
import { analyticsContract } from '@kobato/api/analytics.ts'
import { avatarContract } from '@kobato/api/avatar.ts'
import {
  commentsAuthedContract,
  commentsContract,
  commentsPublicContract,
  commentsTokenContract,
} from '@kobato/api/comments.ts'
import {
  contentBootstrapContract,
  contentCommentsContract,
  contentContract,
  contentDetailContract,
  contentListingsContract,
} from '@kobato/api/content.ts'
import { friendsContract } from '@kobato/api/friends.ts'
import { githubContract } from '@kobato/api/github.ts'
import { imagesContract } from '@kobato/api/images.ts'
import { musicContract } from '@kobato/api/music.ts'
import { newsletterContract } from '@kobato/api/newsletter.ts'
import { notificationsContract } from '@kobato/api/notifications.ts'
import { passkeyContract } from '@kobato/api/passkey.ts'
import { webmentionsContract } from '@kobato/api/webmentions.ts'
import {
  accountPasskeyDeleteInput,
  accountPasskeyListOutputSchema,
  accountPasskeyRegisterBeginInput,
  accountPasskeyRegisterBeginOutputSchema,
  accountPasskeyRegisterFinishInput,
  accountProfileOutputSchema,
  accountRevokeSessionInput,
  accountRevokeSessionOutputSchema,
  accountSessionsOutputSchema,
  accountSetLoginMethodInput,
  accountUpdatePasswordInput,
  accountUpdateProfileInput,
  accountUpdateProfileOutputSchema,
  adminAnalyticsMentionsOutputSchema,
  adminAnalyticsOverviewOutputSchema,
  adminAnalyticsSearchInputSchema,
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
} from '@kobato/contracts/admin.ts'
import {
  analyticsExportOutputSchema,
  analyticsHeatmapOutputSchema,
  analyticsMetricsInputSchema,
  analyticsMetricsOutputSchema,
  analyticsQuerySchema,
  countersDto,
  viewsDto,
} from '@kobato/contracts/analytics.ts'
import {
  avatarFindInputSchema,
  avatarFindOutputSchema,
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentIdInputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentLoadMineInputSchema,
  commentLoadMineOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  commentSearchMineEntitiesInputSchema,
  commentSearchMineEntitiesOutputSchema,
  commentUpdateOwnInputSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/contracts/comments.ts'
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
import { applyFriendSchema, friendsApplyOutputSchema } from '@kobato/contracts/friends.ts'
import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/contracts/github.ts'
import { imageResolveThumbhashInputSchema, imageResolveThumbhashOutputSchema } from '@kobato/contracts/images.ts'
import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/contracts/music.ts'
import {
  newsletterConfirmSchema,
  newsletterOkOutputSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/contracts/newsletter.ts'
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
} from '@kobato/contracts/notifications.ts'
import { successDto } from '@kobato/contracts/primitives.ts'
import { passkeyAuthBeginInputSchema, passkeyOptionsOutputSchema } from '@kobato/contracts/users.ts'
import { webmentionPublicListOutputSchema, webmentionPublicListSchema } from '@kobato/contracts/webmentions.ts'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

/**
 * The deployed wire surface for every migrated non-admin domain — drift in a
 * method or path is a breaking URL change, and an input/output schema that is
 * not the very `@kobato/contracts` object means a copy has crept into
 * `@kobato/api`.
 */

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
  account: {
    contract: accountContract as unknown as Record<string, unknown>,
    routes: {
      profile: { method: 'GET', path: '/account/profile', output: accountProfileOutputSchema },
      sessions: { method: 'GET', path: '/account/sessions', output: accountSessionsOutputSchema },
      updateProfile: {
        method: 'POST',
        path: '/account/update-profile',
        input: accountUpdateProfileInput,
        output: accountUpdateProfileOutputSchema,
      },
      updatePassword: {
        method: 'POST',
        path: '/account/update-password',
        input: accountUpdatePasswordInput,
        output: successDto,
      },
      revokeSession: {
        method: 'POST',
        path: '/account/revoke-session',
        input: accountRevokeSessionInput,
        output: accountRevokeSessionOutputSchema,
      },
      passkeyList: { method: 'GET', path: '/account/passkeys', output: accountPasskeyListOutputSchema },
      passkeyRegisterBegin: {
        method: 'POST',
        path: '/account/passkeys/register-begin',
        input: accountPasskeyRegisterBeginInput,
        output: accountPasskeyRegisterBeginOutputSchema,
      },
      passkeyRegisterFinish: {
        method: 'POST',
        path: '/account/passkeys/register-finish',
        input: accountPasskeyRegisterFinishInput,
        output: successDto,
      },
      passkeyDelete: {
        method: 'POST',
        path: '/account/passkeys/delete',
        input: accountPasskeyDeleteInput,
        output: successDto,
      },
      setLoginMethod: {
        method: 'POST',
        path: '/account/login-method',
        input: accountSetLoginMethodInput,
        output: successDto,
      },
    },
  },
  analytics: {
    contract: analyticsContract as unknown as Record<string, unknown>,
    routes: {
      counters: { method: 'GET', path: '/analytics/counters', input: analyticsQuerySchema, output: countersDto },
      views: { method: 'GET', path: '/analytics/views', input: analyticsQuerySchema, output: viewsDto },
      heatmap: {
        method: 'GET',
        path: '/analytics/heatmap',
        input: analyticsQuerySchema,
        output: analyticsHeatmapOutputSchema,
      },
      metrics: {
        method: 'GET',
        path: '/analytics/metrics',
        input: analyticsMetricsInputSchema,
        output: analyticsMetricsOutputSchema,
      },
      export: {
        method: 'GET',
        path: '/analytics/export',
        input: analyticsQuerySchema,
        output: analyticsExportOutputSchema,
      },
      overview: {
        method: 'GET',
        path: '/analytics/overview',
        input: adminAnalyticsSearchInputSchema,
        output: adminAnalyticsOverviewOutputSchema,
      },
      mentions: {
        method: 'GET',
        path: '/analytics/mentions',
        input: adminAnalyticsSearchInputSchema,
        output: adminAnalyticsMentionsOutputSchema,
      },
    },
  },
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
  'comments/authed': {
    contract: commentsAuthedContract as unknown as Record<string, unknown>,
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
      loadMine: {
        method: 'GET',
        path: '/comments/load-mine',
        input: commentLoadMineInputSchema,
        output: commentLoadMineOutputSchema,
      },
      searchMineEntities: {
        method: 'GET',
        path: '/comments/search-mine-entities',
        input: commentSearchMineEntitiesInputSchema,
        output: commentSearchMineEntitiesOutputSchema,
      },
      myCounts: { method: 'GET', path: '/comments/my-counts', output: commentsMyCountsOutputSchema },
      resolveEntity: {
        method: 'GET',
        path: '/comments/resolve-entity',
        input: commentsResolveEntityInputSchema,
        output: commentsResolveEntityOutputSchema,
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
  friends: {
    contract: friendsContract as unknown as Record<string, unknown>,
    routes: {
      apply: { method: 'POST', path: '/friends/apply', input: applyFriendSchema, output: friendsApplyOutputSchema },
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
  passkey: {
    contract: passkeyContract as unknown as Record<string, unknown>,
    routes: {
      authBegin: {
        method: 'POST',
        path: '/passkey/auth-begin',
        input: passkeyAuthBeginInputSchema,
        output: passkeyOptionsOutputSchema,
      },
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

describe('composed domain contracts', () => {
  it('commentsContract merges the three controller surfaces flat', () => {
    expect(Object.keys(commentsContract)).toEqual([
      ...Object.keys(commentsPublicContract),
      ...Object.keys(commentsAuthedContract),
      ...Object.keys(commentsTokenContract),
    ])
    expect(commentsContract.replyComment).toBe(commentsPublicContract.replyComment)
    expect(commentsContract.myCounts).toBe(commentsAuthedContract.myCounts)
    expect(commentsContract.myComments).toBe(commentsTokenContract.myComments)
  })

  it('contentContract mirrors the apiRouter.content nesting', () => {
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

describe('contracts schema sanity (spot checks)', () => {
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

  it('keeps the update-password policy wired into the account input', () => {
    expect(accountUpdatePasswordInput.safeParse({ oldPassword: 'x', newPassword: 'short' }).success).toBe(false)
    expect(accountUpdatePasswordInput.safeParse({ oldPassword: 'x', newPassword: 'CorrectHorse1' }).success).toBe(true)
  })
})
