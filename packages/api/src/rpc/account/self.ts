import { successDto } from '@kobato/api/contracts/primitives'
import {
  accountPasskeyDeleteInput,
  accountPasskeyListOutputSchema,
  accountPasskeyRegisterBeginInput,
  accountPasskeyRegisterBeginOutputSchema,
  accountPasskeyRegisterFinishInput,
  accountProfileOutputSchema,
  accountRevokeSessionInput,
  accountRevokeSessionOutputSchema,
  accountSessionsOutputSchema,
  accountSetLoginMethodInput,
  accountUpdatePasswordInput,
  accountUpdateProfileInput,
  accountUpdateProfileOutputSchema,
} from '@kobato/api/contracts/users'
import { oc } from '@orpc/contract'

export const accountSelfContract = {
  profile: oc.route({ method: 'GET', path: '/account/profile' }).output(accountProfileOutputSchema),
  sessions: oc.route({ method: 'GET', path: '/account/sessions' }).output(accountSessionsOutputSchema),
  updateProfile: oc
    .route({ method: 'POST', path: '/account/update-profile' })
    .input(accountUpdateProfileInput)
    .output(accountUpdateProfileOutputSchema),
  updatePassword: oc
    .route({ method: 'POST', path: '/account/update-password' })
    .input(accountUpdatePasswordInput)
    .output(successDto),
  revokeSession: oc
    .route({ method: 'POST', path: '/account/revoke-session' })
    .input(accountRevokeSessionInput)
    .output(accountRevokeSessionOutputSchema),
  passkeyList: oc.route({ method: 'GET', path: '/account/passkeys' }).output(accountPasskeyListOutputSchema),
  passkeyRegisterBegin: oc
    .route({ method: 'POST', path: '/account/passkeys/register-begin' })
    .input(accountPasskeyRegisterBeginInput)
    .output(accountPasskeyRegisterBeginOutputSchema),
  passkeyRegisterFinish: oc
    .route({ method: 'POST', path: '/account/passkeys/register-finish' })
    .input(accountPasskeyRegisterFinishInput)
    .output(successDto),
  passkeyDelete: oc
    .route({ method: 'POST', path: '/account/passkeys/delete' })
    .input(accountPasskeyDeleteInput)
    .output(successDto),
  setLoginMethod: oc
    .route({ method: 'POST', path: '/account/login-method' })
    .input(accountSetLoginMethodInput)
    .output(successDto),
}
