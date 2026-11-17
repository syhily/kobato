import { accountRouter } from './controllers/account.controller'
import { auditLogRouter } from './controllers/admin/audit.controller'
import { adminBackupRouter } from './controllers/admin/backup.controller'
import { adminCacheRouter } from './controllers/admin/cache.controller'
import { adminCategoriesRouter } from './controllers/admin/categories.controller'
import { adminCommentsRouter } from './controllers/admin/comments.controller'
import { adminFontsRouter } from './controllers/admin/fonts.controller'
import { adminFriendsRouter } from './controllers/admin/friends.controller'
import { adminGeoipRouter } from './controllers/admin/geoip.controller'
import { adminImagesRouter } from './controllers/admin/images.controller'
import { adminJobsRouter } from './controllers/admin/jobs.controller'
import { adminMailRouter } from './controllers/admin/mail.controller'
import { adminMusicRouter } from './controllers/admin/music.controller'
import { adminNotificationsRouter } from './controllers/admin/notifications.controller'
import { adminObservabilityRouter } from './controllers/admin/observability.controller'
import { adminPagesRouter } from './controllers/admin/pages.controller'
import { adminPostsRouter } from './controllers/admin/posts.controller'
import { adminRendersRouter } from './controllers/admin/renders.controller'
import { adminSettingsRouter } from './controllers/admin/settings.controller'
import { adminStorageRouter } from './controllers/admin/storage.controller'
import { adminTagsRouter } from './controllers/admin/tags.controller'
import { adminUpdateRouter } from './controllers/admin/update.controller'
import { adminUsersAdminRouter } from './controllers/admin/users-admin.controller'
import { adminUsersCrudRouter } from './controllers/admin/users-crud.controller'
import { adminUsersSessionsRouter } from './controllers/admin/users-sessions.controller'
import { adminWebmentionsRouter } from './controllers/admin/webmentions.controller'
import { analyticsRouter } from './controllers/analytics.controller'
import { avatarRouter } from './controllers/avatar.controller'
import { commentsAuthedRouter } from './controllers/comments-authed.controller'
import { commentsPublicRouter } from './controllers/comments-public.controller'
import { commentsTokenRouter } from './controllers/comments-token.controller'
import { contentBootstrap } from './controllers/content-bootstrap.controller'
import { contentCommentsByKey } from './controllers/content-comments.controller'
import { contentDetailRouter } from './controllers/content-detail.controller'
import { contentListingsRouter } from './controllers/content-listings.controller'
import { friendsPublicRouter } from './controllers/friends-public.controller'
import { githubRouter } from './controllers/github.controller'
import { imageRouter } from './controllers/image.controller'
import { likesRouter } from './controllers/likes.controller'
import { musicRouter } from './controllers/music.controller'
import { newsletterPublicRouter } from './controllers/newsletter-public.controller'
import { notificationsRouter } from './controllers/notifications.controller'
import { passkeyPublicRouter } from './controllers/passkey-public.controller'
import { webmentionPublicRouter } from './controllers/webmention-public.controller'

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
  image: imageRouter,
  likes: likesRouter,
  music: musicRouter,
  newsletter: newsletterPublicRouter,
  notifications: notificationsRouter,
  passkey: passkeyPublicRouter,
  webmention: webmentionPublicRouter,
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
