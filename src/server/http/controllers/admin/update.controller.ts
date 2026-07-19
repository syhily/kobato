import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { applyUpdate, checkForUpdate, getUpdateJobStatus } from '@/server/domains/update/service'
import { adminProc } from '@/server/http/orpc-base'
import { updateCheckResultDto, updateJobStatusDto } from '@/shared/contracts/update'

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
  .handler(() => getUpdateJobStatus())

export const adminUpdateRouter = { check, apply, status }
