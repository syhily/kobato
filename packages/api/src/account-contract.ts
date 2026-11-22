import { accountAuthContract } from '@kobato/api/rpc/account/auth'
import { commentsAuthedContract } from '@kobato/api/rpc/account/comments'
import { friendsContract } from '@kobato/api/rpc/account/friends'
import { likesContract } from '@kobato/api/rpc/account/likes'
import { newsletterContract } from '@kobato/api/rpc/account/newsletter'
import { notificationsContract } from '@kobato/api/rpc/account/notifications'
import { passkeyContract } from '@kobato/api/rpc/account/passkey'
import { accountSelfContract } from '@kobato/api/rpc/account/self'
import { accountSetupContract } from '@kobato/api/rpc/account/setup'

export const accountContract = {
  ...accountSelfContract,
  auth: accountAuthContract,
  setup: accountSetupContract,
  comments: commentsAuthedContract,
  notifications: notificationsContract,
  passkey: passkeyContract,
  likes: likesContract,
  friends: friendsContract,
  newsletter: newsletterContract,
}
