import { accountContract } from '@kobato/api/account-contract'
import { adminContract } from '@kobato/api/admin-contract'
import { publicContract } from '@kobato/api/public-contract'

export const apiContract = {
  public: publicContract,
  account: accountContract,
  admin: adminContract,
}
