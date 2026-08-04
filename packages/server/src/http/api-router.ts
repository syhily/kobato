import { accountRouter } from '@kobato/server/http/controllers/account.controller'
import { adminApiKeyRouter } from '@kobato/server/http/controllers/admin/apikey.controller'
import { auditLogRouter } from '@kobato/server/http/controllers/admin/audit.controller'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { adminCacheRouter } from '@kobato/server/http/controllers/admin/cache.controller'
import { adminCategoriesRouter } from '@kobato/server/http/controllers/admin/categories.controller'
import { adminCommentsRouter } from '@kobato/server/http/controllers/admin/comments.controller'
import { adminFontsRouter } from '@kobato/server/http/controllers/admin/fonts.controller'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller'
import { adminGeoipRouter } from '@kobato/server/http/controllers/admin/geoip.controller'
import { adminImagesRouter } from '@kobato/server/http/controllers/admin/images.controller'
import { adminMailRouter } from '@kobato/server/http/controllers/admin/mail.controller'
import { adminMusicRouter } from '@kobato/server/http/controllers/admin/music.controller'
import { adminPagesRouter } from '@kobato/server/http/controllers/admin/pages.controller'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller'
import { adminPreviewTokenRouter } from '@kobato/server/http/controllers/admin/preview-token.controller'
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
import { contentPublicRouter } from '@kobato/server/http/controllers/content-public.controller'
import { friendsPublicRouter } from '@kobato/server/http/controllers/friends-public.controller'
import { githubRouter } from '@kobato/server/http/controllers/github.controller'
import { imageRouter } from '@kobato/server/http/controllers/image.controller'
import { likesRouter } from '@kobato/server/http/controllers/likes.controller'
import { musicRouter } from '@kobato/server/http/controllers/music.controller'
import { newsletterPublicRouter } from '@kobato/server/http/controllers/newsletter-public.controller'
import { passkeyPublicRouter } from '@kobato/server/http/controllers/passkey-public.controller'

// The composed oRPC router. The shape is the audit surface for the
// permission matrix — each leaf's guard comes from the base procedure
// it was built from (`publicProc / authedProc / adminProc / authorProc`
// in `src/server/http/orpc-base.ts`). Grep
// `grep -rn "adminProc\|authorProc" src/server/http/controllers/`
// to see every gated procedure in one shot.
export const apiRouter = {
  account: accountRouter,
  analytics: analyticsRouter,
  avatar: avatarRouter,
  github: githubRouter,
  comments: { ...commentsPublicRouter, ...commentsAuthedRouter, ...commentsTokenRouter },
  content: contentPublicRouter,
  friends: friendsPublicRouter,
  image: imageRouter,
  likes: likesRouter,
  music: musicRouter,
  newsletter: newsletterPublicRouter,
  passkey: passkeyPublicRouter,
  admin: {
    users: { ...adminUsersCrudRouter, ...adminUsersAdminRouter, ...adminUsersSessionsRouter },
    apikey: adminApiKeyRouter,
    previewToken: adminPreviewTokenRouter,
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
// `ApiRouter` type lives in `api-router.types.ts` — the single type-level
// exit for browser clients (see its header comment).
