import { authFlowOutputSchema, passkeyAuthFinishInput } from '@kobato/api/contracts/account/auth'
import { passkeyAuthBeginInputSchema, passkeyOptionsOutputSchema } from '@kobato/api/contracts/account/passkey'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const passkeyContract = {
  authBegin: defineProcedure({ method: 'POST', path: '/passkey/auth-begin' })
    .input(passkeyAuthBeginInputSchema)
    .output(passkeyOptionsOutputSchema),
  authFinish: defineProcedure({ method: 'POST', path: '/passkey/auth-finish' })
    .input(passkeyAuthFinishInput)
    .output(authFlowOutputSchema),
}
