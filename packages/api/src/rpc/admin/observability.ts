import {
  observabilityProvisionInputSchema,
  observabilityProvisionOutputSchema,
  observabilityStatusInputSchema,
  observabilityStatusOutputSchema,
  observabilityTestConnectionInputSchema,
  observabilityTestConnectionOutputSchema,
} from '@kobato/api/contracts/observability'
import { oc } from '@orpc/contract'

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
