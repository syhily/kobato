import {
  observabilityProvisionInputSchema,
  observabilityProvisionOutputSchema,
  observabilityStatusInputSchema,
  observabilityStatusOutputSchema,
  observabilityTestConnectionInputSchema,
  observabilityTestConnectionOutputSchema,
} from '@kobato/api/contracts/admin/observability'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminObservabilityContract = {
  testConnection: defineProcedure({ method: 'POST', path: '/admin/observability/test-connection' })
    .input(observabilityTestConnectionInputSchema)
    .output(observabilityTestConnectionOutputSchema),
  provision: defineProcedure({ method: 'POST', path: '/admin/observability/provision' })
    .input(observabilityProvisionInputSchema)
    .output(observabilityProvisionOutputSchema),
  status: defineProcedure({ method: 'GET', path: '/admin/observability/status' })
    .input(observabilityStatusInputSchema)
    .output(observabilityStatusOutputSchema),
}
