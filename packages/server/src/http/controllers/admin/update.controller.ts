import { adminUpdateContract } from '@kobato/api/rpc/admin/update'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { getUpdateJobStatus } from '@kobato/server/domains/update/job'
import { applyUpdate, checkForUpdate } from '@kobato/server/domains/update/service'
import { implementAdmin } from '@kobato/server/http/orpc-base'

const impl = implementAdmin(adminUpdateContract)

const check = impl.check.handler(() => checkForUpdate())

const apply = impl.apply.handler(async ({ context }) => {
  const result = await applyUpdate()
  recordAuditEventFromContext(context, {
    action: 'system_updated',
    resourceType: 'system',
    details: { fromVersion: result.fromVersion, toVersion: result.toVersion },
  })
  return result
})

const status = impl.status.handler(({ context }) => getUpdateJobStatus(context.localization.locale))

export const adminUpdateRouter = impl.router({ check, apply, status })
