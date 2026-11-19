import { passkeyAuthBeginInputSchema, passkeyOptionsOutputSchema } from '@kobato/contracts/users.ts'
import { oc } from '@orpc/contract'

export const passkeyContract = {
  authBegin: oc
    .route({ method: 'POST', path: '/passkey/auth-begin' })
    .input(passkeyAuthBeginInputSchema)
    .output(passkeyOptionsOutputSchema),
}
