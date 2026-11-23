import { publicRumStatusInputSchema, publicRumStatusOutputSchema } from '@kobato/api/contracts/public/observability'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const publicObservabilityContract = {
  rumStatus: defineProcedure(
    { method: 'GET', path: '/rum/status' },
    { publicRead: true, installGateExempt: true, telemetryExcluded: true },
  )
    .input(publicRumStatusInputSchema)
    .output(publicRumStatusOutputSchema),
}
