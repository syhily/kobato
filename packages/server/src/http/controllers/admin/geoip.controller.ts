import { adminGeoipContract } from '@kobato/api/admin/geoip.ts'
import { getGeoipDbStatus, runRemoteGeoipUpdate } from '@kobato/server/domains/analytics/geoip/update.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'

const impl = implementAdmin(adminGeoipContract)

const status = impl.status.handler(() => getGeoipDbStatus())

const update = impl.update.handler(async ({ context }) => {
  const result = await runRemoteGeoipUpdate()
  if (result.status === 'updated') {
    recordAuditEventFromContext(context, {
      action: 'maxmind_remote_updated',
      resourceType: 'maxmind',
      resourceId: 'geolite2-city',
      details: { fromVersion: result.previousVersion, toVersion: result.version },
    })
  }
  return result
})

export const adminGeoipRouter = impl.router({ status, update })
