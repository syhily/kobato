import { authFlowOutputSchema } from '@kobato/api/contracts/account/auth'
import {
  setupInstallInput,
  setupStatusInput,
  setupStatusOutputSchema,
  setupVerifyTokenInput,
  setupVerifyTokenOutputSchema,
} from '@kobato/api/contracts/account/setup'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const accountSetupContract = {
  status: defineProcedure({ method: 'GET', path: '/setup/status' })
    .input(setupStatusInput)
    .output(setupStatusOutputSchema),
  verifyToken: defineProcedure({ method: 'POST', path: '/setup/verify-token' })
    .input(setupVerifyTokenInput)
    .output(setupVerifyTokenOutputSchema),
  install: defineProcedure({ method: 'POST', path: '/setup/install' })
    .input(setupInstallInput)
    .output(authFlowOutputSchema),
}
