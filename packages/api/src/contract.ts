import { accountContract } from '@kobato/api/rpc/account'
import { adminAuditContract } from '@kobato/api/rpc/admin/audit'
import { adminBackupContract } from '@kobato/api/rpc/admin/backup'
import { adminCacheContract } from '@kobato/api/rpc/admin/cache'
import { adminCategoriesContract } from '@kobato/api/rpc/admin/categories'
import { adminCommentsContract } from '@kobato/api/rpc/admin/comments'
import { adminFontsContract } from '@kobato/api/rpc/admin/fonts'
import { adminFriendsContract } from '@kobato/api/rpc/admin/friends'
import { adminGeoipContract } from '@kobato/api/rpc/admin/geoip'
import { adminImagesContract } from '@kobato/api/rpc/admin/images'
import { adminJobsContract } from '@kobato/api/rpc/admin/jobs'
import { adminMailContract } from '@kobato/api/rpc/admin/mail'
import { adminMusicContract } from '@kobato/api/rpc/admin/music'
import { adminNotificationsContract } from '@kobato/api/rpc/admin/notifications'
import { adminObservabilityContract } from '@kobato/api/rpc/admin/observability'
import { adminPagesContract } from '@kobato/api/rpc/admin/pages'
import { adminPostsContract } from '@kobato/api/rpc/admin/posts'
import { adminRendersContract } from '@kobato/api/rpc/admin/renders'
import { adminSettingsContract } from '@kobato/api/rpc/admin/settings'
import { adminStorageContract } from '@kobato/api/rpc/admin/storage'
import { adminTagsContract } from '@kobato/api/rpc/admin/tags'
import { adminUpdateContract } from '@kobato/api/rpc/admin/update'
import { adminUsersContract } from '@kobato/api/rpc/admin/users'
import { adminWebmentionsContract } from '@kobato/api/rpc/admin/webmentions'
import { analyticsContract } from '@kobato/api/rpc/analytics'
import { avatarContract } from '@kobato/api/rpc/avatar'
import { commentsContract } from '@kobato/api/rpc/comments'
import { contentContract } from '@kobato/api/rpc/content'
import { friendsContract } from '@kobato/api/rpc/friends'
import { githubContract } from '@kobato/api/rpc/github'
import { imagesContract } from '@kobato/api/rpc/images'
import { likesContract } from '@kobato/api/rpc/likes'
import { musicContract } from '@kobato/api/rpc/music'
import { newsletterContract } from '@kobato/api/rpc/newsletter'
import { notificationsContract } from '@kobato/api/rpc/notifications'
import { passkeyContract } from '@kobato/api/rpc/passkey'
import { webmentionsContract } from '@kobato/api/rpc/webmentions'

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
