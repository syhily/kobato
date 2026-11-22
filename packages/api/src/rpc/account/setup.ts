import { authFlowOutputSchema } from '@kobato/api/contracts/auth'
import {
  setupInstallInput,
  setupStatusInput,
  setupStatusOutputSchema,
  setupVerifyTokenInput,
  setupVerifyTokenOutputSchema,
} from '@kobato/api/contracts/setup'
import { oc } from '@orpc/contract'

export const accountSetupContract = {
  status: oc.route({ method: 'GET', path: '/setup/status' }).input(setupStatusInput).output(setupStatusOutputSchema),
  verifyToken: oc
    .route({ method: 'POST', path: '/setup/verify-token' })
    .input(setupVerifyTokenInput)
    .output(setupVerifyTokenOutputSchema),
  install: oc.route({ method: 'POST', path: '/setup/install' }).input(setupInstallInput).output(authFlowOutputSchema),
}
