import { authFlowOutputSchema, passkeyAuthFinishInput } from '@kobato/api/contracts/auth'
import { passkeyAuthBeginInputSchema, passkeyOptionsOutputSchema } from '@kobato/api/contracts/users'
import { oc } from '@orpc/contract'

export const passkeyContract = {
  authBegin: oc
    .route({ method: 'POST', path: '/passkey/auth-begin' })
    .input(passkeyAuthBeginInputSchema)
    .output(passkeyOptionsOutputSchema),
  authFinish: oc
    .route({ method: 'POST', path: '/passkey/auth-finish' })
    .input(passkeyAuthFinishInput)
    .output(authFlowOutputSchema),
}
