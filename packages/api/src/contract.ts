import { accountContract } from '@kobato/api/account.ts'
import { adminAuditContract } from '@kobato/api/admin/audit.ts'
import { adminBackupContract } from '@kobato/api/admin/backup.ts'
import { adminCacheContract } from '@kobato/api/admin/cache.ts'
import { adminCategoriesContract } from '@kobato/api/admin/categories.ts'
import { adminCommentsContract } from '@kobato/api/admin/comments.ts'
import { adminFontsContract } from '@kobato/api/admin/fonts.ts'
import { adminFriendsContract } from '@kobato/api/admin/friends.ts'
import { adminGeoipContract } from '@kobato/api/admin/geoip.ts'
import { adminImagesContract } from '@kobato/api/admin/images.ts'
import { adminJobsContract } from '@kobato/api/admin/jobs.ts'
import { adminMailContract } from '@kobato/api/admin/mail.ts'
import { adminMusicContract } from '@kobato/api/admin/music.ts'
import { adminNotificationsContract } from '@kobato/api/admin/notifications.ts'
import { adminObservabilityContract } from '@kobato/api/admin/observability.ts'
import { adminPagesContract } from '@kobato/api/admin/pages.ts'
import { adminPostsContract } from '@kobato/api/admin/posts.ts'
import { adminRendersContract } from '@kobato/api/admin/renders.ts'
import { adminSettingsContract } from '@kobato/api/admin/settings.ts'
import { adminStorageContract } from '@kobato/api/admin/storage.ts'
import { adminTagsContract } from '@kobato/api/admin/tags.ts'
import { adminUpdateContract } from '@kobato/api/admin/update.ts'
import { adminUsersContract } from '@kobato/api/admin/users.ts'
import { adminWebmentionsContract } from '@kobato/api/admin/webmentions.ts'
import { analyticsContract } from '@kobato/api/analytics.ts'
import { avatarContract } from '@kobato/api/avatar.ts'
import { commentsContract } from '@kobato/api/comments.ts'
import { contentContract } from '@kobato/api/content.ts'
import { friendsContract } from '@kobato/api/friends.ts'
import { githubContract } from '@kobato/api/github.ts'
import { imagesContract } from '@kobato/api/images.ts'
import { likesContract } from '@kobato/api/likes.ts'
import { musicContract } from '@kobato/api/music.ts'
import { newsletterContract } from '@kobato/api/newsletter.ts'
import { notificationsContract } from '@kobato/api/notifications.ts'
import { passkeyContract } from '@kobato/api/passkey.ts'
import { webmentionsContract } from '@kobato/api/webmentions.ts'

export const apiContract = {
  account: accountContract,
  analytics: analyticsContract,
  avatar: avatarContract,
  github: githubContract,
  comments: commentsContract,
  content: contentContract,
  friends: friendsContract,
  images: imagesContract,
  likes: likesContract,
  music: musicContract,
  newsletter: newsletterContract,
  notifications: notificationsContract,
  passkey: passkeyContract,
  webmentions: webmentionsContract,
  admin: {
    users: adminUsersContract,
    auditLog: adminAuditContract,
    settings: adminSettingsContract,
    storage: adminStorageContract,
    cache: adminCacheContract,
    mail: adminMailContract,
    friends: adminFriendsContract,
    categories: adminCategoriesContract,
    tags: adminTagsContract,
    images: adminImagesContract,
    jobs: adminJobsContract,
    music: adminMusicContract,
    notifications: adminNotificationsContract,
    observability: adminObservabilityContract,
    pages: adminPagesContract,
    posts: adminPostsContract,
    renders: adminRendersContract,
    comments: adminCommentsContract,
    backup: adminBackupContract,
    fonts: adminFontsContract,
    geoip: adminGeoipContract,
    webmentions: adminWebmentionsContract,
    update: adminUpdateContract,
  },
}
