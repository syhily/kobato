import { passkeyAuthBeginInputSchema, passkeyOptionsOutputSchema } from '@kobato/contracts/users.ts'
import { oc } from '@orpc/contract'

// The passkey RPC contract — the CSRF-less public challenge mint.
export const passkeyContract = {
  authBegin: oc
    .route({ method: 'POST', path: '/passkey/auth-begin' })
    .input(passkeyAuthBeginInputSchema)
    .output(passkeyOptionsOutputSchema),
}
