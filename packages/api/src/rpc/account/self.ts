import {
  accountPasskeyDeleteInput,
  accountPasskeyListOutputSchema,
  accountPasskeyRegisterBeginInput,
  accountPasskeyRegisterBeginOutputSchema,
  accountPasskeyRegisterFinishInput,
} from '@kobato/api/contracts/account/passkey'
import {
  accountProfileOutputSchema,
  accountRevokeSessionInput,
  accountRevokeSessionOutputSchema,
  accountSessionsOutputSchema,
  accountSetLoginMethodInput,
  accountUpdatePasswordInput,
  accountUpdateProfileInput,
  accountUpdateProfileOutputSchema,
} from '@kobato/api/contracts/account/self'
import { successDto } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const accountSelfContract = {
  profile: defineProcedure({ method: 'GET', path: '/account/profile' }).output(accountProfileOutputSchema),
  sessions: defineProcedure({ method: 'GET', path: '/account/sessions' }).output(accountSessionsOutputSchema),
  updateProfile: defineProcedure({ method: 'POST', path: '/account/update-profile' })
    .input(accountUpdateProfileInput)
    .output(accountUpdateProfileOutputSchema),
  updatePassword: defineProcedure({ method: 'POST', path: '/account/update-password' })
    .input(accountUpdatePasswordInput)
    .output(successDto),
  revokeSession: defineProcedure({ method: 'POST', path: '/account/revoke-session' })
    .input(accountRevokeSessionInput)
    .output(accountRevokeSessionOutputSchema),
  passkeyList: defineProcedure({ method: 'GET', path: '/account/passkeys' }).output(accountPasskeyListOutputSchema),
  passkeyRegisterBegin: defineProcedure({ method: 'POST', path: '/account/passkeys/register-begin' })
    .input(accountPasskeyRegisterBeginInput)
    .output(accountPasskeyRegisterBeginOutputSchema),
  passkeyRegisterFinish: defineProcedure({ method: 'POST', path: '/account/passkeys/register-finish' })
    .input(accountPasskeyRegisterFinishInput)
    .output(successDto),
  passkeyDelete: defineProcedure({ method: 'POST', path: '/account/passkeys/delete' })
    .input(accountPasskeyDeleteInput)
    .output(successDto),
  setLoginMethod: defineProcedure({ method: 'POST', path: '/account/login-method' })
    .input(accountSetLoginMethodInput)
    .output(successDto),
}
