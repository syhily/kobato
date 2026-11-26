import { publicAnalyticsContract } from '@kobato/api/rpc/public/analytics'
import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { brandingContract } from '@kobato/api/rpc/public/branding'
import { commentsContract } from '@kobato/api/rpc/public/comments'
import { contentContract } from '@kobato/api/rpc/public/content'
import { feedsContract } from '@kobato/api/rpc/public/feeds'
import { fontsContract } from '@kobato/api/rpc/public/fonts'
import { friendsContract } from '@kobato/api/rpc/public/friends'
import { githubContract } from '@kobato/api/rpc/public/github'
import { imagesContract } from '@kobato/api/rpc/public/images'
import { likesContract } from '@kobato/api/rpc/public/likes'
import { musicContract } from '@kobato/api/rpc/public/music'
import { newsletterContract } from '@kobato/api/rpc/public/newsletter'
import { notificationsContract } from '@kobato/api/rpc/public/notifications'
import { publicObservabilityContract } from '@kobato/api/rpc/public/observability'
import { sitemapContract } from '@kobato/api/rpc/public/sitemap'
import { storageContract } from '@kobato/api/rpc/public/storage'
import { webmentionsContract } from '@kobato/api/rpc/public/webmentions'

export const publicContract = {
  content: contentContract,
  comments: commentsContract,
  likes: likesContract,
  friends: friendsContract,
  notifications: notificationsContract,
  newsletter: newsletterContract,
  webmentions: webmentionsContract,
  avatar: avatarContract,
  github: githubContract,
  images: imagesContract,
  music: musicContract,
  branding: brandingContract,
  fonts: fontsContract,
  storage: storageContract,
  analytics: publicAnalyticsContract,
  observability: publicObservabilityContract,
  feeds: feedsContract,
  sitemap: sitemapContract,
}
