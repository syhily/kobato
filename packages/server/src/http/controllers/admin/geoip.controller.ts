import { adminGeoipContract } from '@kobato/api/rpc/admin/geoip'
import { getGeoipDbStatus, runRemoteGeoipUpdate } from '@kobato/server/domains/analytics/geoip/update'
import { uploadGeoipDatabase } from '@kobato/server/domains/analytics/geoip/upload'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('geoip.controller')

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

const upload = impl.upload.handler(async ({ input, context }) => {
  const result = await uploadGeoipDatabase(input.file)
  recordAuditEventFromContext(context, {
    action: 'maxmind_uploaded',
    resourceType: 'maxmind',
    resourceId: 'geolite2-city',
    details: { size: result.size },
  })
  log.info('MaxMind DB uploaded', { size: result.size })
  return result
})

export const adminGeoipRouter = impl.router({ status, update, upload })
