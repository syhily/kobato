import { accountAuthContract } from '@kobato/api/rpc/account/auth'
import { commentsAuthedContract } from '@kobato/api/rpc/account/comments'
import { passkeyContract } from '@kobato/api/rpc/account/passkey'
import { accountSelfContract } from '@kobato/api/rpc/account/self'
import { accountSetupContract } from '@kobato/api/rpc/account/setup'

export const accountContract = {
  ...accountSelfContract,
  auth: accountAuthContract,
  setup: accountSetupContract,
  comments: commentsAuthedContract,
  passkey: passkeyContract,
}
