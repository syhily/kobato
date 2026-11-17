import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { getUpdateJobStatus } from '@kobato/server/domains/update/job.ts'
import { applyUpdate, checkForUpdate } from '@kobato/server/domains/update/service.ts'
import { adminProc } from '@kobato/server/http/orpc-base.ts'
import { updateCheckResultDto, updateJobStatusDto } from '@kobato/shared/contracts/update.ts'
import { z } from 'zod'

const check = adminProc
  .route({ method: 'GET', path: '/admin/update/check' })
  .input(z.object({}))
  .output(updateCheckResultDto)
  .handler(() => checkForUpdate())

const apply = adminProc
  .route({ method: 'POST', path: '/admin/update/apply' })
  .input(z.object({}))
  .output(z.object({ fromVersion: z.string(), toVersion: z.string() }))
  .handler(async ({ context }) => {
    const result = await applyUpdate()
    recordAuditEventFromContext(context, {
      action: 'system_updated',
      resourceType: 'system',
      details: { fromVersion: result.fromVersion, toVersion: result.toVersion },
    })
    return result
  })

const status = adminProc
  .route({ method: 'GET', path: '/admin/update/status' })
  .input(z.object({}))
  .output(updateJobStatusDto)
  .handler(({ context }) => getUpdateJobStatus(context.localization.locale))

export const adminUpdateRouter = { check, apply, status }
