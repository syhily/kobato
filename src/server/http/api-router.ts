import { accountRouter } from '@/server/http/controllers/account.controller'
import { adminBackupRouter } from '@/server/http/controllers/admin/backup.controller'
import { adminCacheRouter } from '@/server/http/controllers/admin/cache.controller'
import { adminCategoriesRouter } from '@/server/http/controllers/admin/categories.controller'
import { adminCommentsRouter } from '@/server/http/controllers/admin/comments.controller'
import { adminFriendsRouter } from '@/server/http/controllers/admin/friends.controller'
import { adminImagesRouter } from '@/server/http/controllers/admin/images.controller'
import { adminMailRouter } from '@/server/http/controllers/admin/mail.controller'
import { adminMusicRouter } from '@/server/http/controllers/admin/music.controller'
import { adminPagesRouter } from '@/server/http/controllers/admin/pages.controller'
import { adminPostsRouter } from '@/server/http/controllers/admin/posts.controller'
import { adminRendersRouter } from '@/server/http/controllers/admin/renders.controller'
import { adminSettingsRouter } from '@/server/http/controllers/admin/settings.controller'
import { adminTagsRouter } from '@/server/http/controllers/admin/tags.controller'
import { adminUsersRouter } from '@/server/http/controllers/admin/users.controller'
import { analyticsRouter } from '@/server/http/controllers/analytics.controller'
import { commentsRouter } from '@/server/http/controllers/comments.controller'
import { imageRouter } from '@/server/http/controllers/image.controller'
import { musicRouter } from '@/server/http/controllers/music.controller'

// The composed oRPC router. The shape is the audit surface for the
// permission matrix — each leaf's guard comes from the base procedure
// it was built from (`publicProc / authedProc / adminProc / authorProc`
// in `src/server/http/orpc-base.ts`). Grep
// `grep -rn "adminProc\|authorProc" src/server/http/controllers/`
// to see every gated procedure in one shot.
export const apiRouter = {
  account: accountRouter,
  analytics: analyticsRouter,
  comments: commentsRouter,
  image: imageRouter,
  music: musicRouter,
  admin: {
    users: adminUsersRouter,
    settings: adminSettingsRouter,
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
  },
}

export type ApiRouter = typeof apiRouter
