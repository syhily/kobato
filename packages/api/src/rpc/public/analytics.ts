import { deviceEnvBeaconOutputSchema, deviceEnvBeaconSchema } from '@kobato/api/contracts/public/analytics'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const PUBLIC_ANALYTICS_RECORD_DEVICE_ENV_RPC_PATH = '/rpc/public/analytics/recordDeviceEnv'

export const publicAnalyticsContract = {
  recordDeviceEnv: defineProcedure(
    { method: 'POST', path: '/analytics/env' },
    {
      csrfExempt: true,
      requestBodyLimit: { maxBytes: 4 * 1024, messageKey: 'error.api.payloadTooLarge' },
      telemetryExcluded: true,
    },
  )
    .input(deviceEnvBeaconSchema)
    .output(deviceEnvBeaconOutputSchema),
}
