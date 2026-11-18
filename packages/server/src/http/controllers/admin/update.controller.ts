import { adminUpdateContract } from '@kobato/api/admin/update.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { getUpdateJobStatus } from '@kobato/server/domains/update/job.ts'
import { applyUpdate, checkForUpdate } from '@kobato/server/domains/update/service.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in
// `@kobato/api/admin/update.ts`; this controller only implements the
// procedures (admin base).
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
