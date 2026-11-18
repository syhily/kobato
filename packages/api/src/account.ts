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
} from '@kobato/contracts/admin.ts'
import { successDto } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// The account RPC contract — the single source of each procedure's HTTP route
// and wire schemas. Route paths are the deployed surface; the server controller
// implements these procedures and owns no schema or route of its own.
export const accountContract = {
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
