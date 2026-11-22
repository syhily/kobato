import { analyticsContract } from '@kobato/api/rpc/admin/analytics'
import { adminAuditContract } from '@kobato/api/rpc/admin/audit'
import { adminBackupContract } from '@kobato/api/rpc/admin/backup'
import { adminBrandingContract } from '@kobato/api/rpc/admin/branding'
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

export const adminContract = {
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
  branding: adminBrandingContract,
  fonts: adminFontsContract,
  geoip: adminGeoipContract,
  webmentions: adminWebmentionsContract,
  update: adminUpdateContract,
  analytics: analyticsContract,
}
