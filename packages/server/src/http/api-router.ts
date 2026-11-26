import type { apiContract } from '@kobato/api/contract'
import type { ContractImplementation } from '@kobato/server/http/contract-implementation'

import { accountRouter } from '@kobato/server/http/controllers/account/account.controller'
import { authRouter } from '@kobato/server/http/controllers/account/auth.controller'
import { commentsAuthedRouter } from '@kobato/server/http/controllers/account/comments-authed.controller'
import { passkeyRouter } from '@kobato/server/http/controllers/account/passkey.controller'
import { setupRouter } from '@kobato/server/http/controllers/account/setup.controller'
import { analyticsRouter } from '@kobato/server/http/controllers/admin/analytics.controller'
import { auditLogRouter } from '@kobato/server/http/controllers/admin/audit.controller'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { adminBrandingRouter } from '@kobato/server/http/controllers/admin/branding.controller'
import { adminCacheRouter } from '@kobato/server/http/controllers/admin/cache.controller'
import { adminCategoriesRouter } from '@kobato/server/http/controllers/admin/categories.controller'
import { adminCommentsRouter } from '@kobato/server/http/controllers/admin/comments.controller'
import { adminFontsRouter } from '@kobato/server/http/controllers/admin/fonts.controller'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller'
import { adminGeoipRouter } from '@kobato/server/http/controllers/admin/geoip.controller'
import { adminImagesRouter } from '@kobato/server/http/controllers/admin/images.controller'
import { adminJobsRouter } from '@kobato/server/http/controllers/admin/jobs.controller'
import { adminMailRouter } from '@kobato/server/http/controllers/admin/mail.controller'
import { adminMusicRouter } from '@kobato/server/http/controllers/admin/music.controller'
import { adminNotificationsRouter } from '@kobato/server/http/controllers/admin/notifications.controller'
import { adminObservabilityRouter } from '@kobato/server/http/controllers/admin/observability.controller'
import { adminPagesRouter } from '@kobato/server/http/controllers/admin/pages.controller'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller'
import { adminRendersRouter } from '@kobato/server/http/controllers/admin/renders.controller'
import { adminSettingsRouter } from '@kobato/server/http/controllers/admin/settings.controller'
import { adminStorageRouter } from '@kobato/server/http/controllers/admin/storage.controller'
import { adminTagsRouter } from '@kobato/server/http/controllers/admin/tags.controller'
import { adminUpdateRouter } from '@kobato/server/http/controllers/admin/update.controller'
import { adminUsersAdminRouter } from '@kobato/server/http/controllers/admin/users-admin.controller'
import { adminUsersCrudRouter } from '@kobato/server/http/controllers/admin/users-crud.controller'
import { adminUsersSessionsRouter } from '@kobato/server/http/controllers/admin/users-sessions.controller'
import { adminWebmentionsRouter } from '@kobato/server/http/controllers/admin/webmentions.controller'
import { publicAnalyticsRouter } from '@kobato/server/http/controllers/public/analytics.controller'
import { avatarRouter } from '@kobato/server/http/controllers/public/avatar.controller'
import { brandingRouter } from '@kobato/server/http/controllers/public/branding.controller'
import { commentsOwnRouter } from '@kobato/server/http/controllers/public/comments-own.controller'
import { commentsPublicRouter } from '@kobato/server/http/controllers/public/comments-public.controller'
import { commentsTokenRouter } from '@kobato/server/http/controllers/public/comments-token.controller'
import { contentBootstrap } from '@kobato/server/http/controllers/public/content-bootstrap.controller'
import { contentCommentsByKey } from '@kobato/server/http/controllers/public/content-comments.controller'
import { contentDetailRouter } from '@kobato/server/http/controllers/public/content-detail.controller'
import { contentListingsRouter } from '@kobato/server/http/controllers/public/content-listings.controller'
import { feedsRouter } from '@kobato/server/http/controllers/public/feeds.controller'
import { fontsRouter } from '@kobato/server/http/controllers/public/fonts.controller'
import { friendsRouter } from '@kobato/server/http/controllers/public/friends.controller'
import { githubRouter } from '@kobato/server/http/controllers/public/github.controller'
import { imageRouter } from '@kobato/server/http/controllers/public/image.controller'
import { likesRouter } from '@kobato/server/http/controllers/public/likes.controller'
import { musicRouter } from '@kobato/server/http/controllers/public/music.controller'
import { newsletterRouter } from '@kobato/server/http/controllers/public/newsletter.controller'
import { notificationsRouter } from '@kobato/server/http/controllers/public/notifications.controller'
import { publicObservabilityRouter } from '@kobato/server/http/controllers/public/observability.controller'
import { sitemapRouter } from '@kobato/server/http/controllers/public/sitemap.controller'
import { storageRouter } from '@kobato/server/http/controllers/public/storage.controller'
import { webmentionPublicRouter } from '@kobato/server/http/controllers/public/webmention-public.controller'

export const apiRouter = {
  public: {
    content: {
      bootstrap: contentBootstrap,
      home: contentListingsRouter.home,
      posts: { list: contentListingsRouter.postsList, bySlug: contentDetailRouter.postBySlug },
      pages: { bySlug: contentDetailRouter.pageBySlug },
      comments: { byKey: contentCommentsByKey },
      search: contentListingsRouter.search,
      categories: { list: contentListingsRouter.categoriesList },
      archives: contentListingsRouter.archives,
    },
    comments: { ...commentsPublicRouter, ...commentsOwnRouter, ...commentsTokenRouter },
    likes: likesRouter,
    friends: friendsRouter,
    notifications: notificationsRouter,
    newsletter: newsletterRouter,
    webmentions: webmentionPublicRouter,
    avatar: avatarRouter,
    github: githubRouter,
    images: imageRouter,
    music: musicRouter,
    branding: brandingRouter,
    fonts: fontsRouter,
    storage: storageRouter,
    analytics: publicAnalyticsRouter,
    observability: publicObservabilityRouter,
    feeds: feedsRouter,
    sitemap: sitemapRouter,
  },
  account: {
    ...accountRouter,
    auth: authRouter,
    setup: setupRouter,
    comments: commentsAuthedRouter,
    passkey: passkeyRouter,
  },
  admin: {
    users: { ...adminUsersCrudRouter, ...adminUsersAdminRouter, ...adminUsersSessionsRouter },
    auditLog: auditLogRouter,
    settings: adminSettingsRouter,
    storage: adminStorageRouter,
    cache: adminCacheRouter,
    mail: adminMailRouter,
    friends: adminFriendsRouter,
    categories: adminCategoriesRouter,
    tags: adminTagsRouter,
    images: adminImagesRouter,
    jobs: adminJobsRouter,
    music: adminMusicRouter,
    notifications: adminNotificationsRouter,
    observability: adminObservabilityRouter,
    pages: adminPagesRouter,
    posts: adminPostsRouter,
    renders: adminRendersRouter,
    comments: adminCommentsRouter,
    backup: adminBackupRouter,
    branding: adminBrandingRouter,
    fonts: adminFontsRouter,
    geoip: adminGeoipRouter,
    webmentions: adminWebmentionsRouter,
    update: adminUpdateRouter,
    analytics: analyticsRouter,
  },
} satisfies ContractImplementation<typeof apiContract>

export type ApiRouter = typeof apiRouter
