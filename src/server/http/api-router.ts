import { accountRouter } from '@/server/http/controllers/account.controller'
import { auditLogRouter } from '@/server/http/controllers/admin/audit.controller'
import { adminBackupRouter } from '@/server/http/controllers/admin/backup.controller'
import { adminCacheRouter } from '@/server/http/controllers/admin/cache.controller'
import { adminCategoriesRouter } from '@/server/http/controllers/admin/categories.controller'
import { adminCommentsRouter } from '@/server/http/controllers/admin/comments.controller'
import { adminFontsRouter } from '@/server/http/controllers/admin/fonts.controller'
import { adminFriendsRouter } from '@/server/http/controllers/admin/friends.controller'
import { adminGeoipRouter } from '@/server/http/controllers/admin/geoip.controller'
import { adminImagesRouter } from '@/server/http/controllers/admin/images.controller'
import { adminMailRouter } from '@/server/http/controllers/admin/mail.controller'
import { adminMusicRouter } from '@/server/http/controllers/admin/music.controller'
import { adminPagesRouter } from '@/server/http/controllers/admin/pages.controller'
import { adminPostsRouter } from '@/server/http/controllers/admin/posts.controller'
import { adminRendersRouter } from '@/server/http/controllers/admin/renders.controller'
import { adminSettingsRouter } from '@/server/http/controllers/admin/settings.controller'
import { adminStorageRouter } from '@/server/http/controllers/admin/storage.controller'
import { adminTagsRouter } from '@/server/http/controllers/admin/tags.controller'
import { adminUpdateRouter } from '@/server/http/controllers/admin/update.controller'
import { adminUsersAdminRouter } from '@/server/http/controllers/admin/users-admin.controller'
import { adminUsersCrudRouter } from '@/server/http/controllers/admin/users-crud.controller'
import { adminUsersSessionsRouter } from '@/server/http/controllers/admin/users-sessions.controller'
import { adminWebmentionsRouter } from '@/server/http/controllers/admin/webmentions.controller'
import { analyticsRouter } from '@/server/http/controllers/analytics.controller'
import { avatarRouter } from '@/server/http/controllers/avatar.controller'
import { commentsAuthedRouter } from '@/server/http/controllers/comments-authed.controller'
import { commentsPublicRouter } from '@/server/http/controllers/comments-public.controller'
import { commentsTokenRouter } from '@/server/http/controllers/comments-token.controller'
import { contentBootstrap } from '@/server/http/controllers/content-bootstrap.controller'
import { contentCommentsByKey } from '@/server/http/controllers/content-comments.controller'
import { contentDetailRouter } from '@/server/http/controllers/content-detail.controller'
import { contentListingsRouter } from '@/server/http/controllers/content-listings.controller'
import { friendsPublicRouter } from '@/server/http/controllers/friends-public.controller'
import { githubRouter } from '@/server/http/controllers/github.controller'
import { imageRouter } from '@/server/http/controllers/image.controller'
import { likesRouter } from '@/server/http/controllers/likes.controller'
import { musicRouter } from '@/server/http/controllers/music.controller'
import { newsletterPublicRouter } from '@/server/http/controllers/newsletter-public.controller'
import { passkeyPublicRouter } from '@/server/http/controllers/passkey-public.controller'
import { webmentionPublicRouter } from '@/server/http/controllers/webmention-public.controller'

// The composed oRPC router — its shape is the permission-matrix audit surface
// (grep -rn "adminProc\|authorProc" src/server/http/controllers/).
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
    music: adminMusicRouter,
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
