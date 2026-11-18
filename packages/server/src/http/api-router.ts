import { accountRouter } from '@kobato/server/http/controllers/account.controller.ts'
import { auditLogRouter } from '@kobato/server/http/controllers/admin/audit.controller.ts'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller.ts'
import { adminCacheRouter } from '@kobato/server/http/controllers/admin/cache.controller.ts'
import { adminCategoriesRouter } from '@kobato/server/http/controllers/admin/categories.controller.ts'
import { adminCommentsRouter } from '@kobato/server/http/controllers/admin/comments.controller.ts'
import { adminFontsRouter } from '@kobato/server/http/controllers/admin/fonts.controller.ts'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller.ts'
import { adminGeoipRouter } from '@kobato/server/http/controllers/admin/geoip.controller.ts'
import { adminImagesRouter } from '@kobato/server/http/controllers/admin/images.controller.ts'
import { adminJobsRouter } from '@kobato/server/http/controllers/admin/jobs.controller.ts'
import { adminMailRouter } from '@kobato/server/http/controllers/admin/mail.controller.ts'
import { adminMusicRouter } from '@kobato/server/http/controllers/admin/music.controller.ts'
import { adminNotificationsRouter } from '@kobato/server/http/controllers/admin/notifications.controller.ts'
import { adminObservabilityRouter } from '@kobato/server/http/controllers/admin/observability.controller.ts'
import { adminPagesRouter } from '@kobato/server/http/controllers/admin/pages.controller.ts'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller.ts'
import { adminRendersRouter } from '@kobato/server/http/controllers/admin/renders.controller.ts'
import { adminSettingsRouter } from '@kobato/server/http/controllers/admin/settings.controller.ts'
import { adminStorageRouter } from '@kobato/server/http/controllers/admin/storage.controller.ts'
import { adminTagsRouter } from '@kobato/server/http/controllers/admin/tags.controller.ts'
import { adminUpdateRouter } from '@kobato/server/http/controllers/admin/update.controller.ts'
import { adminUsersAdminRouter } from '@kobato/server/http/controllers/admin/users-admin.controller.ts'
import { adminUsersCrudRouter } from '@kobato/server/http/controllers/admin/users-crud.controller.ts'
import { adminUsersSessionsRouter } from '@kobato/server/http/controllers/admin/users-sessions.controller.ts'
import { adminWebmentionsRouter } from '@kobato/server/http/controllers/admin/webmentions.controller.ts'
import { analyticsRouter } from '@kobato/server/http/controllers/analytics.controller.ts'
import { avatarRouter } from '@kobato/server/http/controllers/avatar.controller.ts'
import { commentsAuthedRouter } from '@kobato/server/http/controllers/comments-authed.controller.ts'
import { commentsPublicRouter } from '@kobato/server/http/controllers/comments-public.controller.ts'
import { commentsTokenRouter } from '@kobato/server/http/controllers/comments-token.controller.ts'
import { contentBootstrap } from '@kobato/server/http/controllers/content-bootstrap.controller.ts'
import { contentCommentsByKey } from '@kobato/server/http/controllers/content-comments.controller.ts'
import { contentDetailRouter } from '@kobato/server/http/controllers/content-detail.controller.ts'
import { contentListingsRouter } from '@kobato/server/http/controllers/content-listings.controller.ts'
import { friendsPublicRouter } from '@kobato/server/http/controllers/friends-public.controller.ts'
import { githubRouter } from '@kobato/server/http/controllers/github.controller.ts'
import { imageRouter } from '@kobato/server/http/controllers/image.controller.ts'
import { likesRouter } from '@kobato/server/http/controllers/likes.controller.ts'
import { musicRouter } from '@kobato/server/http/controllers/music.controller.ts'
import { newsletterPublicRouter } from '@kobato/server/http/controllers/newsletter-public.controller.ts'
import { notificationsRouter } from '@kobato/server/http/controllers/notifications.controller.ts'
import { passkeyPublicRouter } from '@kobato/server/http/controllers/passkey-public.controller.ts'
import { webmentionPublicRouter } from '@kobato/server/http/controllers/webmention-public.controller.ts'

// The composed router shape is the permission-matrix audit surface
// (grep adminProc/authorProc under src/server/http/controllers/).
export const apiRouter = {
  account: accountRouter,
  analytics: analyticsRouter,
  avatar: avatarRouter,
  github: githubRouter,
  comments: { ...commentsPublicRouter, ...commentsAuthedRouter, ...commentsTokenRouter },
  // Ghost-Content-API-style read-only group — consumed in-process by the SSR loaders, headless via `/rpc/content/*`.
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
