import { accountRouter } from '@kobato/server/http/controllers/account.controller'
import { auditLogRouter } from '@kobato/server/http/controllers/admin/audit.controller'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
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
import { analyticsRouter } from '@kobato/server/http/controllers/analytics.controller'
import { avatarRouter } from '@kobato/server/http/controllers/avatar.controller'
import { commentsAuthedRouter } from '@kobato/server/http/controllers/comments-authed.controller'
import { commentsPublicRouter } from '@kobato/server/http/controllers/comments-public.controller'
import { commentsTokenRouter } from '@kobato/server/http/controllers/comments-token.controller'
import { contentBootstrap } from '@kobato/server/http/controllers/content-bootstrap.controller'
import { contentCommentsByKey } from '@kobato/server/http/controllers/content-comments.controller'
import { contentDetailRouter } from '@kobato/server/http/controllers/content-detail.controller'
import { contentListingsRouter } from '@kobato/server/http/controllers/content-listings.controller'
import { friendsPublicRouter } from '@kobato/server/http/controllers/friends-public.controller'
import { githubRouter } from '@kobato/server/http/controllers/github.controller'
import { imageRouter } from '@kobato/server/http/controllers/image.controller'
import { likesRouter } from '@kobato/server/http/controllers/likes.controller'
import { musicRouter } from '@kobato/server/http/controllers/music.controller'
import { newsletterPublicRouter } from '@kobato/server/http/controllers/newsletter-public.controller'
import { notificationsRouter } from '@kobato/server/http/controllers/notifications.controller'
import { passkeyPublicRouter } from '@kobato/server/http/controllers/passkey-public.controller'
import { webmentionPublicRouter } from '@kobato/server/http/controllers/webmention-public.controller'

export const apiRouter = {
  account: accountRouter,
  analytics: analyticsRouter,
  avatar: avatarRouter,
  github: githubRouter,
  comments: { ...commentsPublicRouter, ...commentsAuthedRouter, ...commentsTokenRouter },
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
  friends: friendsPublicRouter,
  images: imageRouter,
  likes: likesRouter,
  music: musicRouter,
  newsletter: newsletterPublicRouter,
  notifications: notificationsRouter,
  passkey: passkeyPublicRouter,
  webmentions: webmentionPublicRouter,
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
    fonts: adminFontsRouter,
    geoip: adminGeoipRouter,
    webmentions: adminWebmentionsRouter,
    update: adminUpdateRouter,
  },
}

export type ApiRouter = typeof apiRouter
