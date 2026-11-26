import {
  publicRumStatusInputSchema,
  publicRumStatusOutputSchema,
  rumIntakeInputSchema,
  rumIntakeOutputSchema,
} from '@kobato/api/contracts/public/observability'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const publicObservabilityContract = {
  rumStatus: defineProcedure(
    { method: 'GET', path: '/rum/status' },
    { publicRead: true, installGateExempt: true, telemetryExcluded: true },
  )
    .input(publicRumStatusInputSchema)
    .output(publicRumStatusOutputSchema),
  rumIntake: defineProcedure(
    { method: 'POST', path: '/api/rum/intake/*' },
    {
      csrfExempt: true,
      installGateExempt: true,
      telemetryExcluded: true,
      requestBodyLimit: { maxBytes: 2 * 1024 * 1024, messageKey: 'error.api.payloadTooLarge' },
    },
  )
    .input(rumIntakeInputSchema)
    .output(rumIntakeOutputSchema),
}
