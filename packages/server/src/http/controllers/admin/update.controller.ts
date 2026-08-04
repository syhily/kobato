import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { getUpdateJobStatus } from '@kobato/server/domains/update/job'
import { applyUpdate, checkForUpdate } from '@kobato/server/domains/update/service'
import { adminProc } from '@kobato/server/http/orpc-base'
import { updateCheckResultDto, updateJobStatusDto } from '@kobato/shared/contracts/update'
import { z } from 'zod'

const check = adminProc
  .route({ method: 'GET', path: '/admin/update/check' })
  .input(z.object({}))
  .output(updateCheckResultDto)
  .handler(({ context }) => checkForUpdate(context.db))

const apply = adminProc
  .route({ method: 'POST', path: '/admin/update/apply' })
  .input(z.object({}))
  .output(z.object({ fromVersion: z.string(), toVersion: z.string() }))
  .handler(async ({ context }) => {
    const result = await applyUpdate(context.db)
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
  .handler(() => getUpdateJobStatus())

export const adminUpdateRouter = { check, apply, status }
