import { getGeoipDbStatus, runRemoteGeoipUpdate } from '@kobato/server/domains/analytics/geoip-update'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { adminProc } from '@kobato/server/http/orpc-base'
import { z } from 'zod'

const statusDto = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  source: z.enum(['upload', 'remote']).nullable(),
  updatedAt: z.string().nullable(),
})

const updateResultDto = z.object({
  status: z.enum(['updated', 'up-to-date']),
  version: z.string(),
  previousVersion: z.string().nullable(),
})

const status = adminProc
  .route({ method: 'GET', path: '/admin/geoip/status' })
  .input(z.object({}))
  .output(statusDto)
  .handler(() => getGeoipDbStatus())

const update = adminProc
  .route({ method: 'POST', path: '/admin/geoip/update' })
  .input(z.object({}))
  .output(updateResultDto)
  .handler(async ({ context }) => {
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

export const adminGeoipRouter = { status, update }
