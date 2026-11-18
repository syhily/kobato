import {
  observabilityProvisionInputSchema,
  observabilityProvisionOutputSchema,
  observabilityStatusInputSchema,
  observabilityStatusOutputSchema,
  observabilityTestConnectionInputSchema,
  observabilityTestConnectionOutputSchema,
} from '@kobato/contracts/observability.ts'
import { oc } from '@orpc/contract'

// Admin observability RPC contract — admin base on the server. Connection
// test, (re)provisioning and the read-only status projection.
export const adminObservabilityContract = {
  testConnection: oc
    .route({ method: 'POST', path: '/admin/observability/test-connection' })
    .input(observabilityTestConnectionInputSchema)
    .output(observabilityTestConnectionOutputSchema),
  provision: oc
    .route({ method: 'POST', path: '/admin/observability/provision' })
    .input(observabilityProvisionInputSchema)
    .output(observabilityProvisionOutputSchema),
  status: oc
    .route({ method: 'GET', path: '/admin/observability/status' })
    .input(observabilityStatusInputSchema)
    .output(observabilityStatusOutputSchema),
}
