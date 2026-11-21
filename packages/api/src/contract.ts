import { accountContract } from '@kobato/api/account'
import { adminAuditContract } from '@kobato/api/admin/audit'
import { adminBackupContract } from '@kobato/api/admin/backup'
import { adminCacheContract } from '@kobato/api/admin/cache'
import { adminCategoriesContract } from '@kobato/api/admin/categories'
import { adminCommentsContract } from '@kobato/api/admin/comments'
import { adminFontsContract } from '@kobato/api/admin/fonts'
import { adminFriendsContract } from '@kobato/api/admin/friends'
import { adminGeoipContract } from '@kobato/api/admin/geoip'
import { adminImagesContract } from '@kobato/api/admin/images'
import { adminJobsContract } from '@kobato/api/admin/jobs'
import { adminMailContract } from '@kobato/api/admin/mail'
import { adminMusicContract } from '@kobato/api/admin/music'
import { adminNotificationsContract } from '@kobato/api/admin/notifications'
import { adminObservabilityContract } from '@kobato/api/admin/observability'
import { adminPagesContract } from '@kobato/api/admin/pages'
import { adminPostsContract } from '@kobato/api/admin/posts'
import { adminRendersContract } from '@kobato/api/admin/renders'
import { adminSettingsContract } from '@kobato/api/admin/settings'
import { adminStorageContract } from '@kobato/api/admin/storage'
import { adminTagsContract } from '@kobato/api/admin/tags'
import { adminUpdateContract } from '@kobato/api/admin/update'
import { adminUsersContract } from '@kobato/api/admin/users'
import { adminWebmentionsContract } from '@kobato/api/admin/webmentions'
import { analyticsContract } from '@kobato/api/analytics'
import { avatarContract } from '@kobato/api/avatar'
import { commentsContract } from '@kobato/api/comments'
import { contentContract } from '@kobato/api/content'
import { friendsContract } from '@kobato/api/friends'
import { githubContract } from '@kobato/api/github'
import { imagesContract } from '@kobato/api/images'
import { likesContract } from '@kobato/api/likes'
import { musicContract } from '@kobato/api/music'
import { newsletterContract } from '@kobato/api/newsletter'
import { notificationsContract } from '@kobato/api/notifications'
import { passkeyContract } from '@kobato/api/passkey'
import { webmentionsContract } from '@kobato/api/webmentions'

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
